import sys
import json
import duckdb
sys.path.append('scripts')
from generate_datasets import TrendlyneFetcher, MLDatasetEngineer

ticker = 'SBIN'
slug = 'state-bank-of-india'
print(f"Fetching news for {ticker}...")
news = TrendlyneFetcher().get_news(ticker)

eng = MLDatasetEngineer(slug, {"header": {"nseSymbol": ticker}}, {}, {}, None)
# Mock the news in eng
eng.news_cache = {ticker: news}
eng._derive_news = lambda: eng.__class__._derive_news(eng) # bypass
# wait, I can just use the function
eng.stock_data = {"header": {"nseSymbol": ticker}}
news_data = eng._derive_news()

print(f"Computed news data: {json.dumps(news_data)[:200]}...")

con = duckdb.connect("datasets/active/market_data.parquet")
# Wait, parquet files are read-only in DuckDB. We have to rewrite the parquet.
# That's too risky to do manually.
