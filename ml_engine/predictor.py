import os
import argparse
import duckdb
import pandas as pd
import numpy as np
import joblib
import shap
import warnings
import json
from ml_engine.feature_extractor import calculate_macro_drawdown, calculate_liquidity_gates, winsorize_series, extract_forensics

warnings.filterwarnings('ignore')

def run_inference(db_path, parquet_path):
    print(f"Running Inference on {db_path}...")
    
    model_dir = "ml_engine/models"
    try:
        acc_model = joblib.load(os.path.join(model_dir, "accountant.pkl"))
        str_model = joblib.load(os.path.join(model_dir, "strategist.pkl"))
        aud_model = joblib.load(os.path.join(model_dir, "auditor.pkl"))
        meta_model = joblib.load(os.path.join(model_dir, "meta_learner.pkl"))
    except Exception as e:
        print(f"Failed to load models: {e}. Run trainer.py first.")
        return

    base_fundamental_feats = ['pe_ratio', 'debt_to_equity', 'return_on_equity', 'equity_multiplier', 'sustainable_growth_rate', 'revenue_yoy', 'profit_yoy', 'operating_profit_margin', 'net_profit_margin', 'discount_from_high']
    fundamental_feats = [f"{feat}_z" for feat in base_fundamental_feats]
    momentum_feats = ['rs_rating', 'volatility_squeeze', 'inst_accum']
    forensic_feats = ['z_score', 'm_score', 'f_score', 'qes_flag', 'tax_divergence', 'pledge_delta']

    con = duckdb.connect(db_path)
    
    for col_statement in [
        "ALTER TABLE stocks ADD COLUMN alpha_score DOUBLE",
        "ALTER TABLE stocks ADD COLUMN shap_reason_1 VARCHAR",
        "ALTER TABLE stocks ADD COLUMN shap_reason_2 VARCHAR",
        "ALTER TABLE stocks ADD COLUMN shap_reason_3 VARCHAR",
        "ALTER TABLE stocks ADD COLUMN ml_confidence VARCHAR"
    ]:
        try:
            con.execute(col_statement)
        except:
            pass

    query = """
        SELECT 
            slug,
            industry,
            pe_ratio,
            CAST(json_extract_string(relative_data, '$.normalized_fundamentals.debt_to_equity') AS DOUBLE) as debt_to_equity,
            CAST(json_extract_string(relative_data, '$.normalized_fundamentals.return_on_equity') AS DOUBLE) as return_on_equity,
            CAST(json_extract_string(relative_data, '$.structural_capital_efficiency.equity_multiplier') AS DOUBLE) as equity_multiplier,
            CAST(json_extract_string(relative_data, '$.structural_capital_efficiency.sustainable_growth_rate') AS DOUBLE) as sustainable_growth_rate,
            CAST(json_extract_string(relative_data, '$.financial_growth_signals.revenue_yoy') AS DOUBLE) as revenue_yoy,
            CAST(json_extract_string(relative_data, '$.financial_growth_signals.profit_yoy') AS DOUBLE) as profit_yoy,
            CAST(json_extract_string(absolute_data, '$.operatingProfitMargin') AS DOUBLE) as operating_profit_margin,
            CAST(json_extract_string(absolute_data, '$.netProfitMargin') AS DOUBLE) as net_profit_margin,
            rs_rating,
            volatility_squeeze,
            inst_accum,
            qes_flag,
            tax_divergence,
            pledge_delta,
            json_extract_string(absolute_data, '$.OHLCV') as ohlcv,
            absolute_data as abs_t0,
            abs_tminus1
        FROM stocks
    """
    df = con.execute(query).df()
    
    print("Extracting features from live DuckDB matrix...")
    new_cols = {'discount_from_high': [], 'm_score': [], 'z_score': [], 'f_score': [], 'gate_pass': []}
    
    from tqdm import tqdm
    for idx, row in tqdm(df.iterrows(), total=len(df)):
        is_liquid, _ = calculate_liquidity_gates(row['ohlcv'])
        discount = calculate_macro_drawdown(row['ohlcv'])
        
        # We now have t-1 natively in the active database during inference thanks to the ETL join!
        z_score, f_score = extract_forensics(row['abs_t0'], row['abs_tminus1'], row['industry'])
        m_score = -2.0
        
        gate_pass = is_liquid and (discount >= 0.20) and (z_score >= 1.81) and (m_score <= -1.78) and (f_score >= 3)
        
        new_cols['discount_from_high'].append(discount)
        new_cols['m_score'].append(m_score)
        new_cols['z_score'].append(z_score)
        new_cols['f_score'].append(f_score)
        new_cols['gate_pass'].append(gate_pass)
        
    for col, vals in new_cols.items(): df[col] = vals
    
    df['qes_flag'] = df['qes_flag'].fillna(0)
    
    print("Applying Sector-Relative Z-Scoring to fundamental features...")
    for feat in base_fundamental_feats:
        if feat in df.columns:
            df[feat] = winsorize_series(df[feat])
            z_col = f"{feat}_z"
            df[z_col] = df.groupby('industry')[feat].transform(
                lambda x: (x - x.mean()) / x.std() if x.std() > 0 else 0
            )
            df[z_col] = df[z_col].fillna(0)
            
    df['ml_confidence'] = np.where(df['gate_pass'], 'HIGH', 'LOW')
    
    print("Running Base Expert Models...")
    p_acc = acc_model.predict_proba(df[fundamental_feats])[:, 1]
    p_str = str_model.predict_proba(df[momentum_feats])[:, 1]
    p_aud = aud_model.predict_proba(df[forensic_feats])[:, 1]
    
    meta_feats = ['acc_prob', 'str_prob', 'aud_risk_prob', 'inst_accum', 'volatility_squeeze', 'discount_from_high', 'operating_profit_margin', 'net_profit_margin', 'f_score', 'z_score']
    meta_X = pd.DataFrame(columns=meta_feats, index=df.index, dtype=float)
    meta_X['acc_prob'] = p_acc
    meta_X['str_prob'] = p_str
    meta_X['aud_risk_prob'] = p_aud
    for feat in ['inst_accum', 'volatility_squeeze', 'discount_from_high', 'operating_profit_margin', 'net_profit_margin', 'f_score', 'z_score']:
        meta_X[feat] = df[feat]
        
    print("Running Asymmetric Meta-Learner...")
    df['alpha_score'] = meta_model.predict_proba(meta_X)[:, 1]
    
    # Nuke alpha score for stocks that fail the strict gatekeeper check
    df.loc[~df['gate_pass'], 'alpha_score'] = 0.00
    df.loc[p_aud > 0.70, 'alpha_score'] = 0.00
    
    df = df.sort_values('alpha_score', ascending=False)
    
    n_total = len(df)
    top_20_idx = int(n_total * 0.20)
    bottom_10_idx = int(n_total * 0.90)
    
    shap_indices = list(range(0, top_20_idx)) + list(range(bottom_10_idx, n_total))
    df_shap = df.iloc[shap_indices].copy()
    
    print(f"Calculating SHAP values for {len(df_shap)} high-signal candidates...")
    
    explainer_str = shap.TreeExplainer(str_model)
    shap_values_str = explainer_str.shap_values(df_shap[momentum_feats], approximate=True)
    
    reasons_1, reasons_2, reasons_3 = [], [], []
    from tqdm import tqdm
    for i in tqdm(range(len(df_shap)), desc="Calculating SHAP Values"):
        vals = shap_values_str[i]
        row_data = df_shap.iloc[i]
        
        feature_importance = []
        for j in range(len(momentum_feats)):
            feat_name = momentum_feats[j]
            feat_impact = vals[j]
            feat_val = row_data[feat_name]
            if abs(feat_val) > 0.0001:
                feature_importance.append((feat_name, feat_impact, feat_val))
        
        feature_importance.sort(key=lambda x: abs(x[1]), reverse=True)
        
        def format_reason(feat, impact, val):
            direction = "+" if impact > 0 else ""
            names = {
                'rs_rating': 'RS Rating',
                'volatility_squeeze': 'Vol Squeeze',
                'inst_accum': 'Inst Accum'
            }
            clean_name = names.get(feat, feat)
            return f"{clean_name}: {val:.2f} (Impact: {direction}{impact:.4f})"
            
        reasons_1.append(format_reason(*feature_importance[0]) if len(feature_importance) > 0 else "")
        reasons_2.append(format_reason(*feature_importance[1]) if len(feature_importance) > 1 else "")
        reasons_3.append(format_reason(*feature_importance[2]) if len(feature_importance) > 2 else "")
        
    df_shap['shap_reason_1'] = reasons_1
    df_shap['shap_reason_2'] = reasons_2
    df_shap['shap_reason_3'] = reasons_3
    
    df = df.merge(df_shap[['slug', 'shap_reason_1', 'shap_reason_2', 'shap_reason_3']], on='slug', how='left')
    shap_cols = ['shap_reason_1', 'shap_reason_2', 'shap_reason_3']
    df[shap_cols] = df[shap_cols].fillna("")
    
    print("Persisting scores to DuckDB...")
    con.execute("CREATE TEMP TABLE update_data AS SELECT * FROM df")
    
    con.execute("""
        UPDATE stocks 
        SET 
            alpha_score = update_data.alpha_score,
            shap_reason_1 = update_data.shap_reason_1,
            shap_reason_2 = update_data.shap_reason_2,
            shap_reason_3 = update_data.shap_reason_3,
            ml_confidence = update_data.ml_confidence
        FROM update_data 
        WHERE stocks.slug = update_data.slug
    """)
    
    print(f"📦 Exporting enriched data back to Parquet: {parquet_path}")
    if os.path.exists(parquet_path):
        os.remove(parquet_path)
    con.execute(f"COPY stocks TO '{parquet_path}' (FORMAT PARQUET)")
    
    con.close()
    print("Inference Pipeline Complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="datasets/active/market_data.duckdb")
    parser.add_argument("--parquet", default="datasets/active/market_data.parquet")
    args = parser.parse_args()
    run_inference(args.db, args.parquet)
