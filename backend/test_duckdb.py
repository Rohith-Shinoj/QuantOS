import duckdb
con = duckdb.connect('../datasets/A/market_data.duckdb', read_only=True)
query = """
SELECT 
    absolute_data->>'$.financialStatement'
FROM stocks 
WHERE ticker='HDFCBANK'
LIMIT 1
"""
print(con.execute(query).fetchall())
