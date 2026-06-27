import os
import argparse
import duckdb
import pandas as pd
import numpy as np
from scipy.stats import norm
import warnings

warnings.filterwarnings('ignore')

def run_mf_inference(mf_parquet_path, cr_parquet_path):
    print("Running Institutional Mutual Fund Scoring Pipeline...")
    
    con = duckdb.connect(':memory:')
    
    # 1. Join Mutual Funds with Capture Ratios
    query = f"""
        SELECT 
            m.search_id,
            m.fund_name,
            m.category,
            m.expense_ratio,
            c.up_1Y,
            c.down_1Y,
            m.advanced_stats
        FROM '{mf_parquet_path}' m
        LEFT JOIN '{cr_parquet_path}' c ON m.search_id = c.search_id
    """
    df = con.execute(query).df()
    
    print(f"Loaded {len(df)} Mutual Funds for scoring.")
    
    # Clean data
    df['up_1Y'] = pd.to_numeric(df['up_1Y'], errors='coerce').fillna(100.0)
    df['down_1Y'] = pd.to_numeric(df['down_1Y'], errors='coerce').fillna(100.0)
    df['expense_ratio'] = pd.to_numeric(df['expense_ratio'], errors='coerce').fillna(1.5)
    
    # PILLAR 1: Look-Through Valuation (Extract from advanced_stats JSON if available)
    # If the fund holds high P/E stocks, the fund itself has a high P/E
    import json
    def extract_pe(stats_json):
        try:
            if not stats_json: return np.nan
            stats = json.loads(stats_json)
            return float(stats.get('pe', np.nan))
        except:
            return np.nan
            
    df['portfolio_pe'] = df['advanced_stats'].apply(extract_pe)
    df['portfolio_pe'] = df['portfolio_pe'].fillna(df['portfolio_pe'].median()) # Temporary fill for missing stats
    
    df['pe_z'] = df.groupby('category')['portfolio_pe'].transform(
        lambda x: (x - x.mean()) / x.std() if x.std() > 0 else 0
    ).fillna(0)
    
    # PILLAR 2: Manager Asymmetry (Convexity)
    # A great manager captures upside but limits downside.
    # Example: Up_1Y = 110 (10% more than market), Down_1Y = 80 (20% less drop than market)
    df['convexity_score'] = df['up_1Y'] - df['down_1Y']
    
    df['convexity_z'] = df.groupby('category')['convexity_score'].transform(
        lambda x: (x - x.mean()) / x.std() if x.std() > 0 else 0
    ).fillna(0)
    
    # PILLAR 3: Absolute Cost Drag
    df['expense_z'] = df.groupby('category')['expense_ratio'].transform(
        lambda x: (x - x.mean()) / x.std() if x.std() > 0 else 0
    ).fillna(0)
    
    # Calculate Final Alpha Score
    # - pe_z: Lower is better (value), so subtract
    # + convexity_z: Higher is better, so add
    # - expense_z: Lower is better, so subtract
    df['raw_quant_score'] = (-0.5 * df['pe_z']) + (1.0 * df['convexity_z']) - (0.5 * df['expense_z'])
    
    # Convert raw Z-score into a 0.0 to 1.0 Probability Score (Alpha Score)
    df['mf_alpha_score'] = norm.cdf(df['raw_quant_score'])
    
    # Update DuckDB / Parquet
    print("Persisting Mutual Fund Alpha Scores...")
    
    con.execute(f"CREATE TABLE mfs AS SELECT * FROM '{mf_parquet_path}'")
    con.execute("CREATE TEMP TABLE update_data AS SELECT search_id, mf_alpha_score FROM df")
    
    # Add column if not exists
    try:
        con.execute("ALTER TABLE mfs ADD COLUMN alpha_score DOUBLE")
    except:
        pass
        
    con.execute("""
        UPDATE mfs 
        SET alpha_score = update_data.mf_alpha_score
        FROM update_data 
        WHERE mfs.search_id = update_data.search_id
    """)
    
    # Overwrite parquet
    con.execute(f"COPY mfs TO '{mf_parquet_path}' (FORMAT PARQUET)")
    
    con.close()
    print("Mutual Fund Pipeline Complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mutual Fund Quant Pipeline")
    parser.add_argument("--mf_parquet", required=True, help="Path to mutual_funds.parquet")
    parser.add_argument("--cr_parquet", required=True, help="Path to capture_ratios.parquet")
    args = parser.parse_args()
    
    run_mf_inference(args.mf_parquet, args.cr_parquet)
