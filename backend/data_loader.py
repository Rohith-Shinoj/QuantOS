import os
import json
import duckdb
import argparse
from pathlib import Path

def init_db(target_dir):
    parquet_path = os.path.join(target_dir, "market_data.parquet")
    absolute_dir = os.path.join(target_dir, "absolute_dataset")
    relative_dir = os.path.join(target_dir, "relative_dataset")
    
    # Ensure directories exist within target
    os.makedirs(absolute_dir, exist_ok=True)
    os.makedirs(relative_dir, exist_ok=True)
    
    print(f"Generating Parquet at {parquet_path}...")
    
    # Use an in-memory DuckDB for the conversion
    con = duckdb.connect(":memory:")
    
    # Load slugs
    slugs = set()
    if os.path.exists(absolute_dir):
        for f in os.listdir(absolute_dir):
            if f.endswith('.json'):
                slugs.add(f.replace('.json', ''))
                
    if os.path.exists(relative_dir):
        for f in os.listdir(relative_dir):
            if f.endswith('.json'):
                slugs.add(f.replace('.json', ''))
                
    print(f"Found {len(slugs)} unique slugs. Processing...")
    
    # Create staging table
    con.execute("""
        CREATE TABLE stocks_staging (
            slug VARCHAR PRIMARY KEY,
            ticker VARCHAR,
            name VARCHAR,
            market_cap_type VARCHAR,
            market_cap DOUBLE,
            pe_ratio DOUBLE,
            day_change VARCHAR,
            industry VARCHAR,
            inst_accum DOUBLE,
            volatility_squeeze DOUBLE,
            qes_flag INTEGER,
            tax_divergence DOUBLE,
            pledge_delta DOUBLE,
            absolute_data JSON,
            relative_data JSON
        )
    """)
    
    # Prepare batch insertion
    insert_data = []
    
    for slug in slugs:
        abs_path = os.path.join(absolute_dir, f"{slug}.json")
        rel_path = os.path.join(relative_dir, f"{slug}.json")
        
        abs_json_str = None
        rel_json_str = None
        
        abs_data = {}
        rel_data = {}
        
        if os.path.exists(abs_path):
            with open(abs_path, 'r', encoding='utf-8') as f:
                abs_json_str = f.read()
                abs_data = json.loads(abs_json_str)
        
        if os.path.exists(rel_path):
            with open(rel_path, 'r', encoding='utf-8') as f:
                rel_json_str = f.read()
                rel_data = json.loads(rel_json_str)
        
        # Materialize fields
        ticker = abs_data.get("ticker") or "N/A"
        name = abs_data.get("displayName")
        market_cap_type = abs_data.get("cappedType")
        market_cap = abs_data.get("marketCap")
        pe_ratio = abs_data.get("peRatio")
        day_change = abs_data.get("day change")
        
        # Extract from relative data
        industry = rel_data.get("meta_features", {}).get("industry_name")
        inst_accum = rel_data.get("shareholding_momentum_vectors", {}).get("institutional_accumulation_qoq")
        v_squeeze = rel_data.get("risk_and_forensic_signals", {}).get("volatility_squeeze_index")
        qes_flag = rel_data.get("risk_and_forensic_signals", {}).get("qes_forensic_red_flag")
        tax_div = rel_data.get("risk_and_forensic_signals", {}).get("tax_profit_divergence")
        pledge_d = rel_data.get("shareholding_momentum_vectors", {}).get("promoter_pledge_delta")

        insert_data.append((
            slug, ticker, name, market_cap_type, market_cap, pe_ratio, 
            day_change, industry, inst_accum, v_squeeze, qes_flag,
            tax_div, pledge_d, abs_json_str, rel_json_str
        ))
        
        if len(insert_data) >= 500:
            con.executemany("INSERT INTO stocks_staging VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", insert_data)
            insert_data = []
            
    if insert_data:
        con.executemany("INSERT INTO stocks_staging VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", insert_data)
            
    # Calculate RS Rating (1-99 percentile) and create final table
    print("Calculating Global RS Ratings...")
    con.execute("""
        CREATE TABLE stocks AS 
        WITH ranked AS (
            SELECT 
                *,
                PERCENT_RANK() OVER (
                    PARTITION BY (CASE WHEN CAST(json_extract_string(relative_data, '$.relative_strength_signals.rs_nifty_52w') AS DOUBLE) IS NOT NULL THEN 1 ELSE 0 END)
                    ORDER BY CAST(json_extract_string(relative_data, '$.relative_strength_signals.rs_nifty_52w') AS DOUBLE) ASC
                ) as raw_rank
            FROM stocks_staging
        )
        SELECT 
            *,
            CASE 
                WHEN CAST(json_extract_string(relative_data, '$.relative_strength_signals.rs_nifty_52w') AS DOUBLE) IS NULL THEN 1
                ELSE (raw_rank * 98 + 1)
            END as rs_rating
        FROM ranked
    """)
    
    # Export to Parquet
    print(f"Exporting to {parquet_path}...")
    con.execute(f"COPY stocks TO '{parquet_path}' (FORMAT PARQUET)")
    
    # Export to DuckDB (For ML Engine)
    duckdb_path = os.path.join(target_dir, "market_data.duckdb")
    print(f"Exporting to {duckdb_path}...")
    if os.path.exists(duckdb_path): os.remove(duckdb_path)
    con.execute(f"ATTACH '{duckdb_path}' AS db; CREATE TABLE db.stocks AS SELECT * FROM stocks; DETACH db;")
    # Mutual Funds Processing
    mf_json_path = os.path.join(target_dir, "mutual_funds.json")
    if os.path.exists(mf_json_path):
        print("Processing Mutual Funds...")
        mf_parquet_path = os.path.join(target_dir, "mutual_funds.parquet")
        con.execute(f"CREATE TABLE mutual_funds AS SELECT * FROM read_json_auto('{mf_json_path}', maximum_object_size=33554432)")
        print(f"Exporting Mutual Funds to {mf_parquet_path}...")
        con.execute(f"COPY mutual_funds TO '{mf_parquet_path}' (FORMAT PARQUET)")
        
    print(f"Parquet and DuckDB generation complete.")
    con.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest JSON datasets and export to Parquet.")
    parser.add_argument("--target", required=True, help="Target buffer directory")
    args = parser.parse_args()
    init_db(args.target)
