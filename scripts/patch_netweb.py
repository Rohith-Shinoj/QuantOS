import duckdb
import json
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.generate_datasets import GrowwFetcher

fetcher = GrowwFetcher()
res = fetcher.get_stock_data("netweb-technologies-india-ltd")
if not res:
    print("Failed to fetch")
    sys.exit(1)

technicals = res["raw_next_data"].get("stocksTechnicalsData", {})

con = duckdb.connect("datasets/active/market_data.duckdb")
row = con.execute("SELECT absolute_data FROM stocks WHERE slug = 'netweb-technologies-india-ltd'").fetchone()
if row and row[0]:
    abs_data = json.loads(row[0])
    abs_data["technicals"] = technicals
    new_json = json.dumps(abs_data)
    con.execute("UPDATE stocks SET absolute_data = ? WHERE slug = 'netweb-technologies-india-ltd'", (new_json,))
    print("Successfully patched NETWEB!")
else:
    print("Row not found")
