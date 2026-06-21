import duckdb
import argparse
import sys
import json

def validate_db(parquet_path):
    print(f"Validating Parquet at {parquet_path}...")
    try:
        con = duckdb.connect(":memory:")
        
        # 1. Verify schema
        res = con.execute(f"DESCRIBE SELECT * FROM '{parquet_path}'").fetchall()
        cols = [r[0] for r in res]
        required = ['slug', 'ticker', 'name', 'market_cap', 'industry', 'inst_accum', 'volatility_squeeze', 'qes_flag', 'rs_rating', 'tax_divergence', 'pledge_delta']
        for col in required:
            if col not in cols:
                print(f"ERROR: Column '{col}' missing from Parquet.")
                sys.exit(1)
            
        # 2. Verify total row count > 1000
        count = con.execute(f"SELECT COUNT(*) FROM '{parquet_path}'").fetchone()[0]
        print(f"Found {count} stocks.")
        if count < 1000:
            print(f"ERROR: Row count {count} is below threshold (1000).")
            sys.exit(1)
            
        # 3. Verify critical anchor stocks
        anchors = ['reliance-industries-ltd', 'hdfc-bank-ltd']
        for slug in anchors:
            res = con.execute(f"SELECT slug, ticker, inst_accum FROM '{parquet_path}' WHERE slug = ?", (slug,)).fetchone()
            if not res:
                print(f"ERROR: Anchor stock '{slug}' missing.")
                sys.exit(1)
            if res[1] is None:
                print(f"ERROR: Anchor stock '{slug}' has null ticker.")
                sys.exit(1)
                
        print("Parquet validation passed.")
        con.close()
    except Exception as e:
        print(f"ERROR: Validation failed with exception: {e}")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate Parquet dataset sanity.")
    parser.add_argument("--db", required=True, help="Path to the Parquet file")
    args = parser.parse_args()
    validate_db(args.db)
