import duckdb
import json
import pandas as pd
con = duckdb.connect(':memory:')
data = con.execute("SELECT absolute_data FROM 'datasets/active/market_data.parquet' WHERE absolute_data IS NOT NULL").fetchall()
for row in data:
    d = json.loads(row[0])
    if 'OHLCV' in d and len(d['OHLCV']) > 0:
        print(pd.DataFrame(d['OHLCV']).columns)
        break
