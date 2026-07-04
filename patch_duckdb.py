import duckdb
import json
from scripts.generate_datasets import TrendlyneFetcher
from datetime import datetime

con = duckdb.connect("datasets/active/market_data.duckdb")

# Fetch HCLTECH and RELIANCE
for ticker, slug in [("HCLTECH", "hcl-technologies-ltd"), ("RELIANCE", "reliance-industries-ltd")]:
    print(f"Updating {ticker}...")
    news = TrendlyneFetcher().get_news(ticker)
    
    raw_feed = []
    now = datetime.now()
    for n in news:
        try:
            pub_date = datetime.fromisoformat(n["pubDate"].replace('Z', ''))
            raw_feed.append({
                "date": pub_date.strftime('%b %d'),
                "title": n["title"],
                "score": 0.5, # mock score
                "tag": "General",
                "timestamp": pub_date.isoformat()
            })
        except: pass
        
    print(f"Got {len(raw_feed)} news items")
    
    # Update DuckDB
    row = con.execute("SELECT relative_data FROM stocks WHERE slug = ?", (slug,)).fetchone()
    if row:
        rel_data = json.loads(row[0])
        rel_data["aggregated_news_signals"]["raw_feed"] = raw_feed
        con.execute("UPDATE stocks SET relative_data = ? WHERE slug = ?", (json.dumps(rel_data), slug))

con.commit()
con.close()
print("Done!")
