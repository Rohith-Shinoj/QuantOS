import yfinance as yf

ticker = yf.Ticker("RELIANCE.NS")
rec = ticker.upgrades_downgrades
print(rec)
