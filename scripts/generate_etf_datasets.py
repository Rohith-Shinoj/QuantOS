import os
import sys
import json
import argparse
import requests
from bs4 import BeautifulSoup
from time import sleep
from datetime import datetime
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import random

def fetch_etf_ohlcv(ticker, session):
    if not ticker: return []
    end_ts = int(time.time() * 1000)
    start_ts = end_ts - (5 * 365 * 24 * 60 * 60 * 1000)
    url = f"https://groww.in/v1/api/charting_service/v2/chart/delayed/exchange/NSE/segment/CASH/{ticker}?endTimeInMillis={end_ts}&intervalInMinutes=1440&startTimeInMillis={start_ts}"
    try:
        resp = session.get(url, timeout=10)
        if resp.status_code != 200: 
            url = f"https://groww.in/v1/api/charting_service/v2/chart/delayed/exchange/BSE/segment/CASH/{ticker}?endTimeInMillis={end_ts}&intervalInMinutes=1440&startTimeInMillis={start_ts}"
            resp = session.get(url, timeout=10)
            if resp.status_code != 200: return []
        data = resp.json()
        return data.get("candles", [])
    except: return []

def process_etf(slug, session):
    url = f"https://groww.in/etfs/{slug}"
    try:
        # Add a random jitter
        time.sleep(random.uniform(0.0, 1.0))
        resp = session.get(url, timeout=10)
        if resp.status_code != 200: return None
        
        soup = BeautifulSoup(resp.text, "html.parser")
        script = soup.find("script", id="__NEXT_DATA__")
        if not script: return None
        
        full_json = json.loads(script.string)
        page_props = full_json.get("props", {}).get("pageProps", {})
        
        etf_data = page_props.get("etfData", {})
        header = etf_data.get("header", {})
        if not header and "etfInfoData" in page_props:
            header = page_props.get("etfInfoData", {}).get("header", {})
        
        # Groww ETF pages usually have header in pageProps.etfData.header or we can extract it directly
        if not header:
            # Fallback in case they change the API structure
            return None
            
        ticker = header.get("nseSymbol") or header.get("bseTradingSymbol") or header.get("symbol") or header.get("nseScriptCode")
        
        # Scrape OHLCV
        candles = fetch_etf_ohlcv(ticker, session)
        ohlcv_converted = []
        for c in candles:
            try:
                ts = float(c[0])
                if ts > 10**11: ts = ts / 1000.0
                ohlcv_converted.append({
                    "Timestamp": ts, 
                    "Open": float(c[1]), 
                    "High": float(c[2]), 
                    "Low": float(c[3]), 
                    "Close": float(c[4]), 
                    "Volume": float(c[5]) if c[5] is not None else 0.0,
                    "Date": datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
                })
            except: continue
        
        # Extract ETF specific fields
        fundamentals = page_props.get("fundamentalsData", {})
        stats = {
            "aumInCrores": fundamentals.get("aumInCrores"),
            "expenseRatio": fundamentals.get("expenseRatio"),
            "trackingError": fundamentals.get("trackingError"),
            "peRatio": fundamentals.get("peRatio"),
            "pbRatio": fundamentals.get("pbRatio"),
            "nav": fundamentals.get("nav")
        }
        
        category_returns = page_props.get("categoryReturnsData", {})
        stats["returns"] = category_returns
        
        # Extract Holdings & map company names
        raw_holdings = page_props.get("etfHoldingsData", {}).get("holdings", [])
        company_map = page_props.get("companyHeadersByIsin", {})
        
        holdings = []
        for h in raw_holdings:
            isin = h.get("isin")
            comp = company_map.get(isin, {})
            holdings.append({
                "isin": isin,
                "company_name": comp.get("displayName") or isin,
                "allocation": h.get("holdingSharePercentage")
            })
            
        sectors = page_props.get("sectorsData", {}).get("etfSectorSummary", {}).get("sectors", [])
        
        etf_obj = {
            "slug": slug,
            "type": "ETF",
            "ticker": ticker,
            "name": header.get("displayName") or slug.replace("-", " ").title(),
            "marketCap": stats.get("aumInCrores"),
            "peRatio": stats.get("peRatio"),
            "livePrice": None,
            "dayChange": None,
            "dayChangePerc": None,
            "OHLCV": ohlcv_converted,
            "header": header,
            "holdings": holdings,
            "stats": stats,
            "sectors": sectors
        }
        
        # Try to extract live price from html
        import re
        price_match = re.search(r"<span[^>]*tickerUi_livePrice[^>]*>(.*?)</span>", resp.text)
        if price_match:
            try: etf_obj["livePrice"] = float(price_match.group(1).replace("₹", "").replace(",", "").strip())
            except: pass
            
        change_match = re.search(r"<span[^>]*tickerUi_dayChange[^>]*>(.*?)</span>", resp.text)
        if change_match:
            etf_obj["dayChange"] = change_match.group(1).strip()
            
        if etf_obj["livePrice"] is None and ohlcv_converted:
            etf_obj["livePrice"] = float(ohlcv_converted[-1]["Close"])
            
        return etf_obj
    except Exception as e:
        print(f"Error parsing ETF {slug}: {e}")
        return None

def fetch_all_etfs(target_dir, slugs_file):
    if not os.path.exists(slugs_file): return
    with open(slugs_file, 'r') as f:
        all_slugs = [l.strip() for l in f if l.strip()]
        
    etf_slugs = [s for s in all_slugs if "etf" in s.lower() or "-exchange-traded-fund" in s.lower() or s.lower().endswith("-bees") or s.lower().endswith("-beesm")]
    print(f"Found {len(etf_slugs)} ETFs in {slugs_file}")
    
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0"})
    
    results = []
    with ThreadPoolExecutor(max_workers=32) as executor:
        futures = {executor.submit(process_etf, slug, session): slug for slug in etf_slugs}
        for future in tqdm(as_completed(futures), total=len(etf_slugs), desc="Scraping ETFs"):
            res = future.result()
            if res: results.append(res)
            
    os.makedirs(target_dir, exist_ok=True)
    out_path = os.path.join(target_dir, "etfs.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
        
    print(f"Successfully saved {len(results)} ETFs to {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True, help="Target buffer directory (e.g., datasets/B)")
    parser.add_argument("--slugs", default="stock_slugs.txt", help="Text file with slugs")
    args = parser.parse_args()
    fetch_all_etfs(args.target, args.slugs)
