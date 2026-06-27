import duckdb
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def timestamp_to_date(ts):
    # Convert ms timestamp to YYYY-MM-DD
    return datetime.fromtimestamp(ts / 1000.0).strftime('%Y-%m-%d')

def calculate_daily_returns(navs):
    # navs is a list of [timestamp, nav]
    # Sort by timestamp
    navs = sorted(navs, key=lambda x: x[0])
    returns = {}
    for i in range(1, len(navs)):
        prev_nav = navs[i-1][1]
        curr_nav = navs[i][1]
        if prev_nav and prev_nav > 0:
            ret = (curr_nav - prev_nav) / prev_nav
            date_str = timestamp_to_date(navs[i][0])
            returns[date_str] = ret
    return returns

def calculate_rolling_returns(navs, days=21):
    navs = sorted(navs, key=lambda x: x[0])
    returns = {}
    for i in range(len(navs) - days):
        start_nav = navs[i][1]
        end_nav = navs[i + days][1]
        if start_nav and start_nav > 0:
            ret = (end_nav - start_nav) / start_nav
            date_str = timestamp_to_date(navs[i + days][0])
            returns[date_str] = ret
    return returns

def calculate_geometric_mean(returns_list):
    if not returns_list:
        return 0.0
    product = 1.0
    for r in returns_list:
        product *= (1 + r)
    return (product ** (1.0 / len(returns_list))) - 1.0

def main():
    db = duckdb.connect()
    
    # Load all mutual funds that have historical NAVs
    print("Loading mutual funds...")
    df = db.execute("SELECT search_id, fund_name, category, historical_navs FROM 'datasets/active/mutual_funds.parquet' WHERE historical_navs IS NOT NULL").df()
    
    # Find Benchmark (UTI Nifty 50 Index Fund)
    bm_row = df[df['search_id'] == 'uti-nifty-fund-direct-growth']
    if len(bm_row) == 0:
        print("Error: Benchmark fund not found!")
        return
    
    bm_navs = bm_row.iloc[0]['historical_navs']
    # bm_navs might be a numpy array of arrays
    if isinstance(bm_navs, np.ndarray):
        bm_navs = bm_navs.tolist()
        
    bm_returns = calculate_daily_returns(bm_navs)
    bm_rolling = calculate_rolling_returns(bm_navs, days=21)
    
    periods = {
        '1M': 30,
        '3M': 90,
        '6M': 180,
        '1Y': 365,
        '3Y': 3 * 365,
        '5Y': 5 * 365
    }
    
    now = datetime.now()
    
    results = []
    
    print(f"Processing {len(df)} funds...")
    for index, row in df.iterrows():
        fund_id = row['search_id']
        fund_name = row['fund_name']
        category = row['category']
        navs = row['historical_navs']
        
        if isinstance(navs, np.ndarray):
            navs = navs.tolist()
            
        fund_returns = calculate_daily_returns(navs)
        fund_rolling = calculate_rolling_returns(navs, days=21)
        
        fund_data = {
            'search_id': fund_id,
            'fund_name': fund_name,
            'category': category
        }
        
        # Calculate for each period
        for p_name, days in periods.items():
            cutoff_date = (now - timedelta(days=days)).strftime('%Y-%m-%d')
            
            up_fund = []
            up_bm = []
            down_fund = []
            down_bm = []
            
            # Align by date
            for date_str, f_ret in fund_returns.items():
                if date_str >= cutoff_date and date_str in bm_returns:
                    b_ret = bm_returns[date_str]
                    if b_ret > 0:
                        up_fund.append(f_ret)
                        up_bm.append(b_ret)
                    elif b_ret < 0:
                        down_fund.append(f_ret)
                        down_bm.append(b_ret)
            
            # Enforce 30 data point rule for BOTH up and down sets to be statistically significant
            if len(up_fund) >= 30 and len(down_fund) >= 30:
                gm_fund_up = calculate_geometric_mean(up_fund)
                gm_bm_up = calculate_geometric_mean(up_bm)
                gm_fund_down = calculate_geometric_mean(down_fund)
                gm_bm_down = calculate_geometric_mean(down_bm)
                
                # Up Capture
                up_capture = (gm_fund_up / gm_bm_up * 100) if gm_bm_up != 0 else None
                # Down Capture
                down_capture = (gm_fund_down / gm_bm_down * 100) if gm_bm_down != 0 else None
                
                # Cap the absurd extremes (e.g. if benchmark is flat but fund jumps)
                if up_capture is not None and (up_capture > 500 or up_capture < -500):
                    up_capture = None
                if down_capture is not None and (down_capture > 500 or down_capture < -500):
                    down_capture = None
                    
                fund_data[f'up_{p_name}'] = round(up_capture, 2) if up_capture is not None else None
                fund_data[f'down_{p_name}'] = round(down_capture, 2) if down_capture is not None else None
            else:
                fund_data[f'up_{p_name}'] = None
                fund_data[f'down_{p_name}'] = None

            # Calculate Rolling Hit Rates
            up_win = 0
            up_total = 0
            down_win = 0
            down_total = 0
            
            for date_str, f_ret in fund_rolling.items():
                if date_str >= cutoff_date and date_str in bm_rolling:
                    b_ret = bm_rolling[date_str]
                    if b_ret > 0:
                        up_total += 1
                        if f_ret > b_ret:
                            up_win += 1
                    elif b_ret < 0:
                        down_total += 1
                        if f_ret > b_ret:
                            down_win += 1
            
            if up_total >= 10:
                fund_data[f'up_hit_{p_name}'] = round((up_win / up_total), 4)
            else:
                fund_data[f'up_hit_{p_name}'] = None
                
            if down_total >= 10:
                fund_data[f'down_hit_{p_name}'] = round((down_win / down_total), 4)
            else:
                fund_data[f'down_hit_{p_name}'] = None
                
        results.append(fund_data)
        
    out_df = pd.DataFrame(results)
    
    # Save to parquet
    output_path = "datasets/active/capture_ratios.parquet"
    print(f"Saving to {output_path}...")
    db.execute(f"COPY (SELECT * FROM out_df) TO '{output_path}' (FORMAT 'parquet')")
    print("Done!")

if __name__ == "__main__":
    main()
