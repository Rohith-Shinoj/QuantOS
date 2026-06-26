import re
from nlp_router import parse_natural_language_to_sql

q = 'defence stocks with PE below 20 but positive profit growth'
p = parse_natural_language_to_sql(q)
print("WHERE:", p['sql_where_clause'])
