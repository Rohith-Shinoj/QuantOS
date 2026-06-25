import duckdb
import json
import pandas as pd
import numpy as np
from tqdm import tqdm
import os

def extract_financial_growth(fin_stmt):
    growth_metrics = {
        'revenue_growth_yoy': np.nan,
        'profit_growth_yoy': np.nan
    }
    
    if not fin_stmt:
        return growth_metrics
        
    for statement in fin_stmt:
        title = statement.get('title', '')
        yearly = statement.get('yearly', {})
        if not yearly: continue
        
        years = sorted([int(y) for y in yearly.keys() if str(y).isdigit()])
        if len(years) >= 2:
            latest_year = str(years[-1])
            prev_year = str(years[-2])
            
            latest_val = yearly.get(latest_year, 0)
            prev_val = yearly.get(prev_year, 0)
            
            if prev_val and prev_val != 0:
                growth = (latest_val - prev_val) / abs(prev_val)
                if title == 'Revenue':
                    growth_metrics['revenue_growth_yoy'] = growth
                elif title == 'Profit':
                    growth_metrics['profit_growth_yoy'] = growth
                    
    return growth_metrics

def build_fundamentals():
    print("Connecting to DuckDB Parquet...")
    con = duckdb.connect(':memory:')
    query = "SELECT slug, absolute_data FROM 'datasets/active/market_data.parquet' WHERE absolute_data IS NOT NULL"
    data = con.execute(query).fetchall()
    
    rows = []
    print(f"Extracting fundamentals for {len(data)} stocks...")
    
    for slug, abs_json_str in tqdm(data, desc="Parsing Fundamentals"):
        try:
            d = json.loads(abs_json_str)
            meta = d.get('meta', {})
            fin_stmt = d.get('financialStatement', [])
            
            ohlcv = d.get("OHLCV", [])
            adtv = 0
            latest_close = 0
            if ohlcv and len(ohlcv) >= 20:
                recent_20 = ohlcv[-20:]
                total_val = sum(day.get('Close', 0) * day.get('Volume', 0) for day in recent_20)
                adtv = total_val / 20.0
                latest_close = ohlcv[-1].get('Close', 0)
                
            growth = extract_financial_growth(fin_stmt)
            
            row = {
                'slug': slug,
                'companyName': d.get('displayName', slug),
                'industry': d.get('header_raw', {}).get('industryName', 'Unknown'),
                'marketCap': d.get('marketCap', 0), 
                'peRatio': d.get('peRatio', np.nan),
                'pbRatio': d.get('pbRatio', np.nan),
                'pegRatio': d.get('pegRatio', np.nan),
                'evToEbitda': d.get('evToEbitda', np.nan),
                'roe': d.get('returnOnEquity', np.nan),
                'roic': d.get('roic', np.nan),
                'debtToEquity': d.get('debtToEquity', np.nan),
                'netProfitMargin': d.get('netProfitMargin', np.nan),
                'pePremiumVsSector': d.get('pePremiumVsSector', np.nan),
                'revenue_growth_yoy': growth['revenue_growth_yoy'],
                'profit_growth_yoy': growth['profit_growth_yoy'],
                'latest_close': latest_close,
                'adtv_20d': adtv
            }
            rows.append(row)
        except Exception as e:
            continue
            
    df = pd.DataFrame(rows)
    
    for col in df.columns:
        if col not in ['slug', 'companyName', 'industry']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
            
    os.makedirs('datasets/active/fundamentals', exist_ok=True)
    df.to_parquet('datasets/active/fundamentals/fundamental_data.parquet', index=False)
    print(f"Successfully extracted fundamentals for {len(df)} stocks.")

if __name__ == "__main__":
    build_fundamentals()
