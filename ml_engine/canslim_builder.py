import duckdb
import json
import pandas as pd
import numpy as np
from tqdm import tqdm
import os

def parse_inst_holding(shp):
    if not shp: return 0.0
    try:
        latest_q = list(shp.keys())[-1]
        data = shp[latest_q]
        mf = data.get('mutualFunds', {}).get('percent', 0)
        fi = data.get('foreignInstitutions', {}).get('percent', 0)
        di = 0
        other_dom = data.get('otherDomesticInstitutions', {})
        if isinstance(other_dom, dict):
            for k, v in other_dom.items():
                if isinstance(v, dict):
                    di += v.get('percent', 0)
                else:
                    di += v
        return float(mf) + float(fi) + float(di)
    except:
        return 0.0

def parse_earnings(fin_stmt):
    c_growth = 0.0
    a_growth = 0.0
    
    if not fin_stmt: return c_growth, a_growth
    
    profit_stmt = next((item for item in fin_stmt if item.get('title') == 'Profit'), None)
    if not profit_stmt: return c_growth, a_growth
    
    # Current (Quarterly QoQ)
    q_data = profit_stmt.get('quarterly', {})
    if q_data and len(q_data) >= 2:
        vals = list(q_data.values())
        latest = vals[-1]
        prev = vals[-2] 
        if prev > 0:
            c_growth = (latest - prev) / prev
        elif prev <= 0 and latest > 0:
            c_growth = 1.0 # Turnaround
            
    # Annual (Yearly CAGR)
    y_data = profit_stmt.get('yearly', {})
    if y_data and len(y_data) >= 2:
        years = sorted([int(y) for y in y_data.keys() if str(y).isdigit()])
        latest_y = str(years[-1])
        start_y_idx = max(0, len(years)-4) # up to 3 years ago
        start_y = str(years[start_y_idx])
        
        latest_val = y_data.get(latest_y, 0)
        start_val = y_data.get(start_y, 0)
        
        num_years = len(years) - 1 - start_y_idx
        if num_years > 0 and start_val > 0 and latest_val > 0:
            a_growth = (latest_val / start_val) ** (1/num_years) - 1
        elif start_val <= 0 and latest_val > 0:
            a_growth = 1.0 # Turnaround
            
    return c_growth, a_growth

def build_canslim():
    con = duckdb.connect(':memory:')
    query = "SELECT slug, absolute_data FROM 'datasets/active/market_data.parquet' WHERE absolute_data IS NOT NULL"
    data = con.execute(query).fetchall()
    
    rows = []
    
    for slug, abs_json_str in tqdm(data, desc="Parsing CANSLIM"):
        try:
            d = json.loads(abs_json_str)
            
            # Fundamentals
            inst_hold = parse_inst_holding(d.get('shareHoldingPattern', {}))
            c_growth, a_growth = parse_earnings(d.get('financialStatement', []))
            
            # Technicals
            ohlcv = d.get('OHLCV', [])
            latest_close = 0
            high_52w = 0
            vol_surge = False
            within_10p_high = False
            adtv = 0
            days_since_trade = 999
            
            if ohlcv:
                df = pd.DataFrame(ohlcv)
                if len(df) > 0 and 'Close' in df.columns:
                    df['Date'] = pd.to_datetime(df['Date'], format='%d-%m-%Y', errors='coerce')
                    latest_date = df['Date'].max()
                    days_since_trade = (pd.Timestamp('2026-06-25') - latest_date).days # using fixed date near execution
                    
                    latest_close = df['Close'].iloc[-1]
                    recent_252 = df.tail(252)
                    high_52w = recent_252['High'].max() if 'High' in df.columns else recent_252['Close'].max()
                    
                    if high_52w > 0:
                        within_10p_high = latest_close >= (high_52w * 0.90)
                        
                    if 'Volume' in df.columns and len(df) >= 50:
                        sma_50_vol = df['Volume'].rolling(50).mean().iloc[-2] 
                        latest_vol = df['Volume'].iloc[-1]
                        if sma_50_vol > 0:
                            vol_surge = latest_vol > (sma_50_vol * 1.5)
                            
                        recent_20 = df.tail(20)
                        adtv = (recent_20['Close'] * recent_20['Volume']).mean()

            row = {
                'slug': slug,
                'companyName': d.get('displayName', slug),
                'industry': d.get('header_raw', {}).get('industryName', 'Unknown'),
                'latest_close': latest_close,
                'adtv': adtv,
                'days_since_trade': days_since_trade,
                'C_growth': c_growth,
                'A_growth': a_growth,
                'N_near_high': within_10p_high,
                'S_vol_surge': vol_surge,
                'I_inst_hold': inst_hold,
            }
            rows.append(row)
        except Exception as e:
            continue
            
    df = pd.DataFrame(rows)
    os.makedirs('datasets/active/canslim', exist_ok=True)
    df.to_parquet('datasets/active/canslim/canslim_data.parquet', index=False)

if __name__ == "__main__":
    build_canslim()
