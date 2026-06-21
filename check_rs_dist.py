import duckdb

con = duckdb.connect(":memory:")
res = con.execute("SELECT rs_rating, COUNT(*) FROM 'datasets/active/market_data.parquet' GROUP BY rs_rating ORDER BY rs_rating DESC LIMIT 20").fetchall()
for row in res:
    print(row)

res_null = con.execute("SELECT COUNT(*) FROM 'datasets/active/market_data.parquet' WHERE rs_rating = 1").fetchone()
print(f"Total with RS 1: {res_null[0]}")
