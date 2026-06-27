import os
import json
import requests
from datetime import datetime
import time

time.sleep(5) # wait for backend reload

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTFOLIO_FILE = os.path.join(BASE_DIR, "datasets/active/portfolio.json")

def main():
    if not os.path.exists(PORTFOLIO_FILE):
        return
        
    with open(PORTFOLIO_FILE, 'r') as f:
        try:
            portfolio = json.load(f)
        except:
            return
            
    if not portfolio.get("holdings"):
        return
        
    today = datetime.now().strftime("%Y-%m-%d")
    
    if portfolio.get("history") and len(portfolio["history"]) > 0 and portfolio["history"][-1]["date"] == today:
        print("Snapshot for today already exists.")
        return

    total_invested = sum(h.get("invested_amount", 0) for h in portfolio["holdings"])
    total_value = 0
    
    try:
        stocks_resp = requests.get("http://localhost:8000/api/stocks").json()
        mfs_resp = requests.get("http://localhost:8000/api/mutual_funds?limit=2000").json()
        all_stocks = {s["slug"]: s for s in stocks_resp}
        all_mfs = {m["scheme_code"] if m.get("scheme_code") else m.get("direct_search_id"): m for m in mfs_resp.get("data", [])}
    except Exception as e:
        print("Failed to fetch from API", e)
        return

    for h in portfolio["holdings"]:
        slug = h["slug"]
        units = h.get("units", 0)
        
        if h["type"] == "STOCKS":
            stock = all_stocks.get(slug)
            if stock:
                price_str = str(stock.get("livePrice", "0"))
                try:
                    price = float(''.join(c for c in price_str if c.isdigit() or c == '.'))
                    total_value += units * price
                except ValueError:
                    # fallback
                    if stock.get("peRatio"):
                        total_value += units * stock.get("peRatio")
        else:
            mf = all_mfs.get(slug)
            if mf and mf.get("historical_navs") and len(mf["historical_navs"]) > 0:
                price = mf["historical_navs"][-1][1]
                total_value += units * price
                
    if "history" not in portfolio:
        portfolio["history"] = []
        
    portfolio["history"].append({
        "date": today,
        "invested": total_invested,
        "value": total_value
    })
    
    with open(PORTFOLIO_FILE, 'w') as f:
        json.dump(portfolio, f, indent=2)

if __name__ == "__main__":
    main()
