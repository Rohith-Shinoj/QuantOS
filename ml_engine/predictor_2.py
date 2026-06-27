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

def run_dual_inference(db_path, parquet_path):
    print(f"Running Dual-Track Inference on {db_path}...")
    
    model_dir = "ml_engine/models"
    try:
        acc_cons = joblib.load(os.path.join(model_dir, "accountant_conservative.pkl"))
        str_cons = joblib.load(os.path.join(model_dir, "strategist_conservative.pkl"))
        aud_cons = joblib.load(os.path.join(model_dir, "auditor_conservative.pkl"))
        meta_cons = joblib.load(os.path.join(model_dir, "meta_learner_conservative.pkl"))
        
        acc_moon = joblib.load(os.path.join(model_dir, "accountant_moonshot.pkl"))
        str_moon = joblib.load(os.path.join(model_dir, "strategist_moonshot.pkl"))
        aud_moon = joblib.load(os.path.join(model_dir, "auditor_moonshot.pkl"))
        meta_moon = joblib.load(os.path.join(model_dir, "meta_learner_moonshot.pkl"))
    except Exception as e:
        print(f"Failed to load models: {e}. Run trainer_2.py first.")
        return

    base_fundamental_feats = ['pe_ratio', 'debt_to_equity', 'return_on_equity', 'equity_multiplier', 'sustainable_growth_rate', 'revenue_yoy', 'profit_yoy', 'operating_profit_margin', 'net_profit_margin', 'discount_from_high']
    fundamental_feats = [f"{feat}_z" for feat in base_fundamental_feats]
    momentum_feats = ['rs_rating', 'volatility_squeeze', 'inst_accum']
    forensic_feats = ['z_score', 'm_score', 'f_score', 'qes_flag', 'tax_divergence', 'pledge_delta']

    con = duckdb.connect(db_path)
    
    # Schema modifications
    try: con.execute("ALTER TABLE stocks DROP COLUMN alpha_score")
    except: pass
    
    try: con.execute("ALTER TABLE stocks DROP COLUMN ml_confidence")
    except: pass

    for col_statement in [
        "ALTER TABLE stocks ADD COLUMN alpha_score_conservative DOUBLE",
        "ALTER TABLE stocks ADD COLUMN alpha_score_moonshot DOUBLE",
        "ALTER TABLE stocks ADD COLUMN ml_confidence_conservative VARCHAR",
        "ALTER TABLE stocks ADD COLUMN ml_confidence_moonshot VARCHAR",
        "ALTER TABLE stocks ADD COLUMN shap_reason_1 VARCHAR",
        "ALTER TABLE stocks ADD COLUMN shap_reason_2 VARCHAR",
        "ALTER TABLE stocks ADD COLUMN shap_reason_3 VARCHAR"
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
            CAST(json_extract_string(absolute_data, '$.marketCap') AS DOUBLE) as market_cap,
            CAST(json_extract_string(relative_data, '$.normalized_fundamentals.debt_to_equity') AS DOUBLE) as debt_to_equity,
            CAST(json_extract_string(relative_data, '$.normalized_fundamentals.return_on_equity') AS DOUBLE) as return_on_equity,
            CAST(json_extract_string(relative_data, '$.structural_capital_efficiency.equity_multiplier') AS DOUBLE) as equity_multiplier,
            CAST(json_extract_string(relative_data, '$.structural_capital_efficiency.sustainable_growth_rate') AS DOUBLE) as sustainable_growth_rate,
            CAST(json_extract_string(relative_data, '$.financial_growth_signals.revenue_yoy') AS DOUBLE) as revenue_yoy,
            CAST(json_extract_string(relative_data, '$.financial_growth_signals.profit_yoy') AS DOUBLE) as profit_yoy,
            CAST(json_extract_string(absolute_data, '$.operatingProfitMargin') AS DOUBLE) as operating_profit_margin,
            CAST(json_extract_string(abs_tminus1, '$.operatingProfitMargin') AS DOUBLE) as operating_profit_margin_tminus1,
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
    new_cols = {'discount_from_high': [], 'm_score': [], 'z_score': [], 'f_score': [], 'gate_pass_cons': [], 'gate_pass_moon': []}
    
    from tqdm import tqdm
    for idx, row in tqdm(df.iterrows(), total=len(df)):
        discount = calculate_macro_drawdown(row['ohlcv'])
        z_score, f_score = extract_forensics(row['abs_t0'], row['abs_tminus1'], row['industry'])
        m_score = -2.0
        m_cap = row['market_cap'] if not pd.isna(row['market_cap']) else 0
        
        # Strict Data Hygiene: Disqualify recent IPOs / missing T-1 data
        has_t1_data = not pd.isna(row['abs_tminus1']) and row['abs_tminus1'] != "{}"
        ohlcv_len = 0
        if not pd.isna(row['ohlcv']):
            try:
                ohlcv_len = len(json.loads(row['ohlcv']))
            except:
                pass
        
        is_liquid_cons, _ = calculate_liquidity_gates(row['ohlcv'], min_adtv=10000000, min_price=20.0)
        gate_pass_cons = is_liquid_cons and has_t1_data and (ohlcv_len >= 200) and (m_cap >= 5000) and (discount >= 0.20) and (z_score >= 1.81) and (m_score <= -1.78) and (f_score >= 6)
        
        is_liquid_moon, _ = calculate_liquidity_gates(row['ohlcv'], min_adtv=2500000, min_price=5.0)
        rev_yoy = row['revenue_yoy'] if not pd.isna(row['revenue_yoy']) else 0
        opm_t0 = row['operating_profit_margin'] if not pd.isna(row['operating_profit_margin']) else 0
        opm_t1 = row['operating_profit_margin_tminus1'] if not pd.isna(row['operating_profit_margin_tminus1']) else 0
        dOPM = opm_t0 - opm_t1 if has_t1_data else 0
        rs = row['rs_rating'] if not pd.isna(row['rs_rating']) else 0
        gate_pass_moon = is_liquid_moon and has_t1_data and (ohlcv_len >= 150) and (m_cap <= 5000) and (rev_yoy >= 0.35) and (dOPM > 0) and (70 <= rs <= 85) and (z_score >= 1.10) and (m_score <= -1.78) and (f_score >= 4)
        
        new_cols['discount_from_high'].append(discount)
        new_cols['m_score'].append(m_score)
        new_cols['z_score'].append(z_score)
        new_cols['f_score'].append(f_score)
        new_cols['gate_pass_cons'].append(gate_pass_cons)
        new_cols['gate_pass_moon'].append(gate_pass_moon)
        
    for col, vals in new_cols.items(): df[col] = vals
    df['qes_flag'] = df['qes_flag'].fillna(0)
    
    print("Applying Sector-Relative Z-Scoring...")
    for feat in base_fundamental_feats:
        if feat in df.columns:
            df[feat] = winsorize_series(df[feat])
            z_col = f"{feat}_z"
            df[z_col] = df.groupby('industry')[feat].transform(
                lambda x: (x - x.mean()) / x.std() if x.std() > 0 else 0
            )
            df[z_col] = df[z_col].fillna(0)
            
    df['ml_confidence_conservative'] = np.where(df['gate_pass_cons'], 'HIGH', 'LOW')
    df['ml_confidence_moonshot'] = np.where(df['gate_pass_moon'], 'HIGH', 'LOW')
    
    # --- Execute Track 1: Conservative ---
    print("Running Conservative Expert Models...")
    p_acc_cons = acc_cons.predict_proba(df[fundamental_feats])[:, 1]
    p_str_cons = str_cons.predict_proba(df[momentum_feats])[:, 1]
    p_aud_cons = aud_cons.predict_proba(df[forensic_feats])[:, 1]
    
    meta_X_cons = pd.DataFrame(index=df.index, dtype=float)
    meta_X_cons['acc_prob'] = p_acc_cons
    meta_X_cons['str_prob'] = p_str_cons
    meta_X_cons['aud_risk_prob'] = p_aud_cons
    for feat in ['inst_accum', 'volatility_squeeze', 'discount_from_high', 'operating_profit_margin', 'net_profit_margin', 'f_score', 'z_score']:
        meta_X_cons[feat] = df[feat]
    
    df['alpha_score_conservative'] = meta_cons.predict_proba(meta_X_cons)[:, 1]
    df.loc[~df['gate_pass_cons'], 'alpha_score_conservative'] = 0.00
    df.loc[p_aud_cons > 0.70, 'alpha_score_conservative'] = 0.00
    
    # --- Execute Track 2: Moonshot ---
    print("Running Moonshot Expert Models...")
    p_acc_moon = acc_moon.predict_proba(df[fundamental_feats])[:, 1]
    p_str_moon = str_moon.predict_proba(df[momentum_feats])[:, 1]
    p_aud_moon = aud_moon.predict_proba(df[forensic_feats])[:, 1]
    
    meta_X_moon = pd.DataFrame(index=df.index, dtype=float)
    meta_X_moon['acc_prob'] = p_acc_moon
    meta_X_moon['str_prob'] = p_str_moon
    meta_X_moon['aud_risk_prob'] = p_aud_moon
    for feat in ['inst_accum', 'volatility_squeeze', 'discount_from_high', 'operating_profit_margin', 'net_profit_margin', 'f_score', 'z_score']:
        meta_X_moon[feat] = df[feat]
    
    df['alpha_score_moonshot'] = meta_moon.predict_proba(meta_X_moon)[:, 1]
    df.loc[~df['gate_pass_moon'], 'alpha_score_moonshot'] = 0.00
    df.loc[p_aud_moon > 0.70, 'alpha_score_moonshot'] = 0.00
    
    # SHAP Generation (Hybrid Approach)
    print(f"Calculating SHAP values...")
    explainer_str_cons = shap.TreeExplainer(str_cons)
    explainer_str_moon = shap.TreeExplainer(str_moon)
    
    reasons_1, reasons_2, reasons_3 = [], [], []
    for i in tqdm(range(len(df)), desc="Calculating SHAP Values"):
        row_data = df.iloc[i]
        
        use_moon = row_data['alpha_score_moonshot'] > row_data['alpha_score_conservative']
        explainer = explainer_str_moon if use_moon else explainer_str_cons
        
        # Only calc SHAP for stocks that have SOME alpha score > 0 to save time
        if row_data['alpha_score_moonshot'] == 0 and row_data['alpha_score_conservative'] == 0:
            reasons_1.append("")
            reasons_2.append("")
            reasons_3.append("")
            continue
            
        vals = explainer.shap_values(pd.DataFrame([row_data[momentum_feats]]), approximate=True)[0]
        
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
            names = {'rs_rating': 'RS Rating', 'volatility_squeeze': 'Vol Squeeze', 'inst_accum': 'Inst Accum'}
            return f"{names.get(feat, feat)}: {val:.2f} (Impact: {direction}{impact:.4f})"
            
        reasons_1.append(format_reason(*feature_importance[0]) if len(feature_importance) > 0 else "")
        reasons_2.append(format_reason(*feature_importance[1]) if len(feature_importance) > 1 else "")
        reasons_3.append(format_reason(*feature_importance[2]) if len(feature_importance) > 2 else "")
        
    df['shap_reason_1'] = reasons_1
    df['shap_reason_2'] = reasons_2
    df['shap_reason_3'] = reasons_3
    
    print("Persisting scores to DuckDB...")
    con.execute("CREATE TEMP TABLE update_data AS SELECT * FROM df")
    
    con.execute("""
        UPDATE stocks 
        SET 
            alpha_score_conservative = update_data.alpha_score_conservative,
            alpha_score_moonshot = update_data.alpha_score_moonshot,
            shap_reason_1 = update_data.shap_reason_1,
            shap_reason_2 = update_data.shap_reason_2,
            shap_reason_3 = update_data.shap_reason_3,
            ml_confidence_conservative = update_data.ml_confidence_conservative,
            ml_confidence_moonshot = update_data.ml_confidence_moonshot
        FROM update_data 
        WHERE stocks.slug = update_data.slug
    """)
    
    print(f"📦 Exporting enriched data back to Parquet: {parquet_path}")
    if os.path.exists(parquet_path):
        os.remove(parquet_path)
    con.execute(f"COPY stocks TO '{parquet_path}' (FORMAT PARQUET)")
    
    con.close()
    print("Dual Inference Pipeline Complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="datasets/active/market_data.duckdb")
    parser.add_argument("--parquet", default="datasets/active/market_data.parquet")
    args = parser.parse_args()
    run_dual_inference(args.db, args.parquet)
