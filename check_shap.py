import duckdb
con = duckdb.connect(":memory:")
res = con.execute("SELECT ticker, rs_rating, alpha_score, inst_accum, shap_reason_1 FROM 'datasets/active/market_data.parquet' ORDER BY alpha_score DESC LIMIT 20").df()
print(res)
