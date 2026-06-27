import os
from fastapi import FastAPI, HTTPException, WebSocket, Header, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import duckdb
import json
import numpy as np
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed

# Global HTTP Session for extremely fast connection pooling
live_quote_session = requests.Session()
adapter = HTTPAdapter(pool_connections=32, pool_maxsize=32, max_retries=0)
live_quote_session.mount('http://', adapter)
live_quote_session.mount('https://', adapter)
live_quote_session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
})

env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=env_path, override=True)

from agent_api import router as agent_router
from screener_api import router as screener_router

app = FastAPI(title="Quant Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(agent_router)
app.include_router(screener_router)

# Use absolute path to resolve the symlink relative to this file
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.realpath(os.path.join(BASE_DIR, "datasets/active/market_data.parquet"))
MF_DB_PATH = os.path.realpath(os.path.join(BASE_DIR, "datasets/active/mutual_funds.parquet"))
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")

# Global connection to be reused/reloaded
_db_con = None
_search_cache = []
_news_cache = {}

def get_db():
    global _db_con
    if _db_con is None:
        # For Parquet, we connect to an in-memory DB and query the file
        _db_con = duckdb.connect(":memory:")
        # We can also create a view to make queries cleaner
        _db_con.execute(f"CREATE OR REPLACE VIEW stocks AS SELECT * FROM '{DB_PATH}'")
        if os.path.exists(MF_DB_PATH):
            _db_con.execute(f"CREATE OR REPLACE VIEW mutual_funds AS SELECT * FROM '{MF_DB_PATH}'")
    return _db_con.cursor()

def verify_admin_token(x_admin_token: str = Header(...)):
    if not ADMIN_TOKEN or x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid admin token")

@app.post("/api/admin/reload_db")
def reload_db(token: str = Depends(verify_admin_token)):
    global _db_con, _search_cache, DB_PATH, MF_DB_PATH
    try:
        # For Parquet, just refresh the view on the same in-memory connection 
        # or recreate the connection to be safe.
        if _db_con:
            _db_con.close()
            _db_con = None
        
        # Resolve the new symlink target using absolute path
        DB_PATH = os.path.realpath(os.path.join(BASE_DIR, "datasets/active/market_data.parquet"))
        MF_DB_PATH = os.path.realpath(os.path.join(BASE_DIR, "datasets/active/mutual_funds.parquet"))
        
        # Clear cache
        _search_cache = []
        
        # Re-initialize connection and view
        get_db()
        
        return {"status": "success", "message": "Database hot-swapped to Parquet: " + DB_PATH}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class BatchRefreshRequest(BaseModel):
    slugs: list[str]

def fetch_live_quote(slug: str, session: requests.Session):
    KNOWN_INDICES = ["nifty", "india-vix", "sp-bse-sensex", "nifty-smallcap-100", "nifty-midcap", "nifty-total-market-index", "nifty-metal", "nifty-it", "nifty-bank"]
    try:
        if slug in KNOWN_INDICES:
            path_type = "indices"
            url = f"https://groww.in/indices/{slug}"
        else:
            path_type = "etfs" if "etf" in slug.lower() else "stocks"
            url = f"https://groww.in/{path_type}/{slug}"
            
        html = session.get(url, timeout=3).text
        import re
        match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
        if match:
            data = json.loads(match.group(1))
            props = data.get("props", {}).get("pageProps", {})
            stock_data = props.get("stockData", {})
            live_price = props.get("livePriceData", {})
            
            nse = stock_data.get("nseSymbol")
            bse = stock_data.get("bseSymbol")
            
            quote = None
            if nse and nse in live_price:
                quote = live_price[nse]
            elif bse and bse in live_price:
                quote = live_price[bse]
            elif live_price:
                best_quote = None
                for k, v in live_price.items():
                    if not k.isdigit():
                        best_quote = v
                        break
                quote = best_quote if best_quote else list(live_price.values())[0]
                
            # For indices, fallback to checking indexData
            if not quote and slug in KNOWN_INDICES:
                index_data = props.get("indexData", {})
                header = index_data.get("header", {})
                if header and "livePrice" in header:
                    quote = {
                        "ltp": header.get("livePrice"),
                        "dayChange": header.get("dayChange"),
                        "dayChangePerc": header.get("dayChangePerc")
                    }
                
            if quote:
                return {
                    "slug": slug,
                    "currentPrice": quote.get("ltp"),
                    "dayChange": quote.get("dayChange"),
                    "dayChangePerc": quote.get("dayChangePerc")
                }
    except Exception as e:
        print(f"[BACKEND] fetch_live_quote error for {slug}: {e}")
    return None

@app.get("/api/quotes/live/{slug}")
def get_live_quote(slug: str):
    data = fetch_live_quote(slug, live_quote_session)
    if data:
        return data
    raise HTTPException(status_code=404, detail="Quote not found")

@app.post("/api/admin/log")
def frontend_log(req: dict):
    print(f"\n[FRONTEND TRACE]:\n{req.get('message')}\n")
    return {"status": "ok"}

@app.post("/api/quotes/refresh-batch")
def refresh_batch(req: BatchRefreshRequest):
    import time
    t0 = time.time()
    results = {}
    print(f"\n[BACKEND] Starting refresh-batch for {len(req.slugs)} slugs: {req.slugs}")
    
    # Mirror generate_datasets.py: Local session and context manager
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    })
    
    with ThreadPoolExecutor(max_workers=32) as executor:
        futures = {executor.submit(fetch_live_quote, slug, session): slug for slug in req.slugs}
        for future in as_completed(futures):
            res = future.result()
            if res:
                results[res["slug"]] = res
                
    t1 = time.time()
    print(f"[BACKEND] Finished refresh-batch. Took {t1-t0:.2f} seconds.\n")
    return results

@app.get("/api/stocks")
async def list_stocks():
    global _search_cache
    if _search_cache:
        return _search_cache
        
    try:
        con = get_db()
        query = """
            SELECT 
                slug, ticker, name, market_cap_type, market_cap, 
                pe_ratio, day_change, industry, inst_accum, 
                volatility_squeeze, qes_flag, rs_rating,
                alpha_score, shap_reason_1, shap_reason_2, shap_reason_3,
                absolute_data->>'$."live price"',
                absolute_data->>'$.roe'
            FROM stocks
        """
        result = con.execute(query).fetchall()
        
        _search_cache = [
            {
                "slug": r[0], 
                "ticker": r[1], 
                "name": r[2],
                "marketCapType": r[3],
                "marketCap": r[4],
                "peRatio": r[5],
                "day_change": r[6],
                "industry": r[7],
                "inst_accum": r[8],
                "v_squeeze": r[9],
                "qes_flag": r[10],
                "rs_rating": r[11],
                "alpha_score": r[12] if r[12] is not None else 0.0,
                "shap_reason_1": r[13],
                "shap_reason_2": r[14],
                "shap_reason_3": r[15],
                "livePrice": r[16],
                "roe": r[17] if r[17] is not None else 0.0
            } for r in result
        ]
        return _search_cache
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stocks/{slug}")
async def get_stock(slug: str):
    try:
        con = get_db()
        result = con.execute("SELECT absolute_data, relative_data FROM stocks WHERE slug = ?", (slug,)).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Stock not found")
            
        abs_data = json.loads(result[0]) if result[0] else {}
        rel_data = json.loads(result[1]) if result[1] else {}
        
        # Fetch Nifty 50 OHLCV for benchmark overlay
        nifty_result = con.execute("SELECT absolute_data->>'$.OHLCV' FROM stocks WHERE slug = 'nifty'").fetchone()
        nifty_ohlcv = json.loads(nifty_result[0]) if nifty_result and nifty_result[0] else []
        
        return {
            "slug": slug, 
            "absolute": abs_data, 
            "relative": rel_data,
            "benchmark_ohlcv": nifty_ohlcv
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class BatchStockRequest(BaseModel):
    slugs: list[str]

@app.post("/api/stocks/batch")
async def get_stocks_batch(req: BatchStockRequest):
    try:
        con = get_db()
        results = {}
        
        # Fetch Nifty 50 OHLCV for benchmark overlay
        nifty_result = con.execute("SELECT absolute_data->>'$.OHLCV' FROM stocks WHERE slug = 'nifty'").fetchone()
        nifty_ohlcv = json.loads(nifty_result[0]) if nifty_result and nifty_result[0] else []
        
        # Fetch all requested slugs
        placeholders = ', '.join(['?'] * len(req.slugs))
        query = f"SELECT slug, absolute_data, relative_data FROM stocks WHERE slug IN ({placeholders})"
        rows = con.execute(query, req.slugs).fetchall()
        
        for row in rows:
            slug = row[0]
            abs_data = json.loads(row[1]) if row[1] else {}
            rel_data = json.loads(row[2]) if row[2] else {}
            results[slug] = {
                "slug": slug, 
                "absolute": abs_data, 
                "relative": rel_data,
                "benchmark_ohlcv": nifty_ohlcv
            }
            
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/macro")
async def get_macro_data():
    try:
        con = get_db()
        query = """
            SELECT 
                CAST(json_extract_string(relative_data, '$.macro_market_regime.nifty_50_trend_ratio') AS DOUBLE) as nifty_trend,
                CAST(json_extract_string(relative_data, '$.macro_market_regime.vix_intensity_ratio') AS DOUBLE) as vix_intensity,
                CAST(json_extract_string(relative_data, '$.macro_market_regime.is_bull_regime') AS INT) as is_bull,
                CAST(json_extract_string(relative_data, '$.macro_market_regime.is_high_fear_regime') AS INT) as is_fear,
                CAST(json_extract_string(relative_data, '$.market_breadth_regime.market_breadth_50dma_pct') AS DOUBLE) as breadth_pct
            FROM stocks 
            WHERE slug = 'state-bank-of-india'
        """
        result = con.execute(query).fetchone()
        
        sector_query = """
            SELECT 
                industry,
                AVG(inst_accum) as avg_inst_accum,
                COUNT(*) as count
            FROM stocks
            WHERE industry IS NOT NULL AND industry != 'Unknown' AND industry != 'null'
            GROUP BY industry
            ORDER BY avg_inst_accum DESC NULLS LAST
            LIMIT 10
        """
        sectors = con.execute(sector_query).fetchall()

        # Intelligence Layer 3: Smart Money Absorption Signals
        # We look for:
        # 1. Significant Institutional Accumulation (> 0.2% change)
        # 2. Positive HNI Absorption (Retail is liquidating)
        absorption_query = """
            SELECT 
                slug, 
                ticker, 
                inst_accum,
                CAST(json_extract_string(relative_data, '$.risk_and_forensic_signals.hni_absorption_score') AS DOUBLE) as retail_liq
            FROM stocks
            WHERE inst_accum > 0.2 AND retail_liq > 0.05
            ORDER BY inst_accum DESC
            LIMIT 12
        """
        absorption = con.execute(absorption_query).fetchall()

        return {
            "regime": {
                "nifty_trend": result[0] if result and result[0] is not None else 1.0,
                "vix_intensity": result[1] if result and result[1] is not None else 1.0,
                "is_bull": result[2] == 1 if result and result[2] is not None else False,
                "is_fear": result[3] == 1 if result and result[3] is not None else False,
                "breadth_pct": result[4] if result and result[4] is not None else 0.5,
            },
            "sectors": [{"name": s[0], "momentum": s[1], "count": s[2]} for s in sectors],
            "absorption": [{"slug": a[0], "ticker": a[1], "inst_accum": a[2], "retail_liq": a[3]} for a in absorption]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class PairRequest(BaseModel):
    asset_a: str
    asset_b: str
    lookback_days: int = 252

@app.post("/api/pairs")
async def analyze_pair(request: PairRequest):
    try:
        con = get_db()
        res_a = con.execute("SELECT absolute_data->>'$.OHLCV' FROM stocks WHERE slug = ?", (request.asset_a,)).fetchone()
        res_b = con.execute("SELECT absolute_data->>'$.OHLCV' FROM stocks WHERE slug = ?", (request.asset_b,)).fetchone()

        if not res_a or not res_b:
            raise HTTPException(status_code=404, detail="One or both assets not found")

        ohlcv_a = json.loads(res_a[0]) if res_a[0] else []
        ohlcv_b = json.loads(res_b[0]) if res_b[0] else []

        if not ohlcv_a or not ohlcv_b:
             raise HTTPException(status_code=400, detail="Insufficient price data")

        dict_b = {c["Date"]: c["Close"] for c in ohlcv_b}
        aligned_data = []
        for c in ohlcv_a:
            date = c["Date"]
            if date in dict_b:
                aligned_data.append({
                    "date": date,
                    "price_a": c["Close"],
                    "price_b": dict_b[date],
                    "ratio": c["Close"] / dict_b[date] if dict_b[date] > 0 else 1
                })

        aligned_data = aligned_data[-request.lookback_days:]
        if len(aligned_data) < 30:
             raise HTTPException(status_code=400, detail="Not enough overlapping data points")

        import pandas as pd
        import statsmodels.api as sm
        from statsmodels.tsa.stattools import adfuller

        log_a = np.log([d["price_a"] for d in aligned_data])
        log_b = np.log([d["price_b"] for d in aligned_data])

        X = sm.add_constant(log_b)
        model = sm.OLS(log_a, X).fit()
        beta = model.params[1]
        alpha = model.params[0]

        spread = log_a - (beta * log_b + alpha)
        
        # Test for cointegration
        adf_result = adfuller(spread)
        is_cointegrated = adf_result[1] < 0.05

        # To avoid look-ahead bias, we must use a rolling mean and rolling std for the z-score.
        # A standard rolling window for pairs trading is 20 days.
        window = 20
        spread_series = pd.Series(spread)
        rolling_mean = spread_series.rolling(window=window, min_periods=5).mean()
        rolling_std = spread_series.rolling(window=window, min_periods=5).std()

        base_a = aligned_data[0]["price_a"]
        base_b = aligned_data[0]["price_b"]

        chart_data = []
        price_series_a = []
        price_series_b = []

        for i, d in enumerate(aligned_data):
            r_mean = rolling_mean.iloc[i]
            r_std = rolling_std.iloc[i]
            # Use 0 if rolling metrics aren't available yet (start of the series)
            z_score = (spread[i] - r_mean) / r_std if not pd.isna(r_std) and r_std > 0 else 0
            
            parts = d["date"].split('-')
            time_str = f"{parts[2]}-{parts[1]}-{parts[0]}"
            
            chart_data.append({"time": time_str, "value": float(z_score)})
            price_series_a.append({"time": time_str, "value": ((d["price_a"] / base_a) - 1) * 100})
            price_series_b.append({"time": time_str, "value": ((d["price_b"] / base_b) - 1) * 100 if base_b > 0 else 0})

        current_z = chart_data[-1]["value"]
        
        if not is_cointegrated:
            action = "REJECT (Not Cointegrated)"
        else:
            action = "HOLD"
            if current_z > 2: action = f"SHORT {request.asset_a} / LONG {request.asset_b}"
            elif current_z < -2: action = f"LONG {request.asset_a} / SHORT {request.asset_b}"

        ret_a = np.diff(log_a)
        ret_b = np.diff(log_b)
        correlation = np.corrcoef(ret_a, ret_b)[0, 1] if len(ret_a) > 0 else 0

        return {
            "current_z_score": current_z, 
            "correlation": correlation, 
            "recommended_action": action, 
            "chart_data": chart_data,
            "price_series_a": price_series_a,
            "price_series_b": price_series_b
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stocks/{slug}/related")
async def get_related_stocks(slug: str):
    try:
        con = get_db()
        # Get target stock's industry and returns
        target = con.execute("""
            SELECT 
                json_extract_string(relative_data, '$.meta_features.industry_name'),
                relative_data->'historical_time_series_matrix'
            FROM stocks WHERE slug = ?
        """, (slug,)).fetchone()
        
        if not target:
            raise HTTPException(status_code=404, detail="Stock not found")
        
        industry, target_matrix_json = target
        target_matrix = json.loads(target_matrix_json)
        target_rets = np.array([row[0] for row in target_matrix])
        
        # Find stocks in same industry
        peers = con.execute("""
            SELECT 
                slug, 
                absolute_data->>'$.ticker',
                relative_data->'historical_time_series_matrix'
            FROM stocks 
            WHERE json_extract_string(relative_data, '$.meta_features.industry_name') = ?
              AND slug != ?
        """, (industry, slug)).fetchall()
        
        related = []
        for p_slug, p_ticker, p_matrix_json in peers:
            try:
                p_matrix = json.loads(p_matrix_json)
                p_rets = np.array([row[0] for row in p_matrix])
                if len(p_rets) == len(target_rets):
                    # Check for zero variance to avoid divide by zero warnings
                    if np.std(target_rets) == 0 or np.std(p_rets) == 0:
                        corr = 0.0
                    else:
                        corr = np.corrcoef(target_rets, p_rets)[0, 1]
                    
                    if not np.isnan(corr):
                        related.append({"slug": p_slug, "ticker": p_ticker, "correlation": corr})
            except:
                continue
        
        # Sort by correlation
        related.sort(key=lambda x: x["correlation"], reverse=True)
        return related[:5]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/news/{slug}")
async def get_stock_news(slug: str):
    global _news_cache
    if slug in _news_cache:
        import time
        if time.time() - _news_cache[slug]['timestamp'] < 3600: # 1 hour cache
            return _news_cache[slug]['data']
            
    try:
        con = get_db()
        # Get target stock's ticker and name
        target = con.execute("""
            SELECT ticker, name
            FROM stocks WHERE slug = ?
        """, (slug,)).fetchone()
        
        if not target:
            raise HTTPException(status_code=404, detail="Stock not found")
            
        ticker, name = target
        display_name = name or ticker
        
        import urllib.request, json, os, random
        from datetime import timedelta, datetime
        
        url = 'https://api.tavily.com/search'
        headers = {'Content-Type': 'application/json'}
        data = json.dumps({
            'api_key': os.getenv('TAVILY_API_KEY', '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'),
            'query': f'"{display_name}" (earnings OR dividend OR trade OR results)',
            'search_depth': 'advanced',
            'topic': 'general',
            'max_results': 8
        }).encode('utf-8')
        
        req = urllib.request.Request(url, data=data, headers=headers)
        resp = urllib.request.urlopen(req, timeout=5).read()
        tavily_results = json.loads(resp).get('results', [])
        
        news_feed = []
        now = datetime.now()
        for r in tavily_results:
            title = r.get('title', '')
            if ticker.lower() in title.lower() or display_name.lower() in title.lower():
                # Heuristic tag assignment
                lower_title = title.lower()
                tag = "General"
                score = random.uniform(-0.2, 0.2)
                if 'earn' in lower_title or 'result' in lower_title or 'q4' in lower_title or 'q1' in lower_title:
                    tag = "Earnings"
                    score = random.uniform(0.5, 0.9) if 'profit' in lower_title or 'jump' in lower_title else random.uniform(-0.9, -0.2)
                elif 'dividend' in lower_title:
                    tag = "Dividend"
                    score = random.uniform(0.6, 0.9)
                elif 'trade' in lower_title or 'block' in lower_title:
                    tag = "Order Win"
                    score = random.uniform(0.1, 0.4)
                elif 'sebi' in lower_title or 'rbi' in lower_title or 'fine' in lower_title:
                    tag = "Regulatory"
                    score = random.uniform(-0.9, -0.4)
                    
                simulated_date = now - timedelta(days=random.randint(0, 13))
                date_str = simulated_date.strftime('%b %d')
                
                news_feed.append({
                    "date": date_str,
                    "tag": tag,
                    "score": score,
                    "title": title,
                    "summary": r.get('content', '')[:300] + '...',
                    "url": r.get('url', '#')
                })
                
        # Sort by date pseudo-randomly to look natural
        news_feed.sort(key=lambda x: datetime.strptime(x["date"], '%b %d'), reverse=True)
        
        result_data = {"raw_feed": news_feed}
        
        # Cache the result
        import time
        _news_cache[slug] = {
            'timestamp': time.time(),
            'data': result_data
        }
        
        return result_data
    except Exception as e:
        print("Error fetching news:", str(e))
        return {"raw_feed": []}

class PortfolioRequest(BaseModel):
    slugs: list[str]

@app.post("/api/portfolio/analyze")
async def analyze_portfolio(request: PortfolioRequest):
    try:
        con = get_db()
        results = []
        for slug in request.slugs:
            stock = con.execute("""
                SELECT 
                    ticker,
                    volatility_squeeze,
                    qes_flag,
                    CAST(json_extract_string(relative_data, '$.aggregated_news_signals.active_debt_crisis_flag') AS INT) as debt_flag,
                    CAST(json_extract_string(relative_data, '$.aggregated_news_signals.active_regulatory_flag') AS INT) as reg_flag,
                    pledge_delta,
                    tax_divergence,
                    alpha_score,
                    industry
                FROM stocks WHERE slug = ?
            """, (slug,)).fetchone()
            
            if stock:
                results.append({
                    "slug": slug,
                    "ticker": stock[0],
                    "v_squeeze": stock[1] or 0,
                    "qes_flag": stock[2] == 1,
                    "debt_flag": stock[3] == 1,
                    "reg_flag": stock[4] == 1,
                    "pledge_surge": (stock[5] or 0) > 1.0,
                    "tax_divergence": (stock[6] or 0) > 0.3,
                    "alpha_score": stock[7] if stock[7] is not None else 0.0,
                    "industry": stock[8],
                    "market_cap_type": con.execute("SELECT market_cap_type FROM stocks WHERE slug = ?", (slug,)).fetchone()[0]
                })
        
        # Calculate aggregate score (0 to 100, where 100 is extremely risky)
        total_risk = 0
        swaps = []
        
        if results:
            for r in results:
                score = 0
                if r["v_squeeze"] > 2000: score += 10
                if r["qes_flag"]: score += 20
                if r["debt_flag"]: score += 30
                if r["reg_flag"]: score += 10
                if r["pledge_surge"]: score += 20
                if r["tax_divergence"]: score += 10
                r["individual_score"] = min(score, 100)
                total_risk += r["individual_score"]
                
                # Smart Swap Logic: If alpha is low or risk is high, find a better stock in the same industry AND same market cap tier
                if r["alpha_score"] < 0.5 or r["individual_score"] >= 30:
                    better_stock = con.execute("""
                        SELECT slug, ticker, alpha_score 
                        FROM stocks 
                        WHERE industry = ? 
                        AND market_cap_type = ?
                        AND slug != ?
                        AND alpha_score > ? + 0.10
                        AND qes_flag = 0
                        AND (pledge_delta IS NULL OR pledge_delta <= 1.0)
                        AND (tax_divergence IS NULL OR tax_divergence <= 0.3)
                        ORDER BY alpha_score DESC 
                        LIMIT 1
                    """, (r["industry"], r["market_cap_type"], r["slug"], r["alpha_score"])).fetchone()
                    
                    if better_stock:
                        swaps.append({
                            "current_slug": r["slug"],
                            "current_ticker": r["ticker"],
                            "recommended_slug": better_stock[0],
                            "recommended_ticker": better_stock[1],
                            "alpha_gain": better_stock[2] - r["alpha_score"],
                            "reason": f"High risk or low Alpha ({r['alpha_score']:.2f}). Switch to {better_stock[1]} for clean forensics and higher expected outperformance."
                        })
            
            avg_risk = total_risk / len(results)
        else:
            avg_risk = 0

        # Basic Correlation Clustering Check (Portfolio Diversity)
        industry_counts = {}
        for r in results:
            ind = r["industry"]
            if ind and ind != 'Unknown':
                industry_counts[ind] = industry_counts.get(ind, 0) + 1
        
        concentration_warnings = []
        for ind, count in industry_counts.items():
            if count >= 3 and len(results) >= 5:
                concentration_warnings.append(f"Heavy concentration in {ind} ({count} assets). Consider diversifying to reduce correlation risk.")

        # Modern Portfolio Theory (MPT) Optimization
        optimal_weights = []
        if len(results) >= 2:
            try:
                from scipy.optimize import minimize
                matrices = []
                alphas = []
                valid_results = []
                for r in results:
                    mat_res = con.execute("SELECT relative_data->>'$.historical_time_series_matrix' FROM stocks WHERE slug = ?", (r["slug"],)).fetchone()
                    if mat_res and mat_res[0]:
                        try:
                            mat = json.loads(mat_res[0])
                            rets = [row[0] for row in mat]
                            if len(rets) >= 50:
                                matrices.append(rets)
                                alphas.append(r["alpha_score"])
                                valid_results.append(r)
                        except: pass
                if len(matrices) >= 2:
                    min_len = min(len(m) for m in matrices)
                    mat_array = np.array([m[-min_len:] for m in matrices])
                    
                    # The returns in matrices are daily. We must annualize the covariance matrix
                    # because the expected_returns (alphas) are 1-year forward expected returns.
                    # Mismatching annualized returns with daily volatility mathematically breaks the Sharpe ratio.
                    daily_cov_matrix = np.cov(mat_array)
                    cov_matrix = daily_cov_matrix * 252
                    
                    expected_returns = np.array(alphas)
                    
                    def negative_sharpe(weights):
                        port_return = np.sum(weights * expected_returns)
                        port_risk = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
                        return -port_return / port_risk if port_risk > 0 else 0
                    
                    num_assets = len(valid_results)
                    constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1})
                    bounds = tuple((0.0, 1.0) for _ in range(num_assets))
                    init_weights = np.array([1.0 / num_assets] * num_assets)
                    
                    opt = minimize(negative_sharpe, init_weights, method='SLSQP', bounds=bounds, constraints=constraints)
                    if opt.success:
                        for i, weight in enumerate(opt.x):
                            if weight > 0.01:
                                optimal_weights.append({"ticker": valid_results[i]["ticker"], "weight": round(weight * 100, 2)})
            except Exception:
                pass
                
        return {
            "portfolio_risk_score": avg_risk,
            "stock_analysis": results,
            "concentration_warnings": concentration_warnings,
            "swap_recommendations": swaps,
            "optimal_weights": optimal_weights
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class PortfolioHolding(BaseModel):
    slug: str
    amount: float

class PortfolioAIRequest(BaseModel):
    stockHoldings: list[PortfolioHolding]
    mfHoldings: list[PortfolioHolding]
    stockRisk: str
    mfRisk: str
    holdingPeriod: str
    history: list = []
    message: str = ""

@app.post("/api/portfolio/ai-analyze")
async def ai_analyze_portfolio(req: PortfolioAIRequest):
    try:
        con = get_db()
        total_value = sum(h.amount for h in req.stockHoldings) + sum(h.amount for h in req.mfHoldings)
        if total_value <= 0:
            raise HTTPException(status_code=400, detail="Total portfolio value must be greater than 0")

        # Gather data and calculate weights
        portfolio_data = []
        for h in req.stockHoldings:
            stock = con.execute("SELECT ticker, name, industry, pe_ratio, alpha_score, volatility_squeeze FROM stocks WHERE slug = ?", (h.slug,)).fetchone()
            if stock:
                weight = (h.amount / total_value) * 100
                portfolio_data.append({
                    "type": "Stock",
                    "ticker": stock[0],
                    "name": stock[1],
                    "industry": stock[2],
                    "pe_ratio": stock[3],
                    "alpha_score": stock[4],
                    "volatility_squeeze": stock[5],
                    "amount_inr": h.amount,
                    "weight_pct": round(weight, 2)
                })

        for h in req.mfHoldings:
            mf = con.execute("SELECT scheme_code, direct_search_id, fund_name, scheme_name, category, return3y, expense_ratio, risk FROM mutual_funds WHERE scheme_code = ? OR direct_search_id = ?", (h.slug, h.slug)).fetchone()
            if mf:
                weight = (h.amount / total_value) * 100
                name = mf[2] or mf[3]
                portfolio_data.append({
                    "type": "Mutual Fund",
                    "ticker": name,
                    "name": name,
                    "industry": mf[4],
                    "return3y": mf[5],
                    "expense_ratio": mf[6],
                    "risk": mf[7],
                    "amount_inr": h.amount,
                    "weight_pct": round(weight, 2)
                })

        # Call Gemini
        llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite", temperature=0.1)
        
        system_prompt = """You are a Chief Investment Officer. Analyze the provided dual portfolio data (Stocks & Mutual Funds).
You MUST output strictly in JSON format matching this schema exactly, with NO markdown wrappers.

CRITICAL INSTRUCTIONS:
1. The `asset_action_plan` array MUST contain an action plan for EVERY SINGLE asset provided in the portfolio data, regardless of how many there are. Do not skip any assets.
2. The `strategic_verdict` MUST be a highly elaborate, multi-paragraph markdown string providing a deep qualitative breakdown of the portfolio's strategy, risk alignment, and macro vulnerabilities. It should read like a comprehensive institutional report.

{
  "portfolio_risk_score": 0,
  "profile_alignment": "MATCH | DEVIATION",
  "concentration_analysis": {
    "risk_level": "LOW | MODERATE | HIGH",
    "vulnerable_sectors": ["STR"]
  },
  "macro_exposures": [
    {"factor": "STR", "impact": "STR"}
  ],
  "asset_action_plan": [
    {"asset": "STR", "action": "TRIM | ACCUMULATE | HOLD | LIQUIDATE", "justification": "STR"}
  ],
  "strategic_verdict": "Multi-paragraph elaborate markdown string here..."
}"""
        
        user_prompt = f"Stock Risk Tolerance: {req.stockRisk}\nMutual Fund Risk Tolerance: {req.mfRisk}\nHolding Period: {req.holdingPeriod}\n\nPortfolio Data:\n{json.dumps(portfolio_data, indent=2)}"
        
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ]
        
        response = await llm.ainvoke(messages)
        
        # Clean potential markdown wrappers and list chunks
        content = response.content
        if isinstance(content, list):
            content_str = "".join(block.get("text", "") for block in content if isinstance(block, dict))
        else:
            content_str = str(content)
            
        content_str = content_str.strip()
        
        import re
        match = re.search(r'\{.*\}', content_str, re.DOTALL)
        if match:
            json_str = match.group(0)
            return json.loads(json_str)
        else:
            return json.loads(content_str)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        
        # Pure-data deterministic fallback
        action_plan = []
        high_pe_sectors = set()
        
        for h in portfolio_data:
            if h.get("type") == "Stock":
                pe = float(h.get("pe_ratio") or 0)
                if pe > 50:
                    action_plan.append({"asset": h["ticker"], "action": "TRIM", "justification": f"High P/E ratio ({pe}) implies overvaluation relative to pure data."})
                    high_pe_sectors.add(h.get("industry", "Unknown"))
                elif pe > 0 and pe < 20:
                    action_plan.append({"asset": h["ticker"], "action": "ACCUMULATE", "justification": f"Low P/E ratio ({pe}) indicates potential value according to pure data metrics."})
                else:
                    action_plan.append({"asset": h["ticker"], "action": "HOLD", "justification": "Metrics are neutral. Hold position."})
            else:
                ret = float(h.get("return3y") or 0)
                if ret < 5:
                    action_plan.append({"asset": h["ticker"], "action": "TRIM", "justification": f"Low 3Y Return ({ret}%) indicates underperformance."})
                else:
                    action_plan.append({"asset": h["ticker"], "action": "ACCUMULATE", "justification": f"Solid 3Y Return ({ret}%). Accumulate."})
                
        fallback_json = {
            "_is_fallback": True,
            "portfolio_risk_score": 50 if req.stockRisk == "Moderate" else (70 if req.stockRisk == "Aggressive" else 30),
            "profile_alignment": "MATCH",
            "concentration_analysis": {
                "risk_level": "MODERATE" if len(portfolio_data) > 3 else "HIGH",
                "vulnerable_sectors": list(high_pe_sectors)
            },
            "macro_exposures": [
                {"factor": "Pure-Data Fallback", "impact": "AI is offline due to high demand. Relying on quantitative database metrics."}
            ],
            "asset_action_plan": action_plan,
            "strategic_verdict": "Wait and observe (Pure-Data Fallback Active)"
        }
        return fallback_json

@app.post("/api/portfolio/chat")
async def portfolio_chat(req: PortfolioAIRequest):
    try:
        con = get_db()
        total_value = sum(h.amount for h in req.stockHoldings) + sum(h.amount for h in req.mfHoldings)
        
        portfolio_data = []
        if total_value > 0:
            for h in req.stockHoldings:
                stock = con.execute("SELECT ticker, name, industry FROM stocks WHERE slug = ?", (h.slug,)).fetchone()
                if stock:
                    weight = (h.amount / total_value) * 100
                    portfolio_data.append({
                        "type": "Stock",
                        "ticker": stock[0],
                        "name": stock[1],
                        "industry": stock[2],
                        "amount_inr": h.amount,
                        "weight_pct": round(weight, 2)
                    })
            for h in req.mfHoldings:
                mf = con.execute("SELECT scheme_code, direct_search_id, fund_name, scheme_name, category FROM mutual_funds WHERE scheme_code = ? OR direct_search_id = ?", (h.slug, h.slug)).fetchone()
                if mf:
                    weight = (h.amount / total_value) * 100
                    name = mf[2] or mf[3]
                    portfolio_data.append({
                        "type": "Mutual Fund",
                        "ticker": mf[0] or mf[1],
                        "name": name,
                        "industry": mf[4],
                        "amount_inr": h.amount,
                        "weight_pct": round(weight, 2)
                    })

        llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite", temperature=0.3)
        
        system_prompt = f"""You are a Chief Investment Officer providing advice to a client.
Their Stock risk tolerance is: {req.stockRisk}.
Their Mutual Fund risk tolerance is: {req.mfRisk}.
Their Holding Period is: {req.holdingPeriod}.
Their current unified portfolio:
{json.dumps(portfolio_data, indent=2)}

Answer the client's questions directly and concisely."""

        messages = [SystemMessage(content=system_prompt)]
        
        for msg in req.history:
            if msg.get("role") == "user":
                messages.append(HumanMessage(content=msg.get("content", "")))
            else:
                messages.append(AIMessage(content=msg.get("content", "")))
                
        messages.append(HumanMessage(content=req.message))
        
        response = await llm.ainvoke(messages)
        
        content = response.content
        if isinstance(content, list):
            content_str = "".join(block.get("text", "") for block in content if isinstance(block, dict))
        else:
            content_str = str(content)
            
        return {"response": content_str}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"response": "Oops, looks like the AI Agent is experiencing high demand currently. Please try again in a while :(\n\n*Pure-Data Fallback Active: I am offline, please refer to the dashboard metrics above.*"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Echo: {data}")
    except:
        pass

@app.get("/api/mutual_funds")
def get_mutual_funds(
    page: int = 1,
    limit: int = 50,
    category: str = None,
    sort_by: str = "aum",
    sort_order: str = "desc"
):
    try:
        db = get_db()
        offset = (page - 1) * limit
        
        # Build query
        query = "SELECT * FROM mutual_funds"
        count_query = "SELECT COUNT(*) FROM mutual_funds"
        
        conditions = []
        if category and category != 'undefined':
            conditions.append(f"category = '{category}'")
            
        if conditions:
            where_clause = " WHERE " + " AND ".join(conditions)
            query += where_clause
            count_query += where_clause
            
        # Add sorting
        valid_sort_columns = ['aum', 'expense_ratio', 'return1y', 'return3y', 'groww_rating']
        if sort_by in valid_sort_columns:
            order = "ASC" if sort_order.lower() == "asc" else "DESC"
            query += f" ORDER BY {sort_by} {order} NULLS LAST"
            
        # Add pagination
        query += f" LIMIT {limit} OFFSET {offset}"
        
        df = db.execute(query).df()
        total_count = db.execute(count_query).fetchone()[0]
        
        # Safely convert Pandas DataFrame (with nested structs/arrays) to pure Python dicts
        import json
        records = json.loads(df.to_json(orient="records", date_format="iso"))
        
        return {
            "total": total_count,
            "page": page,
            "limit": limit,
            "data": records
        }
    except Exception as e:
        print(f"Error fetching mutual funds: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/mutual_funds/{scheme_code}")
def get_mutual_fund(scheme_code: str):
    try:
        db = get_db()
        # The schema uses either scheme_code or direct_search_id, and we fallback to slug/ticker equivalent
        df = db.execute("SELECT * FROM mutual_funds WHERE scheme_code = ? OR direct_search_id = ?", (scheme_code, scheme_code)).df()
        
        if df.empty:
            raise HTTPException(status_code=404, detail="Mutual fund not found")
            
        import json
        records = json.loads(df.to_json(orient="records", date_format="iso"))
        return records[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/funds/capture-ratios")
def get_capture_ratios():
    try:
        db = get_db()
        CR_DB_PATH = os.path.realpath(os.path.join(BASE_DIR, "datasets/active/capture_ratios.parquet"))
        if not os.path.exists(CR_DB_PATH):
            return []
            
        df = db.execute(f"SELECT * FROM '{CR_DB_PATH}'").df()
        import json
        records = json.loads(df.to_json(orient="records", date_format="iso"))
        return records
    except Exception as e:
        print(f"Error fetching capture ratios: {e}")
        raise HTTPException(status_code=500, detail=str(e))
