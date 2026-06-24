import os
import sys
import json
import duckdb
import argparse
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from tqdm import tqdm

# Ensure we can import from scripts
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from scripts.generate_datasets import MLDatasetEngineer, clean_float, sanitize_nan

def load_index_maps(target_dir):
    """Reconstruct index maps from the current active parquet if possible."""
    parquet_path = os.path.join(target_dir, "market_data.parquet")
    if not os.path.exists(parquet_path):
        return {}, {}
    
    con = duckdb.connect(":memory:")
    # We need a robust market breadth map. We can calculate it globally across all history.
    print("Calculating historical market breadth for backfill...")
    breadth_map = {}
    try:
        data = con.execute(f"SELECT absolute_data FROM '{parquet_path}' WHERE absolute_data IS NOT NULL").fetchall()
        breadth_counts = {}
        for row in tqdm(data, desc="Processing Breadth"):
            try:
                abs_json = json.loads(row[0])
                ohlcv = abs_json.get("OHLCV", [])
                if len(ohlcv) < 52: continue
                closes = [c["Close"] for c in ohlcv]
                for i in range(50, len(ohlcv)):
                    sma50 = sum(closes[i-50:i]) / 50.0
                    dt = ohlcv[i]["Date"]
                    if dt not in breadth_counts: breadth_counts[dt] = [0, 0]
                    breadth_counts[dt][0] += (1 if closes[i] > sma50 else 0)
                    breadth_counts[dt][1] += 1
            except: continue
        for dt, counts in breadth_counts.items():
            breadth_map[dt] = counts[0] / counts[1] if counts[1] > 0 else 0.5
    except Exception as e:
        print(f"Failed to calculate historical breadth: {e}")

    # Reconstruct index map from actual index stocks if they are in the dataset
    index_map = {}
    indices = {"NIFTY": "NIFTY 50", "INDIAVIX": "INDIA VIX", "NIFTYSMALLCAP250": "NIFTY SMALLCAP 250", "NIFTYMIDCAP150": "NIFTY MIDCAP 150"}
    
    for key in indices.keys():
        # For this backfill, if we don't have the exact index OHLCV, we will mock it 
        # using the general market trend or we rely on the relative features skipping it safely.
        pass # In a production environment, we'd query the historical index data here.
        
    con.close()
    return index_map, breadth_map

def find_ref_idx_for_date(ohlcv, target_date):
    """Find the index of the OHLCV array that is closest to but not after the target_date."""
    if not ohlcv: return -1
    best_idx = -1
    for i, candle in enumerate(ohlcv):
        try:
            # Handle both formats
            dt = None
            if "Timestamp" in candle:
                ts = float(candle["Timestamp"])
                if ts > 10**11: ts = ts / 1000.0
                dt = datetime.fromtimestamp(ts)
            elif "Date" in candle:
                dt = datetime.strptime(candle["Date"], "%d-%m-%Y")
                
            if dt and dt <= target_date:
                best_idx = i
            elif dt and dt > target_date:
                break # Since it's sorted chronologically
        except: continue
    return best_idx

def synthesize_snapshot(target_dir, snapshot_date):
    print(f"\n--- Synthesizing Snapshot for {snapshot_date.strftime('%Y-%m-%d')} ---")
    absolute_dir = os.path.join(target_dir, "absolute_dataset")
    if not os.path.exists(absolute_dir):
        print("Error: Absolute dataset not found.")
        return

    index_map, breadth_map = load_index_maps(target_dir)
    
    con = duckdb.connect(":memory:")
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

    insert_data = []
    success_count = 0
    
    for filename in tqdm(os.listdir(absolute_dir), desc="Synthesizing"):
        if not filename.endswith('.json'): continue
        slug = filename.replace('.json', '')
        
        with open(os.path.join(absolute_dir, filename), 'r') as f:
            abs_data = json.load(f)
            
        ohlcv = abs_data.get("OHLCV", [])
        if not ohlcv: continue
        
        # Format OHLCV for the engineer if it's the simplified format
        formatted_ohlcv = []
        for c in ohlcv:
            if "Timestamp" not in c and "Date" in c:
                dt = datetime.strptime(c["Date"], "%d-%m-%Y")
                c["Timestamp"] = dt.timestamp()
            formatted_ohlcv.append(c)
            
        ref_idx = find_ref_idx_for_date(formatted_ohlcv, snapshot_date)
        if ref_idx < 50: continue # Not enough history at that point in time

        # Mock the raw data structure expected by MLDatasetEngineer
        raw_data = {
            "live_price": 0.0, # Forces it to use OHLCV close
            "raw_next_data": {
                "stockData": {
                    "financialStatement": abs_data.get("financialStatement", []),
                    "shareHoldingPattern": abs_data.get("shareHoldingPattern", {}),
                    "stats": abs_data,
                    "header": abs_data.get("header_raw", {"industryName": abs_data.get("industry", "Unknown")})
                }
            }
        }
        
        try:
            rel_engineer = MLDatasetEngineer(
                raw_data, 
                formatted_ohlcv, 
                ref_idx=ref_idx, 
                index_map=index_map, 
                market_breadth_map=breadth_map
            )
            rel_data = sanitize_nan(rel_engineer.derive_all())
            
            # Materialize
            ticker = abs_data.get("ticker", "N/A")
            name = abs_data.get("displayName")
            market_cap_type = abs_data.get("cappedType")
            
            # Use point-in-time close price to approximate point-in-time market cap (very rough approximation)
            current_price = clean_float(abs_data.get("live price"))
            pit_price = float(formatted_ohlcv[ref_idx]["Close"])
            price_ratio = pit_price / current_price if current_price and current_price > 0 else 1.0
            pit_market_cap = float(abs_data.get("marketCap", 0)) * price_ratio
            
            pe_ratio = abs_data.get("peRatio")
            
            industry = rel_data.get("meta_features", {}).get("industry_name")
            inst_accum = rel_data.get("shareholding_momentum_vectors", {}).get("institutional_accumulation_qoq")
            v_squeeze = rel_data.get("risk_and_forensic_signals", {}).get("volatility_squeeze_index")
            qes_flag = rel_data.get("risk_and_forensic_signals", {}).get("qes_forensic_red_flag")
            tax_div = rel_data.get("risk_and_forensic_signals", {}).get("tax_profit_divergence")
            pledge_d = rel_data.get("shareholding_momentum_vectors", {}).get("promoter_pledge_delta")
            
            # Store PIT absolute data
            pit_abs_data = abs_data.copy()
            pit_abs_data["marketCap"] = pit_market_cap
            pit_abs_data["live price"] = pit_price
            pit_abs_data["OHLCV"] = formatted_ohlcv[:ref_idx+1]
            
            insert_data.append((
                slug, ticker, name, market_cap_type, pit_market_cap, pe_ratio, 
                "0.0", industry, inst_accum, v_squeeze, qes_flag,
                tax_div, pledge_d, json.dumps(pit_abs_data), json.dumps(rel_data)
            ))
            success_count += 1
            
            if len(insert_data) >= 500:
                con.executemany("INSERT INTO stocks_staging VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", insert_data)
                insert_data = []
        except Exception as e:
            continue
            
    if insert_data:
        con.executemany("INSERT INTO stocks_staging VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", insert_data)
        
    print(f"Successfully synthesized {success_count} records for {snapshot_date.strftime('%Y-%m-%d')}.")
    
    if success_count > 0:
        snapshot_dir = "datasets/snapshots"
        os.makedirs(snapshot_dir, exist_ok=True)
        snapshot_path = os.path.join(snapshot_dir, f"snapshot_{snapshot_date.strftime('%Y-%m-%d')}.parquet")
        
        # Calculate RS Rating
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
        
        con.execute(f"COPY stocks TO '{snapshot_path}' (FORMAT PARQUET)")
        print(f"Exported to {snapshot_path}")
    con.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Synthesize historical PIT snapshots.")
    parser.add_argument("--target", required=True, help="Target buffer directory (e.g., datasets/active)")
    parser.add_argument("--months-back", type=int, nargs='+', default=[12, 24, 36], help="List of months back to synthesize")
    args = parser.parse_args()
    
    active_target = os.path.realpath(args.target)
    
    for months in args.months_back:
        target_date = datetime.now() - relativedelta(months=months)
        synthesize_snapshot(active_target, target_date)
