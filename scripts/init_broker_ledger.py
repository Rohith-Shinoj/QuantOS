import duckdb
con = duckdb.connect("datasets/broker_ledger.duckdb")

con.execute("""
CREATE TABLE IF NOT EXISTS broker_targets (
    slug VARCHAR,
    ticker VARCHAR,
    broker VARCHAR,
    recommendation_date DATE,
    action VARCHAR,
    target_price DOUBLE,
    price_at_reco DOUBLE,
    is_target_met BOOLEAN,
    status VARCHAR DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (slug, broker, recommendation_date)
);
""")
print("Broker ledger initialized.")
