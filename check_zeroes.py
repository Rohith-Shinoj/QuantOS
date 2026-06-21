import duckdb
con = duckdb.connect(":memory:")
res = con.execute("SELECT COUNT(*) FROM 'datasets/active/market_data.parquet' WHERE inst_accum = 0").fetchone()
print(f"Zero Inst Accum: {res[0]}")
res_null = con.execute("SELECT COUNT(*) FROM 'datasets/active/market_data.parquet' WHERE inst_accum IS NULL").fetchone()
print(f"Null Inst Accum: {res_null[0]}")
