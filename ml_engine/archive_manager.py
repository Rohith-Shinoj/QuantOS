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

    # 2. Graveyard Management (Eliminating Survivorship Bias)
    print(f"Analyzing graveyard entries...")
    old_slugs = get_db_slugs(old_db)
    new_slugs = get_db_slugs(new_db)
    
    dead_slugs = old_slugs - new_slugs
    if not dead_slugs:
        print("ℹ️ No new graveyard entries identified.")
        return

    print(f"Found {len(dead_slugs)} missing stocks. Extracting full history...")
    
    # Load existing graveyard
    graveyard = {}
    if os.path.exists(graveyard_file):
        try:
            with open(graveyard_file, 'r') as f:
                graveyard = json.load(f)
        except:
            graveyard = {}

    try:
        con_old = duckdb.connect(old_db, read_only=True)
        for slug in dead_slugs:
            # Query the full row for schema flexibility
            row = con_old.execute("SELECT * FROM stocks WHERE slug = ?", (slug,)).fetchone()
            # Get column names
            cols = [d[0] for r in [con_old.execute("DESCRIBE stocks").fetchall()] for d in r]
            
            if row:
                entry = dict(zip(cols, row))
                entry["death_timestamp"] = datetime.now().isoformat()
                graveyard[slug] = entry
                print(f"  - {slug} added to graveyard.")
        con_old.close()
    except Exception as e:
        print(f"Graveyard extraction failed: {e}")
        raise

    with open(graveyard_file, 'w') as f:
        json.dump(graveyard, f, indent=4)
    print(f"Graveyard updated. Total records: {len(graveyard)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Professional ML History & Survivorship Manager.")
    parser.add_argument("--old-db", required=True, help="Physical path to the PREVIOUS DuckDB file.")
    parser.add_argument("--new-db", required=True, help="Physical path to the NEWLY BUILT DuckDB file.")
    parser.add_argument("--snapshot-dir", default="datasets/snapshots", help="Directory for Parquet snapshots.")
    parser.add_argument("--graveyard", default="datasets/graveyard.json", help="Path to graveyard storage.")
    
    args = parser.parse_args()
    
    manage_archive(args.old_db, args.new_db, args.snapshot_dir, args.graveyard)
