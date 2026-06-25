import duckdb
import json

con = duckdb.connect(':memory:')
query = "SELECT absolute_data FROM 'datasets/active/market_data.parquet' WHERE absolute_data IS NOT NULL LIMIT 1"
res = con.execute(query).fetchone()

if res:
    data = json.loads(res[0])
    # Print top-level keys
    print("Top-level keys:", data.keys())
    
    # If 'meta' exists, print its keys
    if 'meta' in data:
        print("\nMeta keys:", data['meta'].keys())
        
        # If there are fundamental metrics, print a sample
        print("\nSample Meta Data:")
        for k, v in data['meta'].items():
            if k not in ['companyName', 'description', 'industry']:
                print(f"  {k}: {v}")
    
    # Print other keys if they look like financials
    for k in data.keys():
        if k not in ['meta', 'OHLCV']:
            print(f"\n{k} structure:")
            print(str(data[k])[:500])
