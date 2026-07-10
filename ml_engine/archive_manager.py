import os
import json
import duckdb
from datetime import datetime
import argparse

def get_db_slugs(db_path):
    """Extract all unique slugs from a DuckDB file."""
    if not os.path.exists(db_path):
        return set()
    try:
        con = duckdb.connect(db_path, read_only=True)
        res = con.execute("SELECT slug FROM stocks").fetchall()
        con.close()
        return {r[0] for r in res}
    except Exception as e:
        print(f"Error reading DB {db_path}: {e}")
        return set()

def manage_archive(old_db, new_db, snapshot_dir, graveyard_file):
    os.makedirs(snapshot_dir, exist_ok=True)

    # 1. DuckDB to Parquet Snapshot (The "Point-in-Time" Record)
    # Using execution date for file naming to strictly prevent look-ahead bias
    timestamp = datetime.now().strftime("%Y-%m-%d")
    snapshot_path = os.path.join(snapshot_dir, f"snapshot_{timestamp}.parquet")
    
    if os.path.exists(new_db):
        try:
            con = duckdb.connect(new_db, read_only=True)
            print(f"Exporting snapshot to {snapshot_path}...")
            con.execute(f"COPY (SELECT * FROM stocks) TO '{snapshot_path}' (FORMAT PARQUET)")
            con.close()
            print(f"Snapshot created successfully.")
        except Exception as e:
            print(f"Snapshot export failed: {e}")
            raise

    # 2. Carry Forward Missing Stocks (No more graveyard)
    if old_db == new_db:
        print("ℹ️ Old and new DB are the same (first run). Skipping carry forward.")
        return

    print(f"Analyzing missing entries...")
    
    try:
        con = duckdb.connect(new_db)
        con.execute(f"ATTACH '{old_db}' AS old_db (READ_ONLY)")
        
        missing_count = con.execute("SELECT COUNT(*) FROM old_db.stocks WHERE slug NOT IN (SELECT slug FROM stocks)").fetchone()[0]
        
        if missing_count > 0:
            print(f"Found {missing_count} missing stocks from previous run. Carrying them forward...")
            # Dynamically get columns from new_db to avoid schema mismatch with old_db (which has extra ML columns)
            cols = [r[0] for r in con.execute("DESCRIBE stocks").fetchall()]
            col_str = ", ".join(cols)
            
            con.execute(f"""
                INSERT INTO stocks ({col_str})
                SELECT {col_str} FROM old_db.stocks
                WHERE slug NOT IN (SELECT slug FROM stocks)
            """)
            print(f"Successfully carried forward {missing_count} stocks.")
        else:
            print("ℹ️ No missing stocks identified.")
            
        con.execute("DETACH old_db")
        con.close()
    except Exception as e:
        print(f"Failed to carry forward missing stocks: {e}")
        raise

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Professional ML History & Survivorship Manager.")
    parser.add_argument("--old-db", required=True, help="Physical path to the PREVIOUS DuckDB file.")
    parser.add_argument("--new-db", required=True, help="Physical path to the NEWLY BUILT DuckDB file.")
    parser.add_argument("--snapshot-dir", default="datasets/snapshots", help="Directory for Parquet snapshots.")
    parser.add_argument("--graveyard", default="datasets/graveyard.json", help="Path to graveyard storage.")
    
    args = parser.parse_args()
    
    manage_archive(args.old_db, args.new_db, args.snapshot_dir, args.graveyard)
