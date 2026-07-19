import os
import json
import calendar
import duckdb
import argparse
from pathlib import Path
import random
import datetime
from tqdm import tqdm
import pandas as pd
import numpy as np

def init_db(target_dir):
    parquet_path = os.path.join(target_dir, "market_data.parquet")
    abs_jsonl_path = os.path.join(target_dir, "absolute_dataset.jsonl")
    rel_jsonl_path = os.path.join(target_dir, "relative_dataset.jsonl")
    
    print(f"Generating Parquet at {parquet_path}...")
    
    # Use an in-memory DuckDB for the conversion
    con = duckdb.connect(":memory:")
    
    # Load slugs and data from JSONL shards
    abs_map = {}
    rel_map = {}
    
    print("Loading sharded dataset files into memory...")
    if os.path.exists(abs_jsonl_path):
        with open(abs_jsonl_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    d = json.loads(line)
                    abs_map[d['slug']] = d['data']
                    
    if os.path.exists(rel_jsonl_path):
        with open(rel_jsonl_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    d = json.loads(line)
                    rel_map[d['slug']] = d['data']
                    
    slugs = set(abs_map.keys()).union(set(rel_map.keys()))
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
            pledge_delta DOUBLE,
            absolute_data JSON,
            relative_data JSON
        )
    """)
    
    # Prepare batch insertion
    insert_data = []
    
    for slug in slugs:
        abs_data = abs_map.get(slug, {})
        rel_data = rel_map.get(slug, {})
        
        abs_json_str = json.dumps(abs_data) if abs_data else None
        rel_json_str = json.dumps(rel_data) if rel_data else None
        
        # Removed Temporal & Price Viability Gate to allow ALL stocks including delisted ones.
            
        # Helper to ensure we don't insert string dashes ('--') into DOUBLE columns
        def safe_float(val):
            if val is None: return None
            try: return float(val)
            except (ValueError, TypeError): return None
            
        def safe_int(val):
            if val is None: return None
            try: return int(val)
            except (ValueError, TypeError): return None
            
        # Materialize fields
        ticker = abs_data.get("ticker") or "N/A"
        name = abs_data.get("displayName")
        market_cap_type = abs_data.get("cappedType")
        market_cap = safe_float(abs_data.get("marketCap"))
        pe_ratio = safe_float(abs_data.get("peRatio"))
        
        # Calculate true day change from OHLCV array instead of flawed API string
        day_change = "0.00 (0.00%)"
        ohlcv = abs_data.get("OHLCV", [])
        if len(ohlcv) >= 2:
            try:
                c1 = float(ohlcv[-1].get("Close", 0))
                c2 = float(ohlcv[-2].get("Close", 0))
                if c2 > 0:
                    diff = c1 - c2
                    pct = (diff / c2) * 100
                    day_change = f"{diff:.2f} ({pct:.2f}%)"
            except:
                day_change = abs_data.get("day change", "0.00 (0.00%)")
        else:
            day_change = abs_data.get("day change", "0.00 (0.00%)")
        
        # Extract from relative data
        industry = rel_data.get("meta_features", {}).get("industry_name")
        inst_accum = safe_float(rel_data.get("shareholding_momentum_vectors", {}).get("institutional_accumulation_qoq"))
        v_squeeze = safe_float(rel_data.get("risk_and_forensic_signals", {}).get("volatility_squeeze_index"))
        pledge_d = safe_float(rel_data.get("shareholding_momentum_vectors", {}).get("promoter_pledge_delta"))

        insert_data.append((
            slug, ticker, name, market_cap_type, market_cap, pe_ratio, 
            day_change, industry, inst_accum, v_squeeze,
            pledge_d, abs_json_str, rel_json_str
        ))
        
        if len(insert_data) >= 500:
            con.executemany("INSERT INTO stocks_staging VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", insert_data)
            insert_data = []
            
    if insert_data:
        con.executemany("INSERT INTO stocks_staging VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", insert_data)
            
    import glob
    print("Calculating Global RS Ratings...")
    con.execute("""
        CREATE TABLE stocks AS 
        WITH ranked AS (
            SELECT 
                s.*,
                NULL as abs_tminus1,
                PERCENT_RANK() OVER (
                    PARTITION BY (CASE WHEN CAST(json_extract_string(s.relative_data, '$.relative_strength_signals.rs_nifty_52w') AS DOUBLE) IS NOT NULL THEN 1 ELSE 0 END)
                    ORDER BY CAST(json_extract_string(s.relative_data, '$.relative_strength_signals.rs_nifty_52w') AS DOUBLE) ASC
                ) as raw_rank
            FROM stocks_staging s
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
        
    # ETFs Processing
    etf_json_path = os.path.join(target_dir, "etfs.json")
    if os.path.exists(etf_json_path):
        print("Processing ETFs...")
        etf_parquet_path = os.path.join(target_dir, "etfs.parquet")
        con.execute(f"CREATE TABLE etfs AS SELECT * FROM read_json_auto('{etf_json_path}', maximum_object_size=33554432)")
        print(f"Exporting ETFs to {etf_parquet_path}...")
        con.execute(f"COPY etfs TO '{etf_parquet_path}' (FORMAT PARQUET)")
        
    print("Extracting real seed data for OLAP Timeseries tables (daily_prices, daily_index_prices)...")
    
    # 1. Extract NIFTY daily index prices for the last 5 years
    con.execute("""
        CREATE TABLE daily_index_prices AS
        SELECT 
            'NIFTY50' as index_name,
            strptime(json_extract_string(candle, '$.Date'), '%Y-%m-%d')::DATE as date,
            json_extract_string(candle, '$.Close')::DOUBLE as close
        FROM (
            SELECT UNNEST(from_json(absolute_data->>'$.OHLCV', '["JSON"]')) as candle
            FROM stocks 
            WHERE ticker = 'NIFTY'
        )
        WHERE candle IS NOT NULL
    """)
    print("Extracted real NIFTY daily index prices.")
    
    # 2. Extract daily_prices for stocks
    con.execute("""
        CREATE TABLE daily_prices AS
        SELECT 
            ticker,
            strptime(json_extract_string(candle, '$.Date'), '%Y-%m-%d')::DATE as date,
            json_extract_string(candle, '$.Close')::DOUBLE as close,
            json_extract_string(candle, '$.Close')::DOUBLE as adj_close,
            json_extract_string(candle, '$.Volume')::DOUBLE as volume
        FROM (
            SELECT ticker, UNNEST(from_json(absolute_data->>'$.OHLCV', '["JSON"]')) as candle
            FROM stocks 
            WHERE ticker IS NOT NULL AND ticker != 'N/A' AND ticker != 'NIFTY'
        )
        WHERE candle IS NOT NULL
    """)
    print("Extracted real daily prices for all stocks.")

    # 3. Create quarterly_fundamentals
    con.execute("""
        CREATE TABLE quarterly_fundamentals (
            ticker VARCHAR,
            quarter_end_date DATE,
            revenue DOUBLE,
            net_profit DOUBLE,
            eps DOUBLE,
            roe DOUBLE,
            debt_to_equity DOUBLE,
            pe_ratio DOUBLE
        )
    """)
    
    print("Extracting real quarterly fundamentals...")
    def parse_quarter_date(q_str):
        try:
            m, y = q_str.split(" '")
            months = {"Jan":1, "Feb":2, "Mar":3, "Apr":4, "May":5, "Jun":6, 
                      "Jul":7, "Aug":8, "Sep":9, "Oct":10, "Nov":11, "Dec":12}
            year = 2000 + int(y)
            month = months[m]
            last_day = calendar.monthrange(year, month)[1]
            return f"{year}-{month:02d}-{last_day:02d}"
        except: return None

    fs_res = con.execute("SELECT ticker, absolute_data->>'$.financialStatement' FROM stocks WHERE ticker IS NOT NULL AND ticker != 'N/A'").fetchall()
    
    q_funds = []
    from tqdm import tqdm
    for row in tqdm(fs_res, desc="Extracting Quarterly Fundamentals"):
        ticker = row[0]
        fs_json_str = row[1]
        if not fs_json_str or fs_json_str == 'null': continue
        try:
            fs_data = json.loads(fs_json_str)
            if not isinstance(fs_data, list): continue
            
            quarters_map = {}
            for item in fs_data:
                title = item.get("title", "").lower()
                q_data = item.get("quarterly", {})
                if not isinstance(q_data, dict): continue
                
                for q_str, val in q_data.items():
                    q_date = parse_quarter_date(q_str)
                    if not q_date: continue
                    if q_date not in quarters_map:
                        quarters_map[q_date] = {"revenue": None, "net_profit": None, "eps": None}
                    
                    if "revenue" in title: quarters_map[q_date]["revenue"] = val
                    elif "profit" in title: quarters_map[q_date]["net_profit"] = val
                    elif "eps" in title or "earning" in title: quarters_map[q_date]["eps"] = val
            
            for q_date, metrics in quarters_map.items():
                q_funds.append((
                    ticker,
                    q_date,
                    metrics["revenue"],
                    metrics["net_profit"],
                    metrics["eps"],
                    None,
                    None,
                    None
                ))
        except:
            continue
            
    if q_funds:
        con.executemany("INSERT INTO quarterly_fundamentals VALUES (?, ?, ?, ?, ?, ?, ?, ?)", q_funds)
    print("Extracted real quarterly fundamentals.")

    
    # Attach to the main DB and copy the tables over
    duckdb_path = os.path.join(target_dir, "market_data.duckdb")
    con.execute(f"ATTACH '{duckdb_path}' AS db")
    con.execute("CREATE TABLE IF NOT EXISTS db.daily_index_prices AS SELECT * FROM daily_index_prices")
    con.execute("CREATE TABLE IF NOT EXISTS db.daily_prices AS SELECT * FROM daily_prices")
    con.execute("CREATE TABLE IF NOT EXISTS db.quarterly_fundamentals AS SELECT * FROM quarterly_fundamentals")
    
    # Check if mutual_funds exists in memory, and if so, copy it to the duckdb file
    try:
        con.execute("CREATE TABLE IF NOT EXISTS db.mutual_funds AS SELECT * FROM mutual_funds")
    except duckdb.CatalogException:
        pass
        
    # Check if etfs exists in memory, and if so, copy it to the duckdb file
    try:
        con.execute("CREATE TABLE IF NOT EXISTS db.etfs AS SELECT * FROM etfs")
    except duckdb.CatalogException:
        pass
        
    con.execute("DETACH db")

    print(f"Parquet and DuckDB generation complete.")
    con.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest JSON datasets and export to Parquet.")
    parser.add_argument("--target", required=True, help="Target buffer directory")
    args = parser.parse_args()
    init_db(args.target)
