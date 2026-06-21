import os
import re
import json
import time
import math
import argparse
import requests
import numpy as np
from datetime import datetime, date
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed

# --- UTILITIES & HELPERS ---

def clean_float(val):
    if val is None or val == '-':
        return None
    try:
        if isinstance(val, (int, float)):
            return float(val)
        clean_str = re.sub(r'[₹%, \s]', '', str(val))
        if not clean_str or clean_str == '-':
            return None
        return float(clean_str)
    except (ValueError, TypeError):
        return None

def parse_quarter(q_str):
    """Parses 'Mar '25' into a date object for chronological sorting."""
    try:
        m, y = q_str.split(" '")
        months = {"Jan":1, "Feb":2, "Mar":3, "Apr":4, "May":5, "Jun":6, 
                  "Jul":7, "Aug":8, "Sep":9, "Oct":10, "Nov":11, "Dec":12}
        return date(2000 + int(y), months[m], 1)
    except:
        return date(1970, 1, 1)

def get_indicator_verdict(name, value, ltp):
    """
    Simple heuristic for technical verdicts (from parser.py).
    """
    if value is None or ltp is None:
        return "Unknown"
    
    try:
        if isinstance(ltp, str):
            ltp = float(ltp.replace('₹', '').replace(',', '').strip())
        value = float(value)
    except:
        return "Unknown"

    name_lower = name.lower()
    if "rsi" in name_lower:
        if value > 70: return "Overbought"
        if value < 30: return "Oversold"
        return "Neutral"
    if "macd" in name_lower:
        return "Bullish" if value > 0 else "Bearish"
    if "sma" in name_lower or "ema" in name_lower:
        return "Bullish" if ltp > value else "Bearish"
    return "Neutral"

# --- ACQUISITION ---

class GrowwFetcher:
    def __init__(self, session=None):
        self.session = session or requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })

    def get_stock_details(self, slug, retries=3):
        # ETF check: groww.in/etfs/{slug} vs groww.in/stocks/{slug}
        path_type = "etfs" if "etf" in slug.lower() else "stocks"
        url = f"https://groww.in/{path_type}/{slug}/technicals"
        
        for i in range(retries):
            try:
                response = self.session.get(url, timeout=15)
                if response.status_code == 429:
                    time.sleep(2 ** i) # Exponential backoff
                    continue
                response.raise_for_status()
                return response.text
            except Exception:
                if i < retries - 1:
                    time.sleep(1)
                continue
        return None

    def get_ohlcv(self, ticker, exchange="NSE", retries=3):
        if not ticker:
            return None
        
        end_time = int(time.time() * 1000)
        start_time = 1465756200000 # June 2016
        url = f"https://groww.in/v1/api/charting_service/v2/chart/delayed/exchange/{exchange}/segment/CASH/{ticker}?endTimeInMillis={end_time}&intervalInMinutes=10080&startTimeInMillis={start_time}"
        
        for i in range(retries):
            try:
                response = self.session.get(url, timeout=15)
                if response.status_code == 429:
                    time.sleep(2 ** i)
                    continue
                response.raise_for_status()
                return response.json()
            except Exception:
                if i < retries - 1:
                    time.sleep(1)
                continue
        return None

# --- PARSING & ENGINEERING ---

class DatasetEngineer:
    def __init__(self, html_content, ohlcv_raw):
        self.html = html_content
        self.ohlcv_raw = ohlcv_raw or {}
        self.data = {}

    def parse_and_engineer(self):
        # 1. Parse HTML (Logic from parser.py)
        self._parse_html()
        
        # 2. Engineer (Logic from engineer.py)
        self._engineer_ohlcv()
        self._engineer_holdings()
        self._engineer_health_scores()
        
        return self.data

    def _parse_html(self):
        # Extract Live Price & Day Change from HTML
        price_match = re.search(r"<span[^>]*tickerUi_livePrice[^>]*>(.*?)</span>", self.html)
        live_price_str = price_match.group(1).strip() if price_match else None
        self.data["live price"] = live_price_str
        
        change_match = re.search(r"<span[^>]*tickerUi_dayChange[^>]*>(.*?)</span>", self.html)
        self.data["day change"] = change_match.group(1).strip() if change_match else None

        # Extract __NEXT_DATA__
        json_match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', self.html, re.DOTALL)
        if json_match:
            try:
                full_json = json.loads(json_match.group(1))
                page_props = full_json.get("props", {}).get("pageProps", {})
                stock_data = page_props.get("stockData", {})
                
                if stock_data:
                    header = stock_data.get("header", {})
                    
                    # Extensive key list discovered from research
                    ticker_keys = ["nseSymbol", "nseScriptCode", "bseTradingSymbol", "symbol", "bseSymbol", "bseScriptCode"]
                    extracted_ticker = None
                    
                    # Pass 1: Try to find ANY non-numeric symbol across all potential keys
                    for key in ticker_keys:
                        val = header.get(key)
                        if val and not str(val).isdigit():
                            extracted_ticker = str(val).strip()
                            break
                    
                    # Pass 2: Absolute worst-case fallback (Numeric BSE codes)
                    if not extracted_ticker:
                        for key in ticker_keys:
                            val = header.get(key)
                            if val:
                                extracted_ticker = str(val).strip()
                                break
                                
                    self.data["ticker"] = extracted_ticker
                    self.data["displayName"] = header.get("displayName")
                    
                    stats = stock_data.get("stats", {})
                    for key, val in stats.items():
                        if key not in self.data:
                            self.data[key] = val
                    
                    fundamentals = stock_data.get("fundamentals", [])
                    for item in fundamentals:
                        name = item.get("name")
                        value = item.get("value")
                        if name:
                            self.data[name] = value
                    
                    self.data["shareHoldingPattern"] = stock_data.get("shareHoldingPattern")
                    self.data["financialStatement"] = stock_data.get("financialStatement")

                # News
                news_data = page_props.get("newsData", [])
                if news_data:
                    formatted_news = []
                    now = datetime.now()
                    for item in news_data:
                        pub_date_str = item.get("pubDate")
                        days_ago = None
                        if pub_date_str:
                            try:
                                pub_date = datetime.fromisoformat(pub_date_str.split('.')[0])
                                days_ago = (now - pub_date).days
                                if days_ago < 0: days_ago = 0
                            except: pass
                        formatted_news.append({
                            "content": item.get("title"),
                            "recency": f"{days_ago} days ago" if days_ago is not None else "Unknown",
                            "days_ago": days_ago
                        })
                    self.data["news"] = formatted_news

                # Technicals
                tech_data = page_props.get("stocksTechnicalsData", {})
                if tech_data:
                    self.data["Support & Resistance"] = {
                        "R1": tech_data.get("r1"), "R2": tech_data.get("r2"), "R3": tech_data.get("r3"),
                        "S1": tech_data.get("s1"), "S2": tech_data.get("s2"), "S3": tech_data.get("s3"),
                        "Pivot": tech_data.get("pivotPoint")
                    }
                    
                    indicators = {}
                    for key, label in [("rsi14", "RSI"), ("macd", "MACD"), ("beta", "Beta")]:
                        val = tech_data.get(key)
                        indicators[label] = {
                            "value": val,
                            "verdict": get_indicator_verdict(label, val, live_price_str)
                        }
                    self.data["Indicators"] = indicators

                    ma = {}
                    for days in [10, 20, 50, 100, 200]:
                        key = f"sma{days}Days"
                        val = tech_data.get(key)
                        ma[f"SMA {days}"] = {
                            "value": val,
                            "verdict": get_indicator_verdict(f"SMA{days}", val, live_price_str)
                        }
                    self.data["Moving Averages"] = ma

                # Delivery Volume
                vol_stats = page_props.get("stocksVolumeStatsData", {}).get("data", [])
                if vol_stats:
                    latest = vol_stats[0]
                    total = latest.get("totalVolume", 0)
                    delivery = latest.get("deliveryVolume", 0)
                    if total and total > 0:
                        self.data["deliveryPercentage"] = round((delivery / total) * 100, 2)
                    else:
                        self.data["deliveryPercentage"] = None

            except Exception:
                pass

    def _engineer_ohlcv(self):
        candles = self.ohlcv_raw.get('candles', [])
        formatted_ohlcv = []
        relative_ohlcv = []
        ml_features = {}
        
        if candles:
            candles.sort(key=lambda x: x[0])
            
            closes = [c[4] for c in candles]
            highs = [c[2] for c in candles]
            lows = [c[3] for c in candles]
            opens = [c[1] for c in candles]
            volumes = [c[5] for c in candles]
            
            for i in range(len(candles)):
                c = candles[i]
                ts, op, hi, lo, cl, vol = c
                
                log_ret = 0.0
                if i > 0 and closes[i-1] > 0:
                    log_ret = math.log(cl / closes[i-1])
                
                hi_rel = (hi - op) / op if op > 0 else 0
                lo_rel = (lo - op) / op if op > 0 else 0
                cl_rel = (cl - op) / op if op > 0 else 0
                
                vol_rel = 1.0
                if i >= 19:
                    avg_vol = sum(volumes[i-19:i+1]) / 20
                    vol_rel = vol / avg_vol if avg_vol > 0 else 1.0
                    
                relative_ohlcv.append({
                    "ts": ts,
                    "log_return": round(log_ret, 6),
                    "high_rel": round(hi_rel, 6),
                    "low_rel": round(lo_rel, 6),
                    "close_rel": round(cl_rel, 6),
                    "vol_rel": round(vol_rel, 6)
                })

                date_str = datetime.fromtimestamp(ts).strftime('%d-%m-%Y')
                formatted_ohlcv.append({
                    'Date': date_str,
                    'Open': op, 'High': hi, 'Low': lo, 'Close': cl, 'Volume': vol
                })

            def get_ret(periods):
                if len(closes) > periods and closes[-periods-1] > 0:
                    return round(((closes[-1] - closes[-periods-1]) / closes[-periods-1]) * 100, 2)
                return None
            
            ml_features["Price_Momentum"] = {
                "Return_1W (%)": get_ret(1),
                "Return_1M (%)": get_ret(4),
                "Return_3M (%)": get_ret(13),
                "Return_6M (%)": get_ret(26),
                "Return_1Y (%)": get_ret(52)
            }

        self.data['OHLCV'] = formatted_ohlcv
        self.data['Relative_OHLCV'] = relative_ohlcv
        self.data["Derived_Features"] = ml_features

    def _engineer_holdings(self):
        shp = self.data.get("shareHoldingPattern", {})
        if shp:
            sorted_qs = sorted(shp.items(), key=lambda x: parse_quarter(x[0]))
            if len(sorted_qs) >= 4:
                def get_fii(q_data):
                    try: return q_data["foreignInstitutions"]["percent"]
                    except: return 0.0
                
                fii_latest = get_fii(sorted_qs[-1][1])
                fii_4q_ago = get_fii(sorted_qs[-4][1])
                
                if "Derived_Features" not in self.data:
                    self.data["Derived_Features"] = {}
                
                self.data["Derived_Features"]["Holdings_Velocity"] = {
                    "FII_Trend_1Y (%)": round(fii_latest - fii_4q_ago, 4)
                }

    def _engineer_health_scores(self):
        score = self._calculate_piotroski_f_score()
        if "Derived_Features" not in self.data:
            self.data["Derived_Features"] = {}
        self.data["Derived_Features"]["Health_Scores"] = {
            "Piotroski_F_Score": score
        }

    def _calculate_piotroski_f_score(self):
        score = 0
        financials = self.data.get("financialStatement", [])
        if not isinstance(financials, list): return 0
        
        rev_stmt = next((s for s in financials if isinstance(s, dict) and s.get("title") == "Revenue"), {})
        prof_stmt = next((s for s in financials if isinstance(s, dict) and s.get("title") == "Profit"), {})
        
        q_rev = rev_stmt.get("quarterly", {})
        q_prof = prof_stmt.get("quarterly", {})
        if not isinstance(q_rev, dict): q_rev = {}
        if not isinstance(q_prof, dict): q_prof = {}
        
        sorted_qs = sorted(q_prof.keys(), key=parse_quarter)
        if not sorted_qs: return 0
        
        latest_q = sorted_qs[-1]
        prev_q = sorted_qs[-2] if len(sorted_qs) > 1 else None
        y_ago_q = sorted_qs[-5] if len(sorted_qs) > 4 else None
        
        if q_prof.get(latest_q, 0) > 0: score += 1
        if prev_q and q_prof.get(latest_q, 0) > q_prof.get(prev_q, 0): score += 1
        
        q_rev_latest = q_rev.get(latest_q, 0)
        q_prof_latest = q_prof.get(latest_q, 0)
        if q_rev_latest > 0:
            margin_latest = q_prof_latest / q_rev_latest
            if y_ago_q:
                q_rev_y = q_rev.get(y_ago_q, 0)
                q_prof_y = q_prof.get(y_ago_q, 0)
                if q_rev_y > 0:
                    margin_y = q_prof_y / q_rev_y
                    if margin_latest > margin_y: score += 1
                    
        if y_ago_q and q_rev.get(latest_q, 0) > q_rev.get(y_ago_q, 0): score += 1
        
        return score

# --- MAIN ORCHESTRATOR ---

def process_stock(slug, fetcher, args):
    try:
        html = fetcher.get_stock_details(slug)
        if not html:
            return False

        # Pre-parse to get ticker
        json_match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
        ticker = None
        if json_match:
            try:
                full_json = json.loads(json_match.group(1))
                header = full_json.get("props", {}).get("pageProps", {}).get("stockData", {}).get("header", {})
                
                ticker_keys = ["nseSymbol", "nseScriptCode", "bseTradingSymbol", "symbol", "bseSymbol", "bseScriptCode"]
                
                # Pass 1: Seek Alphabetic
                for key in ticker_keys:
                    val = header.get(key)
                    if val and not str(val).isdigit():
                        ticker = str(val).strip()
                        break
                
                # Pass 2: Fallback
                if not ticker:
                    for key in ticker_keys:
                        val = header.get(key)
                        if val:
                            ticker = str(val).strip()
                            break
            except:
                pass

        ohlcv = None
        if ticker:
            ohlcv = fetcher.get_ohlcv(ticker, "NSE")
            if not ohlcv or not ohlcv.get("candles"):
                 ohlcv = fetcher.get_ohlcv(ticker, "BSE")

        engineer = DatasetEngineer(html, ohlcv)
        result = engineer.parse_and_engineer()

        if result:
            output_path = os.path.join(args.output_dir, f"{slug}.json")
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=4, ensure_ascii=False)
            return True

    except Exception:
        return False
    return False

def main():
    parser = argparse.ArgumentParser(description="Build enriched dataset for all stocks (Parallel).")
    parser.add_argument("--slugs", default="stock_slugs.txt", help="Path to stock slugs file")
    parser.add_argument("--target", required=True, help="Target buffer directory (e.g., datasets/inactive)")
    parser.add_argument("--limit", type=int, help="Limit number of stocks to process")
    parser.add_argument("--workers", type=int, default=15, help="Number of parallel threads")
    args = parser.parse_args()

    args.output_dir = os.path.join(args.target, "absolute_dataset")
    if not os.path.exists(args.output_dir):
        os.makedirs(args.output_dir)

    if not os.path.exists(args.slugs):
        print(f"Error: {args.slugs} not found.")
        return

    with open(args.slugs, 'r') as f:
        slugs = [line.strip() for line in f if line.strip()]

    if args.limit:
        slugs = slugs[:args.limit]

    fetcher = GrowwFetcher()

    print(f"Starting parallel processing of {len(slugs)} stocks with {args.workers} workers...")
    
    success_count = 0
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(process_stock, slug, fetcher, args): slug for slug in slugs}

        for future in tqdm(as_completed(futures), total=len(slugs), desc="Processing stocks"):
            slug = futures[future]
            try:
                if future.result():
                    success_count += 1
            except Exception as e:
                pass

    print(f"\nProcessing complete.")
    print(f"Total Slugs Attempted: {len(slugs)}")
    print(f"Total JSONs Generated: {success_count}")

if __name__ == "__main__":
    main()
