import duckdb
import json

con = duckdb.connect('../datasets/A/market_data.duckdb')

con.execute("DROP TABLE IF EXISTS stock_metrics")
con.execute("""
CREATE TABLE stock_metrics (
    ticker VARCHAR,
    roe DOUBLE,
    roic DOUBLE,
    debt_to_equity DOUBLE,
    dividend_yield DOUBLE,
    eps_ttm DOUBLE,
    pb_ratio DOUBLE,
    price_to_sales DOUBLE,
    peg_ratio DOUBLE,
    return_on_assets DOUBLE,
    ev_to_ebitda DOUBLE,
    revenue_3yr_cagr DOUBLE,
    revenue_5yr_cagr DOUBLE,
    profit_3yr_cagr DOUBLE,
    profit_5yr_cagr DOUBLE,
    net_worth_3yr_cagr DOUBLE
)
""")

print("Parsing absolute_data for metrics...")
rows = con.execute("SELECT ticker, absolute_data FROM stocks").fetchall()

insert_data = []
for ticker, abs_data_str in rows:
    if not abs_data_str or abs_data_str == 'null': continue
    try:
        data = json.loads(abs_data_str)
        fs = data.get('financialStatement', [])
        
        rev_3 = rev_5 = prof_3 = prof_5 = nw_3 = None
        for item in fs:
            title = item.get('title', '').lower()
            cagr = item.get('cagr', {})
            if 'revenue' in title:
                rev_3 = cagr.get('threeYearCagr')
                rev_5 = cagr.get('fiveYearCagr')
            elif 'profit' in title:
                prof_3 = cagr.get('threeYearCagr')
                prof_5 = cagr.get('fiveYearCagr')
            elif 'net worth' in title:
                nw_3 = cagr.get('threeYearCagr')
                
        insert_data.append((
            ticker,
            data.get('roe'),
            data.get('roic'),
            data.get('debtToEquity'),
            data.get('divYield') or data.get('dividendYieldInPercent'),
            data.get('epsTtm'),
            data.get('pbRatio'),
            data.get('priceToSales'),
            data.get('pegRatio'),
            data.get('returnOnAssets'),
            data.get('evToEbitda'),
            rev_3, rev_5, prof_3, prof_5, nw_3
        ))
    except Exception as e:
        pass

con.executemany("INSERT INTO stock_metrics VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", insert_data)
print(f"Inserted metrics for {len(insert_data)} stocks.")
