from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Any
import duckdb, os, numpy as np, threading

router = APIRouter()

# Resolve absolute paths relative to this file (same pattern as main.py)
_BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PARQUET  = os.path.realpath(os.path.join(_BASE_DIR, "datasets/active/market_data.parquet"))
MF_PARQUET  = os.path.realpath(os.path.join(_BASE_DIR, "datasets/active/mutual_funds.parquet"))

# ────────────────────────────────────────────────────────────────────────────
#  STOCK METRICS REGISTRY
#  Format: key -> (sql_expr, label, group, type)
#  type: "numeric" | "string" | "flag"  (flag = 0/1 integer)
# ────────────────────────────────────────────────────────────────────────────
STOCK_METRICS: dict[str, tuple] = {

    # ── IDENTITY ──────────────────────────────────────────────────────────
    "market_cap":      ("market_cap",       "Market Cap (Cr)",  "Identity", "numeric"),
    "market_cap_type": ("market_cap_type",  "Cap Type",         "Identity", "string"),
    "industry":        ("industry",         "Industry",         "Identity", "string"),

    # ── PRICE ─────────────────────────────────────────────────────────────
    "live_price": (
        "TRY_CAST(replace(replace(json_extract_string(absolute_data,'$.\"live price\"'),'₹',''),',','') AS DOUBLE)",
        "Live Price (₹)", "Price", "numeric"
    ),
    "day_change_pct": (
        "TRY_CAST(regexp_extract(COALESCE(json_extract_string(absolute_data,'$.\"day change\"'),''),'\\(([-0-9.]+)%\\)',1) AS DOUBLE)",
        "Day Change %", "Price", "numeric"
    ),

    # ── VALUATION ─────────────────────────────────────────────────────────
    "pe_ratio":          ("pe_ratio",  "P/E Ratio",   "Valuation", "numeric"),
    "pb_ratio":          ("TRY_CAST(json_extract_string(absolute_data,'$.pbRatio') AS DOUBLE)",       "P/B Ratio",       "Valuation", "numeric"),
    "ev_to_ebitda":      ("TRY_CAST(json_extract_string(absolute_data,'$.evToEbitda') AS DOUBLE)",    "EV/EBITDA",       "Valuation", "numeric"),
    "ev_to_sales":       ("TRY_CAST(json_extract_string(absolute_data,'$.evToSales') AS DOUBLE)",     "EV/Sales",        "Valuation", "numeric"),
    "peg_ratio":         ("TRY_CAST(json_extract_string(absolute_data,'$.pegRatio') AS DOUBLE)",      "PEG Ratio",       "Valuation", "numeric"),
    "price_to_ocf":      ("TRY_CAST(json_extract_string(absolute_data,'$.priceToOcf') AS DOUBLE)",    "Price/OCF",       "Valuation", "numeric"),
    "price_to_fcf":      ("TRY_CAST(json_extract_string(absolute_data,'$.priceToFcf') AS DOUBLE)",    "Price/FCF",       "Valuation", "numeric"),
    "earnings_yield":    ("TRY_CAST(json_extract_string(absolute_data,'$.earningsYield') AS DOUBLE)",  "Earnings Yield %","Valuation", "numeric"),
    "price_to_sales":    ("TRY_CAST(json_extract_string(absolute_data,'$.priceToSales') AS DOUBLE)",   "Price/Sales",     "Valuation", "numeric"),

    # ── PROFITABILITY ──────────────────────────────────────────────────────
    "roe":               ("TRY_CAST(json_extract_string(absolute_data,'$.roe') AS DOUBLE)",                        "ROE %",              "Profitability", "numeric"),
    "roa":               ("TRY_CAST(json_extract_string(absolute_data,'$.returnOnAssets') AS DOUBLE)",             "ROA %",              "Profitability", "numeric"),
    "roic":              ("TRY_CAST(json_extract_string(absolute_data,'$.roic') AS DOUBLE)",                       "ROIC %",             "Profitability", "numeric"),
    "operating_margin":  ("TRY_CAST(json_extract_string(absolute_data,'$.operatingProfitMargin') AS DOUBLE)",      "Operating Margin %", "Profitability", "numeric"),
    "net_margin":        ("TRY_CAST(json_extract_string(absolute_data,'$.netProfitMargin') AS DOUBLE)",            "Net Margin %",       "Profitability", "numeric"),

    # ── DIVIDENDS ──────────────────────────────────────────────────────────
    "div_yield":           ("TRY_CAST(json_extract_string(absolute_data,'$.divYield') AS DOUBLE)",           "Dividend Yield %",       "Dividends", "numeric"),
    "sector_div_yield":    ("TRY_CAST(json_extract_string(absolute_data,'$.sectorDivYield') AS DOUBLE)",     "Sector Div Yield %",     "Dividends", "numeric"),
    "div_yield_vs_sector": ("TRY_CAST(json_extract_string(absolute_data,'$.divYieldVsSector') AS DOUBLE)",   "Div Yield vs Sector",    "Dividends", "numeric"),

    # ── PER-SHARE ──────────────────────────────────────────────────────────
    "eps_ttm":     ("TRY_CAST(json_extract_string(absolute_data,'$.epsTtm') AS DOUBLE)",     "EPS TTM (₹)",    "Per-Share", "numeric"),
    "book_value":  ("TRY_CAST(json_extract_string(absolute_data,'$.bookValue') AS DOUBLE)",  "Book Value (₹)", "Per-Share", "numeric"),
    "face_value":  ("TRY_CAST(json_extract_string(absolute_data,'$.faceValue') AS DOUBLE)",  "Face Value (₹)", "Per-Share", "numeric"),

    # ── HEALTH / LEVERAGE ─────────────────────────────────────────────────
    "debt_to_equity": ("TRY_CAST(json_extract_string(absolute_data,'$.debtToEquity') AS DOUBLE)", "Debt/Equity",   "Health", "numeric"),
    "debt_to_asset":  ("TRY_CAST(json_extract_string(absolute_data,'$.debtToAsset') AS DOUBLE)",  "Debt/Asset",    "Health", "numeric"),
    "current_ratio":  ("TRY_CAST(json_extract_string(absolute_data,'$.currentRatio') AS DOUBLE)", "Current Ratio", "Health", "numeric"),
    "quick_ratio":    ("TRY_CAST(json_extract_string(absolute_data,'$.quickRatio') AS DOUBLE)",   "Quick Ratio",   "Health", "numeric"),
    "cash_ratio":     ("TRY_CAST(json_extract_string(absolute_data,'$.cashRatio') AS DOUBLE)",    "Cash Ratio",    "Health", "numeric"),

    # ── SECTOR RELATIVE ───────────────────────────────────────────────────
    "industry_pe":          ("TRY_CAST(json_extract_string(absolute_data,'$.industryPe') AS DOUBLE)",          "Industry P/E",          "Sector Relative", "numeric"),
    "sector_pb":            ("TRY_CAST(json_extract_string(absolute_data,'$.sectorPb') AS DOUBLE)",            "Sector P/B",            "Sector Relative", "numeric"),
    "sector_roe":           ("TRY_CAST(json_extract_string(absolute_data,'$.sectorRoe') AS DOUBLE)",           "Sector ROE %",          "Sector Relative", "numeric"),
    "sector_roce":          ("TRY_CAST(json_extract_string(absolute_data,'$.sectorRoce') AS DOUBLE)",          "Sector ROCE %",         "Sector Relative", "numeric"),
    "pe_premium_vs_sector": ("TRY_CAST(json_extract_string(absolute_data,'$.pePremiumVsSector') AS DOUBLE)",   "P/E Premium vs Sector", "Sector Relative", "numeric"),
    "pb_premium_vs_sector": ("TRY_CAST(json_extract_string(absolute_data,'$.pbPremiumVsSector') AS DOUBLE)",   "P/B Premium vs Sector", "Sector Relative", "numeric"),

    # ── MOVING AVERAGES ───────────────────────────────────────────────────
    "sma10":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.sma10Days') AS DOUBLE)",  "SMA 10D",  "Moving Averages", "numeric"),
    "ema10":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.ema10Days') AS DOUBLE)",  "EMA 10D",  "Moving Averages", "numeric"),
    "sma20":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.sma20Days') AS DOUBLE)",  "SMA 20D",  "Moving Averages", "numeric"),
    "ema20":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.ema20Days') AS DOUBLE)",  "EMA 20D",  "Moving Averages", "numeric"),
    "sma50":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.sma50Days') AS DOUBLE)",  "SMA 50D",  "Moving Averages", "numeric"),
    "ema50":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.ema50Days') AS DOUBLE)",  "EMA 50D",  "Moving Averages", "numeric"),
    "sma100": ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.sma100Days') AS DOUBLE)", "SMA 100D", "Moving Averages", "numeric"),
    "ema100": ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.ema100Days') AS DOUBLE)", "EMA 100D", "Moving Averages", "numeric"),
    "sma200": ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.sma200Days') AS DOUBLE)", "SMA 200D", "Moving Averages", "numeric"),
    "ema200": ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.ema200Days') AS DOUBLE)", "EMA 200D", "Moving Averages", "numeric"),

    # ── TECHNICAL INDICATORS ──────────────────────────────────────────────
    "rsi14":              ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.rsi14') AS DOUBLE)",                                    "RSI (14)",               "Technical", "numeric"),
    "macd":               ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.macd') AS DOUBLE)",                                     "MACD",                   "Technical", "numeric"),
    "macd_histogram":     ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.macd_histogram') AS DOUBLE)",              "MACD Histogram",         "Technical", "numeric"),
    "beta":               ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.beta') AS DOUBLE)",                                     "Beta",                   "Technical", "numeric"),
    "atr14":              ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.atr_14') AS DOUBLE)",                      "ATR (14)",               "Technical", "numeric"),
    "bollinger_upper":    ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.bollinger_upper') AS DOUBLE)",              "Bollinger Upper",        "Technical", "numeric"),
    "bollinger_lower":    ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.bollinger_lower') AS DOUBLE)",              "Bollinger Lower",        "Technical", "numeric"),
    "distance_sma50":     ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.distance_from_sma50') AS DOUBLE)",          "Distance from SMA50 %",  "Technical", "numeric"),
    "volume_intensity":   ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.volume_intensity_52w') AS DOUBLE)",         "Volume Intensity 52W",   "Technical", "numeric"),
    "volatility_13w":     ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.volatility_13w') AS DOUBLE)",               "Volatility (13W)",       "Technical", "numeric"),
    "volatility_squeeze": ("volatility_squeeze",                                                                                              "Volatility Squeeze Idx", "Technical", "numeric"),
    "rs_rating":          ("rs_rating",                                                                                                       "RS Rating (1–99)",       "Technical", "numeric"),
    "rs_nifty_52w":       ("TRY_CAST(json_extract_string(relative_data,'$.relative_strength_signals.rs_nifty_52w') AS DOUBLE)",               "RS vs Nifty (52W)",      "Technical", "numeric"),
    "beta_vs_benchmark":  ("TRY_CAST(json_extract_string(relative_data,'$.relative_strength_signals.beta_vs_benchmark') AS DOUBLE)",          "Beta vs Benchmark",      "Technical", "numeric"),

    # ── PRICE LEVELS ──────────────────────────────────────────────────────
    "pivot_point":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.pivotPoint') AS DOUBLE)", "Pivot Point",  "Price Levels", "numeric"),
    "resistance1":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.r1') AS DOUBLE)",         "Resistance R1","Price Levels", "numeric"),
    "resistance2":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.r2') AS DOUBLE)",         "Resistance R2","Price Levels", "numeric"),
    "resistance3":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.r3') AS DOUBLE)",         "Resistance R3","Price Levels", "numeric"),
    "support1":     ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.s1') AS DOUBLE)",         "Support S1",   "Price Levels", "numeric"),
    "support2":     ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.s2') AS DOUBLE)",         "Support S2",   "Price Levels", "numeric"),
    "support3":     ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.s3') AS DOUBLE)",         "Support S3",   "Price Levels", "numeric"),

    # ── GROWTH (financialStatement CAGR + relative_data) ──────────────────
    "revenue_yoy":     ("TRY_CAST(json_extract_string(relative_data,'$.financial_growth_signals.revenue_yoy') AS DOUBLE)",      "Revenue YoY %",    "Growth", "numeric"),
    "profit_yoy":      ("TRY_CAST(json_extract_string(relative_data,'$.financial_growth_signals.profit_yoy') AS DOUBLE)",       "Profit YoY %",     "Growth", "numeric"),
    "revenue_1y_cagr": ("TRY_CAST(json_extract_string(absolute_data,'$.financialStatement[0].cagr.oneYearTtm') AS DOUBLE)",     "Revenue 1Y CAGR",  "Growth", "numeric"),
    "revenue_3y_cagr": ("TRY_CAST(json_extract_string(absolute_data,'$.financialStatement[0].cagr.threeYearCagr') AS DOUBLE)",  "Revenue 3Y CAGR",  "Growth", "numeric"),
    "profit_1y_cagr":  ("TRY_CAST(json_extract_string(absolute_data,'$.financialStatement[1].cagr.oneYearTtm') AS DOUBLE)",     "Profit 1Y CAGR",   "Growth", "numeric"),
    "profit_3y_cagr":  ("TRY_CAST(json_extract_string(absolute_data,'$.financialStatement[1].cagr.threeYearCagr') AS DOUBLE)",  "Profit 3Y CAGR",   "Growth", "numeric"),

    # ── SHAREHOLDING ──────────────────────────────────────────────────────
    "inst_accum":    ("inst_accum",                                                                                              "Inst. Accum QoQ %",  "Shareholding", "numeric"),
    "pledge_delta":  ("pledge_delta",                                                                                            "Pledge Delta %",     "Shareholding", "numeric"),
    "free_float":    ("TRY_CAST(json_extract_string(relative_data,'$.shareholding_momentum_vectors.free_float_pct') AS DOUBLE)","Free Float %",       "Shareholding", "numeric"),

    # ── HEALTH SCORES (pre-computed in ML pipeline) ───────────────────────
    "piotroski_f":   ("TRY_CAST(json_extract_string(relative_data,'$.health_scores.piotroski_f_score') AS DOUBLE)",  "Piotroski F-Score (0–9)","Health Scores", "numeric"),
    "graham_number": ("TRY_CAST(json_extract_string(relative_data,'$.health_scores.graham_number_value') AS DOUBLE)","Graham Number (₹)",      "Health Scores", "numeric"),
    "altman_z":      ("TRY_CAST(json_extract_string(relative_data,'$.health_scores.altman_z_proxy') AS DOUBLE)",     "Altman Z-Score Proxy",   "Health Scores", "numeric"),

    # ── FORENSIC / RISK ───────────────────────────────────────────────────
    "qes_flag":        ("qes_flag",                                                                                              "QES Red Flag (0/1)",     "Forensic", "flag"),
    "tax_divergence":  ("tax_divergence",                                                                                        "Tax Divergence",         "Forensic", "numeric"),
    "hni_absorption":  ("TRY_CAST(json_extract_string(relative_data,'$.risk_and_forensic_signals.hni_absorption_score') AS DOUBLE)","HNI Absorption Score","Forensic", "numeric"),
    "debt_crisis":     ("TRY_CAST(json_extract_string(relative_data,'$.aggregated_news_signals.active_debt_crisis_flag') AS DOUBLE)","Debt Crisis Flag (0/1)","Forensic", "flag"),
    "regulatory_flag": ("TRY_CAST(json_extract_string(relative_data,'$.aggregated_news_signals.active_regulatory_flag') AS DOUBLE)","Regulatory Flag (0/1)","Forensic", "flag"),

    # ── QUANT / RANK ──────────────────────────────────────────────────────
    "raw_rank": ("raw_rank", "Raw Rank (0–1)", "Quant", "numeric"),

    # ── MACRO REGIME ──────────────────────────────────────────────────────
    "vix_intensity":   ("TRY_CAST(json_extract_string(relative_data,'$.macro_market_regime.vix_intensity_ratio') AS DOUBLE)",   "VIX Intensity Ratio",   "Macro", "numeric"),
    "is_bull_regime":  ("TRY_CAST(json_extract_string(relative_data,'$.macro_market_regime.is_bull_regime') AS DOUBLE)",        "Bull Regime (0/1)",      "Macro", "flag"),
    "nifty_trend":     ("TRY_CAST(json_extract_string(relative_data,'$.macro_market_regime.nifty_50_trend_ratio') AS DOUBLE)",  "Nifty 50 Trend Ratio",  "Macro", "numeric"),
    "market_breadth":  ("TRY_CAST(json_extract_string(relative_data,'$.market_breadth_regime.market_breadth_50dma_pct') AS DOUBLE)","Market Breadth % above 50DMA","Macro", "numeric"),
}

# ────────────────────────────────────────────────────────────────────────────
#  MUTUAL FUND METRICS REGISTRY
# ────────────────────────────────────────────────────────────────────────────
MF_METRICS: dict[str, tuple] = {
    # ── IDENTITY ──────────────────────────────────────────────────────────
    "category":          ("category",      "Category",         "Identity", "string"),
    "sub_category":      ("sub_category",  "Sub-Category",     "Identity", "string"),
    "risk":              ("risk",          "Risk Level",       "Identity", "string"),
    "risk_rating":       ("risk_rating",   "Risk Score (1–7)", "Identity", "numeric"),
    "plan_type":         ("plan_type",     "Plan Type",        "Identity", "string"),
    "fund_house":        ("fund_house",    "Fund House",       "Identity", "string"),

    # ── SIZE & COST ───────────────────────────────────────────────────────
    "aum":           ("aum",           "AUM (Cr)",       "Size & Cost", "numeric"),
    "nav":           ("nav",           "NAV (₹)",        "Size & Cost", "numeric"),
    "expense_ratio": ("TRY_CAST(expense_ratio AS DOUBLE)", "Expense Ratio %", "Size & Cost", "numeric"),
    "min_sip":       ("min_sip_investment", "Min SIP (₹)", "Size & Cost", "numeric"),
    "min_lumpsum":   ("min_investment_amount", "Min Lumpsum (₹)", "Size & Cost", "numeric"),

    # ── LUMP-SUM RETURNS ──────────────────────────────────────────────────
    "return1d":   ("return1d",   "1D Return %",  "Returns (Lump Sum)", "numeric"),
    "return3m":   ("return3m",   "3M Return %",  "Returns (Lump Sum)", "numeric"),
    "return6m":   ("return6m",   "6M Return %",  "Returns (Lump Sum)", "numeric"),
    "return1y":   ("return1y",   "1Y Return %",  "Returns (Lump Sum)", "numeric"),
    "return3y":   ("return3y",   "3Y Return %",  "Returns (Lump Sum)", "numeric"),
    "return5y":   ("return5y",   "5Y Return %",  "Returns (Lump Sum)", "numeric"),
    "return7y":   ("return7y",   "7Y Return %",  "Returns (Lump Sum)", "numeric"),
    "return10y":  ("return10y",  "10Y Return %", "Returns (Lump Sum)", "numeric"),
    "mean_return":("mean_return","Mean Return %", "Returns (Lump Sum)", "numeric"),

    # ── SIP RETURNS ───────────────────────────────────────────────────────
    "sip_return3m":  ("sip_return3m",  "SIP 3M %",  "Returns (SIP)", "numeric"),
    "sip_return6m":  ("sip_return6m",  "SIP 6M %",  "Returns (SIP)", "numeric"),
    "sip_return1y":  ("sip_return1y",  "SIP 1Y %",  "Returns (SIP)", "numeric"),
    "sip_return3y":  ("sip_return3y",  "SIP 3Y %",  "Returns (SIP)", "numeric"),
    "sip_return5y":  ("sip_return5y",  "SIP 5Y %",  "Returns (SIP)", "numeric"),

    # ── BENCHMARK ─────────────────────────────────────────────────────────
    "sub_cat_return3y": ("sub_category_average_return3y", "Sub-Cat Avg 3Y %", "Benchmark", "numeric"),

    # ── AVAILABILITY ──────────────────────────────────────────────────────
    "available_for_investment": ("available_for_investment", "Available for Investment (0/1)", "Availability", "flag"),
    "sip_allowed":              ("sip_allowed",              "SIP Allowed (0/1)",              "Availability", "flag"),
}

# ────────────────────────────────────────────────────────────────────────────
#  PYDANTIC MODELS
# ────────────────────────────────────────────────────────────────────────────
class FilterClause(BaseModel):
    field: str
    op: str        # >, <, >=, <=, =, !=
    value: Any
    logic: str = None # "AND" or "OR"
    op2: str = None
    value2: Any = None
    outerLogic: str = None # "AND" or "OR"

class ScreenerRequest(BaseModel):
    filters:    List[FilterClause] = []
    sort_by:    str  = ""
    sort_order: str  = "desc"
    columns:    List[str] = []
    page:       int  = 1
    limit:      int  = 100

# ────────────────────────────────────────────────────────────────────────────
#  HELPERS
# ────────────────────────────────────────────────────────────────────────────
VALID_OPS = {">" , "<", ">=", "<=", "=", "!="}

# ─── Module-level singleton connection ───────────────────────────────────────
# The Parquet file is large — we load it ONCE at startup and reuse the same
# in-memory DuckDB connection for every request, exactly like main.py does.
_screener_con: duckdb.DuckDBPyConnection | None = None
_screener_lock = threading.Lock()

def _init_con() -> duckdb.DuckDBPyConnection:
    """Create the singleton connection and register views."""
    global _screener_con
    if not os.path.exists(DB_PARQUET):
        raise RuntimeError(f"Parquet not found: {DB_PARQUET}")
    con = duckdb.connect(":memory:")
    con.execute(f"CREATE OR REPLACE VIEW stocks AS SELECT * FROM '{DB_PARQUET}'")
    if os.path.exists(MF_PARQUET):
        con.execute(f"CREATE OR REPLACE VIEW mutual_funds AS SELECT * FROM '{MF_PARQUET}'")
    _screener_con = con
    return con

def get_con():
    """Return a thread-local cursor to the singleton connection."""
    global _screener_con
    if _screener_con is None:
        with _screener_lock:
            if _screener_con is None:   # double-checked inside lock
                _init_con()
    return _screener_con.cursor()

def reload_screener_db():
    """Called by main.py after a data pipeline swap to hot-reload the views."""
    global _screener_con
    with _screener_lock:
        old = _screener_con
        _screener_con = None
        if old:
            try:
                old.close()
            except Exception:
                pass
        _init_con()

def nan_safe(obj):
    """Recursively replace NaN / Inf in nested structures for JSON safety."""
    if isinstance(obj, float):
        if obj != obj or obj == float('inf') or obj == float('-inf'):
            return None
    if isinstance(obj, dict):
        return {k: nan_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [nan_safe(i) for i in obj]
    return obj

def build_query(table: str, registry: dict, req: ScreenerRequest,
                always_select: list[str]):
    """
    Build a parameterised DuckDB SELECT from the registry.
    Returns (main_sql, count_sql, params).
    """
    # ── SELECT clause ──────────────────────────────────────────────────────
    selects = list(always_select)  # non-aliased fixed columns
    for col in req.columns:
        if col in registry:
            expr = registry[col][0]
            selects.append(f"{expr} AS {col}")

    # ── WHERE clause ───────────────────────────────────────────────────────
    wheres, params = [], []
    where_sql_parts = []
    
    for f in req.filters:
        if f.field not in registry:
            continue
        op1 = f.op.strip()
        if op1 not in VALID_OPS:
            continue
        expr = registry[f.field][0]
        # Cast the filter value to numeric when possible
        try:
            val1 = float(f.value) if isinstance(f.value, str) else f.value
        except (TypeError, ValueError):
            val1 = f.value
        
        cond1 = f"({expr}) {op1} ?"
        
        if f.logic and f.logic.upper() in ["AND", "OR"] and f.op2 and f.op2.strip() in VALID_OPS:
            op2 = f.op2.strip()
            try:
                val2 = float(f.value2) if isinstance(f.value2, str) else f.value2
            except (TypeError, ValueError):
                val2 = f.value2
            cond2 = f"({expr}) {op2} ?"
            f_sql = f"({cond1} {f.logic.upper()} {cond2})"
            f_params = [val1, val2]
        else:
            f_sql = cond1
            f_params = [val1]
            
        if where_sql_parts:
            logic = f.outerLogic.upper() if f.outerLogic else "AND"
            if logic not in ["AND", "OR"]:
                logic = "AND"
            where_sql_parts.append(logic)
            
        where_sql_parts.append(f"({f_sql})")
        params.extend(f_params)

    # Exclude delisted stocks globally (only for stocks)
    if table == 'stocks':
        if where_sql_parts:
            where_sql_parts.append("AND")
        where_sql_parts.append("(json_extract_string(absolute_data, '$.\"live price\"') != '₹0.00')")

    where_sql = " ".join(where_sql_parts) if where_sql_parts else "1=1"

    # ── ORDER BY clause ────────────────────────────────────────────────────
    order_sql = ""
    if req.sort_by in registry:
        expr = registry[req.sort_by][0]
        direction = "DESC" if req.sort_order.lower() != "asc" else "ASC"
        order_sql = f"ORDER BY ({expr}) {direction} NULLS LAST"

    offset = (req.page - 1) * req.limit

    main_sql = f"""
    SELECT {', '.join(selects)}
    FROM (
        SELECT * FROM {table}
        WHERE {where_sql}
        {order_sql}
        LIMIT {req.limit} OFFSET {offset}
    ) subq
    """
    count_sql = f"SELECT COUNT(*) FROM {table} WHERE {where_sql}"
    return main_sql, count_sql, params


_string_options_cache = {}
def get_string_options(col_name: str, table: str) -> list[str]:
    if col_name in _string_options_cache:
        return _string_options_cache[col_name]
    try:
        con = get_con()
        rows = con.execute(f"SELECT DISTINCT {col_name} FROM {table} WHERE {col_name} IS NOT NULL ORDER BY {col_name}").fetchall()
        opts = [r[0] for r in rows if r[0]]
        _string_options_cache[col_name] = opts
        return opts
    except Exception:
        return []

def metrics_meta(registry: dict, table: str) -> list:
    out = []
    for k, v in registry.items():
        m = {"key": k, "label": v[1], "group": v[2], "type": v[3]}
        if len(v) > 4:
            m["options"] = v[4]
        elif v[3] == "string":
            m["options"] = get_string_options(v[0], table)
        out.append(m)
    return out


# ────────────────────────────────────────────────────────────────────────────
#  STOCK SCREENER ENDPOINT
# ────────────────────────────────────────────────────────────────────────────
@router.post("/api/screener/stocks")
def screen_stocks(req: ScreenerRequest):
    try:
        con = get_con()
        always = [
            "slug",
            "ticker",
            "name",
            "market_cap_type",
            "industry",
            "json_extract_string(absolute_data,'$.header_raw.logoUrl') AS logo_url",
        ]
        main_sql, count_sql, params = build_query("stocks", STOCK_METRICS, req, always)

        df    = con.execute(main_sql,  params).df()
        df    = df.replace({np.nan: None, np.inf: None, -np.inf: None})
        data  = nan_safe(df.to_dict("records"))
        count = con.execute(count_sql, params).fetchone()[0]

        return {
            "data": data,
            "total": count,
            "page": req.page,
            "limit": req.limit,
            "available_metrics": metrics_meta(STOCK_METRICS, "stocks")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ────────────────────────────────────────────────────────────────────────────
#  MUTUAL FUND SCREENER ENDPOINT
# ────────────────────────────────────────────────────────────────────────────
@router.post("/api/screener/mutual-funds")
def screen_mf(req: ScreenerRequest):
    try:
        con = get_con()
        always = [
            "scheme_code",
            "fund_name",
            "scheme_name",
            "category",
            "logo_url",
            "risk",
            "groww_rating",
        ]
        main_sql, count_sql, params = build_query("mutual_funds", MF_METRICS, req, always)

        df    = con.execute(main_sql,  params).df()
        df    = df.replace({np.nan: None, np.inf: None, -np.inf: None})
        data  = nan_safe(df.to_dict("records"))
        count = con.execute(count_sql, params).fetchone()[0]

        return {
            "data": data,
            "total": count,
            "page": req.page,
            "limit": req.limit,
            "available_metrics": metrics_meta(MF_METRICS, "mutual_funds")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

# ─── Pre-warm the connection at module import time ────────────────────────────
# Runs in a background thread so FastAPI startup is not blocked.
# By the time the first user request arrives, the Parquet is already loaded.
def _prewarm():
    try:
        with _screener_lock:
            if _screener_con is None:
                _init_con()
        print("[screener] ✅ Screener connection pre-warmed.")
    except Exception as e:
        print(f"[screener] ⚠️  Pre-warm failed (will retry on first request): {e}")

threading.Thread(target=_prewarm, daemon=True, name="screener-prewarm").start()
