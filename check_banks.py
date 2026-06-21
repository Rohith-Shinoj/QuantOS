import duckdb
con = duckdb.connect(":memory:")
res = con.execute("SELECT slug, ticker, alpha_score, industry FROM 'datasets/active/market_data.parquet' WHERE industry = 'Banks' ORDER BY alpha_score DESC LIMIT 5").df()
print(res)
