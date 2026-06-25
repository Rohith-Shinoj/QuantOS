import os
import json
import duckdb
import numpy as np
import pandas as pd
from tqdm import tqdm

def compute_historical_features(df_ohlcv):
    df = df_ohlcv.copy()
    df['Date'] = pd.to_datetime(df['Date'], format='%d-%m-%Y')
    df = df.sort_values('Date').reset_index(drop=True)
    
    # Base Returns
    df['log_ret'] = np.log(df['Close'] / df['Close'].shift(1)).fillna(0)
    df['return'] = df['Close'].pct_change().fillna(0)
    
    # Target: T+5 Forward Cumulative Return (scaled by 100 for stability)
    df['target_return_5d'] = (df['Close'].shift(-5) / df['Close'] - 1.0).fillna(0) * 100.0
    
    # Multi-Timeframe Momentum
    for window in [3, 5, 10, 21]:
        rolling_mean = df['log_ret'].rolling(window=window, min_periods=1).mean()
        rolling_std = df['log_ret'].rolling(window=window, min_periods=1).std().replace(0, 1e-5)
        df[f'z_score_{window}d'] = (df['log_ret'] - rolling_mean) / rolling_std
        
    df['z_score_1d'] = df['log_ret'] / df['log_ret'].rolling(window=10, min_periods=1).std().replace(0, 1e-5)
    
    # 20d & 50d SMA Distances
    sma20 = df['Close'].rolling(window=20, min_periods=1).mean()
    df['sma20_ratio'] = (df['Close'] / sma20) - 1.0
    sma50 = df['Close'].rolling(window=50, min_periods=1).mean()
    df['sma50_ratio'] = (df['Close'] / sma50) - 1.0
    
    # Bollinger Band Squeeze
    std20 = df['Close'].rolling(window=20, min_periods=1).std().fillna(0)
    df['bb_width'] = (4 * std20) / sma20.replace(0, 1)
    
    # RSI 14
    delta = df['Close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14, min_periods=1).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14, min_periods=1).mean()
    rs = gain / loss.replace(0, 1)
    df['rsi_norm'] = (100 - (100 / (1 + rs))) / 100.0
    
    # Calculate ADTV (Average Daily Traded Value)
    df['ADTV'] = (df['Close'] * df['Volume']).rolling(window=20, min_periods=1).mean()
    
    # Liquidity and Price Filters
    # Price > 50 INR and ADTV > 50,000,000 INR (5 Crore)
    df = df[(df['Close'] > 50) & (df['ADTV'] > 50000000)].copy()
    
    df = df.replace([np.inf, -np.inf], np.nan).fillna(0.0)
    
    features = ['return', 'z_score_1d', 'z_score_3d', 'z_score_5d', 'z_score_10d', 'z_score_21d', 
                'sma20_ratio', 'sma50_ratio', 'bb_width', 'rsi_norm']
    
    return df, features

def build_xgboost_dataset(parquet_path, output_dir):
    print("Connecting to DuckDB Parquet...")
    con = duckdb.connect(":memory:")
    query = f"SELECT slug, absolute_data FROM '{parquet_path}' WHERE absolute_data IS NOT NULL"
    data = con.execute(query).fetchall()
    
    all_dfs = []
    sector_to_id = {"Unknown": 0}
    
    print(f"Extracted {len(data)} stocks. Building features...")
    
    for slug, abs_json_str in tqdm(data, desc="Processing Stocks"):
        try:
            abs_data = json.loads(abs_json_str)
            ohlcv = abs_data.get("OHLCV", [])
            if not ohlcv or len(ohlcv) < 20: continue
            
            df = pd.DataFrame(ohlcv)
            if 'Date' not in df.columns or 'Close' not in df.columns: continue
            
            sector = abs_data.get("meta", {}).get("sector", "Unknown")
            if sector not in sector_to_id:
                sector_to_id[sector] = len(sector_to_id)
            sector_id = sector_to_id[sector]
            
            df_feat, feat_cols = compute_historical_features(df)
            df_feat['slug'] = slug
            df_feat['sector_id'] = sector_id
            
            keep_cols = ['Date', 'slug', 'sector_id', 'target_return_5d'] + feat_cols
            all_dfs.append(df_feat[keep_cols])
        except: pass

    print("Concatenating all stocks into master DataFrame...")
    master_df = pd.concat(all_dfs, ignore_index=True)
    master_df['Date'] = pd.to_datetime(master_df['Date'])
    
    print("Computing Point-in-Time Market-Wide Regimes...")
    market_stats = master_df.groupby('Date').agg(
        mkt_ret=('return', 'mean'),
        mkt_vol=('return', 'std'),
        advances=('return', lambda x: (x > 0).sum()),
        declines=('return', lambda x: (x < 0).sum())
    ).reset_index()
    
    market_stats['ad_ratio'] = market_stats['advances'] / (market_stats['declines'] + 1e-5)
    market_stats['mkt_vol'] = market_stats['mkt_vol'].fillna(0)
    market_stats = market_stats[['Date', 'mkt_ret', 'mkt_vol', 'ad_ratio']]
    
    master_df = pd.merge(master_df, market_stats, on='Date', how='left')
    master_df = master_df.sort_values(['Date', 'slug']).reset_index(drop=True)
    
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, "xgboost_dataset.parquet")
    
    print(f"Saving flat dataset to {out_path}...")
    master_df.to_parquet(out_path, index=False)
    
    meta_info = {
        "num_sectors": len(sector_to_id),
        "features": feat_cols + ['mkt_ret', 'mkt_vol', 'ad_ratio']
    }
    with open(os.path.join(output_dir, "xgboost_meta.json"), 'w') as f:
        json.dump(meta_info, f)
        
    print(f"Phase 1 Complete. Dataset shape: {master_df.shape}")

if __name__ == "__main__":
    parquet = os.path.realpath("datasets/active/market_data.parquet")
    output = "datasets/active/tensors"
    build_xgboost_dataset(parquet, output)
