import os
import argparse
import duckdb
import pandas as pd
import numpy as np
import joblib
import shap
import warnings

warnings.filterwarnings('ignore')

def run_inference(db_path, parquet_path):
    print(f"Running Inference on {db_path}...")
    
    # Load Models
    model_dir = "ml_engine/models"
    try:
        acc_model = joblib.load(os.path.join(model_dir, "accountant.pkl"))
        str_model = joblib.load(os.path.join(model_dir, "strategist.pkl"))
        aud_model = joblib.load(os.path.join(model_dir, "auditor.pkl"))
        meta_model = joblib.load(os.path.join(model_dir, "meta_learner.pkl"))
    except Exception as e:
        print(f"Failed to load models: {e}. Run trainer.py first.")
        return

    fundamental_feats = ['pe_ratio', 'debt_to_equity', 'return_on_equity', 'net_profit_margin', 'equity_multiplier', 'sustainable_growth_rate', 'revenue_yoy', 'profit_yoy']
    momentum_feats = ['rs_rating', 'volatility_squeeze', 'inst_accum']
    forensic_feats = ['qes_flag', 'tax_divergence', 'pledge_delta']

    con = duckdb.connect(db_path)
    
    # Add columns if they don't exist
    try:
        con.execute("ALTER TABLE stocks ADD COLUMN alpha_score DOUBLE")
        con.execute("ALTER TABLE stocks ADD COLUMN shap_reason_1 VARCHAR")
        con.execute("ALTER TABLE stocks ADD COLUMN shap_reason_2 VARCHAR")
        con.execute("ALTER TABLE stocks ADD COLUMN shap_reason_3 VARCHAR")
    except:
        # Columns might already exist
        pass

    query = """
        SELECT 
            slug,
            pe_ratio,
            CAST(json_extract_string(relative_data, '$.normalized_fundamentals.debt_to_equity') AS DOUBLE) as debt_to_equity,
            CAST(json_extract_string(relative_data, '$.normalized_fundamentals.return_on_equity') AS DOUBLE) as return_on_equity,
            CAST(json_extract_string(relative_data, '$.normalized_fundamentals.net_profit_margin') AS DOUBLE) as net_profit_margin,
            CAST(json_extract_string(relative_data, '$.structural_capital_efficiency.equity_multiplier') AS DOUBLE) as equity_multiplier,
            CAST(json_extract_string(relative_data, '$.structural_capital_efficiency.sustainable_growth_rate') AS DOUBLE) as sustainable_growth_rate,
            CAST(json_extract_string(relative_data, '$.financial_growth_signals.revenue_yoy') AS DOUBLE) as revenue_yoy,
            CAST(json_extract_string(relative_data, '$.financial_growth_signals.profit_yoy') AS DOUBLE) as profit_yoy,
            rs_rating,
            volatility_squeeze,
            inst_accum,
            qes_flag,
            tax_divergence,
            pledge_delta
        FROM stocks
    """
    df = con.execute(query).df()
    df['qes_flag'] = df['qes_flag'].fillna(0) # Only fill categorical flags, let XGBoost handle NaNs
    
    # Base Predictions
    p_acc = acc_model.predict_proba(df[fundamental_feats])[:, 1]
    p_str = str_model.predict_proba(df[momentum_feats])[:, 1]
    p_aud = aud_model.predict_proba(df[forensic_feats])[:, 1]
    
    meta_X = pd.DataFrame({'acc_prob': p_acc, 'str_prob': p_str, 'aud_risk_prob': p_aud})
    
    # Meta Learner Forward 1Y Alpha Probability
    df['alpha_score'] = meta_model.predict_proba(meta_X)[:, 1]
    
    # FORENSIC VETO: If Auditor signals High Risk (> 0.70), veto the Alpha Score
    df.loc[p_aud > 0.70, 'alpha_score'] = 0.01 
    
    # REGIME ADAPTATION: Adjust alpha based on macro market fear
    # Extract macro regime from the relative_data of a stable index or large cap (like NIFTY proxy)
    # We can just look at the first row's regime since it's the same market environment for all
    try:
        macro_query = """
            SELECT 
                CAST(json_extract_string(relative_data, '$.macro_market_regime.is_high_fear_regime') AS INT) as is_fear
            FROM stocks LIMIT 1
        """
        is_fear = con.execute(macro_query).fetchone()[0] == 1
        
        if is_fear:
            print("🌩️ High Fear Regime Detected. Penalizing high-debt and high-valuation stocks...")
            # Penalize stocks with debt_to_equity > 1.5 or P/E > 50
            penalty_mask = (df['debt_to_equity'] > 1.5) | (df['pe_ratio'] > 50)
            df.loc[penalty_mask, 'alpha_score'] = df.loc[penalty_mask, 'alpha_score'] * 0.5
    except Exception as e:
        print(f"⚠️ Regime adaptation skipped: {e}")
        
    # Sort for SHAP Analysis (Top 20%, Bottom 10%)
    df = df.sort_values('alpha_score', ascending=False)
    
    n_total = len(df)
    top_20_idx = int(n_total * 0.20)
    bottom_10_idx = int(n_total * 0.90)
    
    shap_indices = list(range(0, top_20_idx)) + list(range(bottom_10_idx, n_total))
    df_shap = df.iloc[shap_indices].copy()
    
    print(f"Calculating SHAP values for {len(df_shap)} high-signal candidates...")
    
    # Use TreeExplainer with approximate=True for speed
    explainer_str = shap.TreeExplainer(str_model)
    shap_values_str = explainer_str.shap_values(df_shap[momentum_feats], approximate=True)
    
    # Format SHAP reasons
    reasons_1, reasons_2, reasons_3 = [], [], []
    for i in range(len(df_shap)):
        # Combine momentum feature importance with raw values
        vals = shap_values_str[i]
        
        # Access the raw data for this row to check for zeroes
        # df_shap preserves the original index from df
        row_data = df_shap.iloc[i]
        
        feature_importance = []
        for j in range(len(momentum_feats)):
            feat_name = momentum_feats[j]
            feat_impact = vals[j]
            feat_val = row_data[feat_name]
            
            # Skip if the raw value is exactly 0.0 (missing or no change)
            # This prevents the model from proudly declaring "+ 0.0" as a reason to buy.
            if abs(feat_val) > 0.0001:
                feature_importance.append((feat_name, feat_impact))
        
        # Sort by absolute impact
        feature_importance.sort(key=lambda x: abs(x[1]), reverse=True)
        
        def format_reason(feat, impact):
            direction = "+" if impact > 0 else "-"
            # Human readable names
            names = {
                'rs_rating': 'RS Rating',
                'volatility_squeeze': 'Vol Squeeze',
                'inst_accum': 'Inst Accum'
            }
            return f"{direction} {names.get(feat, feat)}"
            
        reasons_1.append(format_reason(*feature_importance[0]) if len(feature_importance) > 0 else "")
        reasons_2.append(format_reason(*feature_importance[1]) if len(feature_importance) > 1 else "")
        reasons_3.append(format_reason(*feature_importance[2]) if len(feature_importance) > 2 else "")
        
    df_shap['shap_reason_1'] = reasons_1
    df_shap['shap_reason_2'] = reasons_2
    df_shap['shap_reason_3'] = reasons_3
    
    # Merge back
    df = df.merge(df_shap[['slug', 'shap_reason_1', 'shap_reason_2', 'shap_reason_3']], on='slug', how='left')
    df.fillna("", inplace=True) # Blank for stocks that didn't get SHAP
    
    # Update DuckDB
    print("Persisting scores to DuckDB...")
    
    # We can create a temp table and update
    con.execute("CREATE TEMP TABLE update_data AS SELECT * FROM df")
    con.execute("""
        UPDATE stocks 
        SET 
            alpha_score = update_data.alpha_score,
            shap_reason_1 = update_data.shap_reason_1,
            shap_reason_2 = update_data.shap_reason_2,
            shap_reason_3 = update_data.shap_reason_3
        FROM update_data 
        WHERE stocks.slug = update_data.slug
    """)
    
    print(f"Exporting enriched data back to Parquet: {parquet_path}")
    con.execute(f"COPY stocks TO '{parquet_path}' (FORMAT PARQUET)")
    
    con.close()
    print("Predictor execution complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predictive Intelligence Inference Layer")
    parser.add_argument("--db", required=True, help="Path to active DuckDB")
    parser.add_argument("--parquet", required=True, help="Path to active Parquet file to update")
    args = parser.parse_args()
    
    run_inference(args.db, args.parquet)
