import os
from fastapi import FastAPI, HTTPException, WebSocket, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
import duckdb
import json
import numpy as np
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Quant Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Use absolute path to resolve the symlink relative to this file
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.realpath(os.path.join(BASE_DIR, "datasets/active/market_data.parquet"))
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")

# Global connection to be reused/reloaded
_db_con = None
_search_cache = []

def get_db():
    global _db_con
    if _db_con is None:
        # For Parquet, we connect to an in-memory DB and query the file
        _db_con = duckdb.connect(":memory:")
        # We can also create a view to make queries cleaner
        _db_con.execute(f"CREATE OR REPLACE VIEW stocks AS SELECT * FROM '{DB_PATH}'")
    return _db_con

def verify_admin_token(x_admin_token: str = Header(...)):
    if not ADMIN_TOKEN or x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid admin token")

@app.post("/api/admin/reload_db")
def reload_db(token: str = Depends(verify_admin_token)):
    global _db_con, _search_cache, DB_PATH
    try:
        # For Parquet, just refresh the view on the same in-memory connection 
        # or recreate the connection to be safe.
        if _db_con:
            _db_con.close()
            _db_con = None
        
        # Resolve the new symlink target using absolute path
        DB_PATH = os.path.realpath(os.path.join(BASE_DIR, "datasets/active/market_data.parquet"))
        
        # Clear cache
        _search_cache = []
        
        # Re-initialize connection and view
        get_db()
        
        return {"status": "success", "message": "Database hot-swapped to Parquet: " + DB_PATH}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
                alpha_score, shap_reason_1, shap_reason_2, shap_reason_3
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
                "shap_reason_3": r[15]
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
        
        return {"slug": slug, "absolute": abs_data, "relative": rel_data}
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
            price_series_a.append({"time": time_str, "value": ((d["price_a"] / base_a) - 1) * 100 if base_a > 0 else 0})
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
            except: pass

        return {
            "portfolio_risk_score": avg_risk,
            "stock_analysis": results,
            "swap_recommendations": swaps,
            "optimal_weights": optimal_weights,
            "concentration_warnings": concentration_warnings
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Echo: {data}")
    except:
        pass
