from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Any
import duckdb, os, numpy as np, threading

router = APIRouter()

# Resolve absolute paths dynamically in _init_con
_BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PARQUET_LINK  = os.path.join(_BASE_DIR, "datasets/active/market_data.parquet")
MF_PARQUET_LINK  = os.path.join(_BASE_DIR, "datasets/active/mutual_funds.parquet")
ETF_PARQUET_LINK = os.path.join(_BASE_DIR, "datasets/active/etfs.parquet")

# ────────────────────────────────────────────────────────────────────────────
#  STOCK METRICS REGISTRY
#  Format: key -> (sql_expr, label, group, type, description)
#  type: "numeric" | "string" | "flag"  (flag = 0/1 integer)
# ────────────────────────────────────────────────────────────────────────────
STOCK_METRICS: dict[str, tuple] = {

    # ── IDENTITY ──────────────────────────────────────────────────────────
    "market_cap":      ("market_cap",       "Market Cap (Cr)",  "Identity", "numeric", "Total market value of a company's outstanding shares.", ""),
    "market_cap_type": ("market_cap_type",  "Cap Type",         "Identity", "string",  "Classification of the company (e.g., Large Cap, Mid Cap).", "Identity."),
    "industry":        ("industry",         "Industry",         "Identity", "string",  "The primary sector or industry in which the company operates.", "Identity."),

    # ── PRICE ─────────────────────────────────────────────────────────────
    "live_price": (
        "TRY_CAST(replace(replace(json_extract_string(absolute_data,'$.\"live price\"'),'₹',''),',','') AS DOUBLE)",
        "Live Price (₹)", "Price", "numeric", "Current market price of the stock."
    , ""),
    "day_change_pct": (
        "TRY_CAST(regexp_extract(COALESCE(json_extract_string(absolute_data,'$.\"day change\"'),''),'\\(([-0-9.]+)%\\)',1) AS DOUBLE)",
        "Day Change %", "Price", "numeric", "Percentage change in stock price over the last trading day."
    , ""),
    "return_1m": ("TRY_CAST(json_extract_string(relative_data,'$.price_returns.1m_return') AS DOUBLE)", "1M Change %", "Price", "numeric", "Percentage return over the last 1 month.", ""),
    "return_3m": ("TRY_CAST(json_extract_string(relative_data,'$.price_returns.3m_return') AS DOUBLE)", "3M Change %", "Price", "numeric", "Percentage return over the last 3 months.", ""),
    "return_6m": ("TRY_CAST(json_extract_string(relative_data,'$.price_returns.6m_return') AS DOUBLE)", "6M Change %", "Price", "numeric", "Percentage return over the last 6 months.", ""),
    "return_ytd": ("TRY_CAST(json_extract_string(relative_data,'$.price_returns.ytd_return') AS DOUBLE)", "YTD Change %", "Price", "numeric", "Year-To-Date percentage return.", ""),
    "return_1y": ("TRY_CAST(json_extract_string(relative_data,'$.price_returns.1y_return') AS DOUBLE)", "1Y Change %", "Price", "numeric", "Percentage return over the last 1 year.", ""),
    "return_5y": ("TRY_CAST(json_extract_string(relative_data,'$.price_returns.5y_return') AS DOUBLE)", "5Y Change %", "Price", "numeric", "Percentage return over the last 5 years.", ""),

    # ── RELATIVE (vs Nifty) ────────────────────────────────────────────────
    "nifty_return_1m": ("TRY_CAST(json_extract_string(relative_data,'$.price_returns.1m_nifty_return') AS DOUBLE)", "Nifty 1M Change %", "vs Nifty", "numeric", "Benchmark Nifty return over the last 1 month.", ""),
    "nifty_return_3m": ("TRY_CAST(json_extract_string(relative_data,'$.price_returns.3m_nifty_return') AS DOUBLE)", "Nifty 3M Change %", "vs Nifty", "numeric", "Benchmark Nifty return over the last 3 months.", ""),
    "nifty_return_6m": ("TRY_CAST(json_extract_string(relative_data,'$.price_returns.6m_nifty_return') AS DOUBLE)", "Nifty 6M Change %", "vs Nifty", "numeric", "Benchmark Nifty return over the last 6 months.", ""),
    "nifty_return_1y": ("TRY_CAST(json_extract_string(relative_data,'$.price_returns.1y_nifty_return') AS DOUBLE)", "Nifty 1Y Change %", "vs Nifty", "numeric", "Benchmark Nifty return over the last 1 year.", ""),
    "nifty_return_ytd": ("TRY_CAST(json_extract_string(relative_data,'$.price_returns.ytd_nifty_return') AS DOUBLE)", "Nifty YTD Change %", "vs Nifty", "numeric", "Benchmark Nifty Year-To-Date return.", ""),
    "nifty_return_5y": ("TRY_CAST(json_extract_string(relative_data,'$.price_returns.5y_nifty_return') AS DOUBLE)", "Nifty 5Y Change %", "vs Nifty", "numeric", "Benchmark Nifty return over the last 5 years.", ""),
    
    "alpha_1m": ("(TRY_CAST(json_extract_string(relative_data,'$.price_returns.1m_return') AS DOUBLE) - TRY_CAST(json_extract_string(relative_data,'$.price_returns.1m_nifty_return') AS DOUBLE))", "Alpha vs Nifty (1M)", "vs Nifty", "numeric", "Outperformance compared to Nifty over 1 month.", ""),
    "alpha_1y": ("(TRY_CAST(json_extract_string(relative_data,'$.price_returns.1y_return') AS DOUBLE) - TRY_CAST(json_extract_string(relative_data,'$.price_returns.1y_nifty_return') AS DOUBLE))", "Alpha vs Nifty (1Y)", "vs Nifty", "numeric", "Outperformance compared to Nifty over 1 year.", ""),

    # ── VALUATION ─────────────────────────────────────────────────────────
    "pe_ratio":          ("pe_ratio",  "P/E Ratio",   "Valuation", "numeric", "Price-to-Earnings Ratio. Measures current share price relative to per-share earnings.", "Valuation."),
    "pb_ratio":          ("TRY_CAST(json_extract_string(absolute_data,'$.pbRatio') AS DOUBLE)",       "P/B Ratio",       "Valuation", "numeric", "Price-to-Book Ratio. Compares market valuation to its book value.", ""),
    "ev_to_ebitda":      ("TRY_CAST(json_extract_string(absolute_data,'$.evToEbitda') AS DOUBLE)",    "EV/EBITDA",       "Valuation", "numeric", "Enterprise Value over Earnings Before Interest, Taxes, Depreciation, and Amortization.", ""),
    "ev_to_sales":       ("TRY_CAST(json_extract_string(absolute_data,'$.evToSales') AS DOUBLE)",     "EV/Sales",        "Valuation", "numeric", "Enterprise Value over Sales revenue.", ""),
    "peg_ratio":         ("TRY_CAST(json_extract_string(absolute_data,'$.pegRatio') AS DOUBLE)",      "PEG Ratio",       "Valuation", "numeric", "P/E Ratio divided by the growth rate of its earnings for a specified time period.", ""),
    "price_to_ocf":      ("TRY_CAST(json_extract_string(absolute_data,'$.priceToOcf') AS DOUBLE)",    "Price/OCF",       "Valuation", "numeric", "Price to Operating Cash Flow.", ""),
    "price_to_fcf":      ("TRY_CAST(json_extract_string(absolute_data,'$.priceToFcf') AS DOUBLE)",    "Price/FCF",       "Valuation", "numeric", "Price to Free Cash Flow.", ""),
    "earnings_yield":    ("TRY_CAST(json_extract_string(absolute_data,'$.earningsYield') AS DOUBLE)",  "Earnings Yield %","Valuation", "numeric", "Earnings per share divided by the current market price.", ""),
    "price_to_sales":    ("TRY_CAST(json_extract_string(absolute_data,'$.priceToSales') AS DOUBLE)",   "Price/Sales",     "Valuation", "numeric", "Stock price divided by sales per share.", ""),

    # ── PROFITABILITY ──────────────────────────────────────────────────────
    "roe":               ("TRY_CAST(json_extract_string(absolute_data,'$.roe') AS DOUBLE)",                        "ROE %",              "Profitability", "numeric", "Return on Equity. A measure of financial performance calculated by dividing net income by shareholders' equity.", ""),
    "roa":               ("TRY_CAST(json_extract_string(absolute_data,'$.returnOnAssets') AS DOUBLE)",             "ROA %",              "Profitability", "numeric", "Return on Assets. Indicates how profitable a company is relative to its total assets.", ""),
    "roic":              ("TRY_CAST(json_extract_string(absolute_data,'$.roic') AS DOUBLE)",                       "ROIC %",             "Profitability", "numeric", "Return on Invested Capital. Assesses a company's efficiency at allocating the capital under its control to profitable investments.", ""),
    "operating_margin":  ("TRY_CAST(json_extract_string(absolute_data,'$.operatingProfitMargin') AS DOUBLE)",      "Operating Margin %", "Profitability", "numeric", "Measures how much profit a company makes on a dollar of sales, after paying for variable costs of production.", ""),
    "net_margin":        ("TRY_CAST(json_extract_string(absolute_data,'$.netProfitMargin') AS DOUBLE)",            "Net Margin %",       "Profitability", "numeric", "Measures how much net income or profit is generated as a percentage of revenue.", ""),

    # ── DIVIDENDS ──────────────────────────────────────────────────────────
    "div_yield":           ("TRY_CAST(json_extract_string(absolute_data,'$.divYield') AS DOUBLE)",           "Dividend Yield %",       "Dividends", "numeric", "Dividend payout expressed as a percentage of the current share price.", ""),
    "sector_div_yield":    ("TRY_CAST(json_extract_string(absolute_data,'$.sectorDivYield') AS DOUBLE)",     "Sector Div Yield %",     "vs Sector", "numeric", "Average dividend yield of the sector.", ""),
    "div_yield_vs_sector": ("TRY_CAST(json_extract_string(absolute_data,'$.divYieldVsSector') AS DOUBLE)",   "Div Yield vs Sector",    "vs Sector", "numeric", "Company's dividend yield compared to its sector average.", ""),
    "sector_pe":           ("TRY_CAST(json_extract_string(absolute_data,'$.sectorPe') AS DOUBLE)",           "Sector P/E",             "vs Sector", "numeric", "Average P/E ratio of the sector.", ""),
    "pe_premium_vs_sector":("(TRY_CAST(json_extract_string(absolute_data,'$.peRatio') AS DOUBLE) - TRY_CAST(json_extract_string(absolute_data,'$.sectorPe') AS DOUBLE)) / NULLIF(TRY_CAST(json_extract_string(absolute_data,'$.sectorPe') AS DOUBLE), 0) * 100", "P/E Premium vs Sector %", "vs Sector", "numeric", "Percentage by which the company's P/E ratio exceeds the sector average.", ""),
    "sector_pb":           ("TRY_CAST(json_extract_string(absolute_data,'$.sectorPb') AS DOUBLE)",           "Sector P/B",             "vs Sector", "numeric", "Average P/B ratio of the sector.", ""),
    "pb_premium_vs_sector":("(TRY_CAST(json_extract_string(absolute_data,'$.pbRatio') AS DOUBLE) - TRY_CAST(json_extract_string(absolute_data,'$.sectorPb') AS DOUBLE)) / NULLIF(TRY_CAST(json_extract_string(absolute_data,'$.sectorPb') AS DOUBLE), 0) * 100", "P/B Premium vs Sector %", "vs Sector", "numeric", "Percentage by which the company's P/B ratio exceeds the sector average.", ""),

    # ── PER-SHARE ──────────────────────────────────────────────────────────
    "eps_ttm":     ("TRY_CAST(json_extract_string(absolute_data,'$.epsTtm') AS DOUBLE)",     "EPS TTM (₹)",    "Per-Share", "numeric", "Earnings Per Share over the trailing twelve months.", ""),
    "book_value":  ("TRY_CAST(json_extract_string(absolute_data,'$.bookValue') AS DOUBLE)",  "Book Value (₹)", "Per-Share", "numeric", "Net asset value of a company calculated as total assets minus intangible assets and liabilities.", ""),
    "face_value":  ("TRY_CAST(json_extract_string(absolute_data,'$.faceValue') AS DOUBLE)",  "Face Value (₹)", "Per-Share", "numeric", "The nominal value of a stock, as stated by the issuer.", ""),

    # ── HEALTH / LEVERAGE ─────────────────────────────────────────────────
    "current_ratio":  ("TRY_CAST(json_extract_string(absolute_data,'$.currentRatio') AS DOUBLE)", "Current Ratio", "Health", "numeric", ""),
    "quick_ratio":    ("TRY_CAST(json_extract_string(absolute_data,'$.quickRatio') AS DOUBLE)",   "Quick Ratio",   "Health", "numeric", ""),
    "cash_ratio":     ("TRY_CAST(json_extract_string(absolute_data,'$.cashRatio') AS DOUBLE)",    "Cash Ratio",    "Health", "numeric", ""),

    # ── SECTOR RELATIVE ───────────────────────────────────────────────────
    "industry_pe":          ("TRY_CAST(json_extract_string(absolute_data,'$.industryPe') AS DOUBLE)",          "Industry P/E",          "Sector Relative", "numeric", ""),
    "sector_pb":            ("TRY_CAST(json_extract_string(absolute_data,'$.sectorPb') AS DOUBLE)",            "Sector P/B",            "Sector Relative", "numeric", ""),
    "sector_roe":           ("TRY_CAST(json_extract_string(absolute_data,'$.sectorRoe') AS DOUBLE)",           "Sector ROE %",          "Sector Relative", "numeric", ""),
    "sector_roce":          ("TRY_CAST(json_extract_string(absolute_data,'$.sectorRoce') AS DOUBLE)",          "Sector ROCE %",         "Sector Relative", "numeric", ""),
    "pe_premium_vs_sector": ("TRY_CAST(json_extract_string(absolute_data,'$.pePremiumVsSector') AS DOUBLE)",   "P/E Premium vs Sector", "Sector Relative", "numeric", ""),
    "pb_premium_vs_sector": ("TRY_CAST(json_extract_string(absolute_data,'$.pbPremiumVsSector') AS DOUBLE)",   "P/B Premium vs Sector", "Sector Relative", "numeric", ""),

    # ── MOVING AVERAGES ───────────────────────────────────────────────────
    "sma10":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.sma10Days') AS DOUBLE)",  "SMA 10D",  "Moving Averages", "numeric", ""),
    "ema10":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.ema10Days') AS DOUBLE)",  "EMA 10D",  "Moving Averages", "numeric", ""),
    "sma20":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.sma20Days') AS DOUBLE)",  "SMA 20D",  "Moving Averages", "numeric", ""),
    "ema20":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.ema20Days') AS DOUBLE)",  "EMA 20D",  "Moving Averages", "numeric", ""),
    "sma50":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.sma50Days') AS DOUBLE)",  "SMA 50D",  "Moving Averages", "numeric", ""),
    "ema50":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.ema50Days') AS DOUBLE)",  "EMA 50D",  "Moving Averages", "numeric", ""),
    "sma100": ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.sma100Days') AS DOUBLE)", "SMA 100D", "Moving Averages", "numeric", ""),
    "ema100": ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.ema100Days') AS DOUBLE)", "EMA 100D", "Moving Averages", "numeric", ""),
    "sma200": ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.sma200Days') AS DOUBLE)", "SMA 200D", "Moving Averages", "numeric", ""),
    "ema200": ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.ema200Days') AS DOUBLE)", "EMA 200D", "Moving Averages", "numeric", ""),

    # ── TECHNICAL INDICATORS ──────────────────────────────────────────────
    "rsi14":              ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.rsi14') AS DOUBLE)",                                    "RSI (14)",               "Technical", "numeric", ""),
    "macd":               ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.macd') AS DOUBLE)",                                     "MACD",                   "Technical", "numeric", ""),
    "macd_histogram":     ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.macd_histogram') AS DOUBLE)",              "MACD Histogram",         "Technical", "numeric", ""),
    "beta":               ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.beta') AS DOUBLE)",                                     "Beta",                   "Technical", "numeric", ""),
    "atr14":              ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.atr_14') AS DOUBLE)",                      "ATR (14)",               "Technical", "numeric", ""),
    "bollinger_upper":    ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.bollinger_upper') AS DOUBLE)",              "Bollinger Upper",        "Technical", "numeric", ""),
    "bollinger_lower":    ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.bollinger_lower') AS DOUBLE)",              "Bollinger Lower",        "Technical", "numeric", ""),
    "distance_sma50":     ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.distance_from_sma50') AS DOUBLE)",          "Distance from SMA50 %",  "Technical", "numeric", ""),
    "volume_intensity":   ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.volume_intensity_52w') AS DOUBLE)",         "Volume Intensity 52W",   "Technical", "numeric", ""),
    "volatility_13w":     ("TRY_CAST(json_extract_string(relative_data,'$.technical_state_signals.volatility_13w') AS DOUBLE)",               "Volatility (13W)",       "Technical", "numeric", ""),
    "volatility_squeeze": ("volatility_squeeze",                                                                                              "Volatility Squeeze Idx", "Technical", "numeric", "Volatility Squeeze Idx."),
    "rs_rating":          ("rs_rating",                                                                                                       "RS Rating (1–99)",       "Technical", "numeric", "RS Rating (1–99)."),
    "rs_nifty_52w":       ("TRY_CAST(json_extract_string(relative_data,'$.relative_strength_signals.rs_nifty_52w') AS DOUBLE)",               "RS vs Nifty (52W)",      "Technical", "numeric", ""),
    "beta_vs_benchmark":  ("TRY_CAST(json_extract_string(relative_data,'$.relative_strength_signals.beta_vs_benchmark') AS DOUBLE)",          "Beta vs Benchmark",      "Technical", "numeric", ""),

    # ── PRICE LEVELS ──────────────────────────────────────────────────────
    "pivot_point":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.pivotPoint') AS DOUBLE)", "Pivot Point",  "Price Levels", "numeric", ""),
    "resistance1":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.r1') AS DOUBLE)",         "Resistance R1","Price Levels", "numeric", ""),
    "resistance2":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.r2') AS DOUBLE)",         "Resistance R2","Price Levels", "numeric", ""),
    "resistance3":  ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.r3') AS DOUBLE)",         "Resistance R3","Price Levels", "numeric", ""),
    "support1":     ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.s1') AS DOUBLE)",         "Support S1",   "Price Levels", "numeric", ""),
    "support2":     ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.s2') AS DOUBLE)",         "Support S2",   "Price Levels", "numeric", ""),
    "support3":     ("TRY_CAST(json_extract_string(absolute_data,'$.technicals.s3') AS DOUBLE)",         "Support S3",   "Price Levels", "numeric", ""),

    # ── GROWTH (financialStatement CAGR + relative_data) ──────────────────
    "revenue_yoy":     ("TRY_CAST(json_extract_string(relative_data,'$.financial_growth_signals.revenue_yoy') AS DOUBLE)",      "Revenue YoY %",    "Growth", "numeric", ""),
    "profit_yoy":      ("TRY_CAST(json_extract_string(relative_data,'$.financial_growth_signals.profit_yoy') AS DOUBLE)",       "Profit YoY %",     "Growth", "numeric", ""),
    "revenue_1y_cagr": ("TRY_CAST(json_extract_string(absolute_data,'$.financialStatement[0].cagr.oneYearTtm') AS DOUBLE)",     "Revenue 1Y CAGR",  "Growth", "numeric", ""),
    "revenue_3y_cagr": ("TRY_CAST(json_extract_string(absolute_data,'$.financialStatement[0].cagr.threeYearCagr') AS DOUBLE)",  "Revenue 3Y CAGR",  "Growth", "numeric", ""),
    "profit_1y_cagr":  ("TRY_CAST(json_extract_string(absolute_data,'$.financialStatement[1].cagr.oneYearTtm') AS DOUBLE)",     "Profit 1Y CAGR",   "Growth", "numeric", ""),
    "profit_3y_cagr":  ("TRY_CAST(json_extract_string(absolute_data,'$.financialStatement[1].cagr.threeYearCagr') AS DOUBLE)",  "Profit 3Y CAGR",   "Growth", "numeric", ""),

    # ── SHAREHOLDING ──────────────────────────────────────────────────────
    "inst_accum":    ("inst_accum",                                                                                              "Inst. Accum QoQ %",  "Shareholding", "numeric", "Inst. Accum QoQ %."),
    "pledge_delta":  ("pledge_delta",                                                                                            "Pledge Delta %",     "Shareholding", "numeric", "Pledge Delta %."),
    "free_float":    ("TRY_CAST(json_extract_string(relative_data,'$.shareholding_momentum_vectors.free_float_pct') AS DOUBLE)","Free Float %",       "Shareholding", "numeric", ""),

    # ── HEALTH SCORES (pre-computed in ML pipeline) ───────────────────────
    "piotroski_f":   ("TRY_CAST(json_extract_string(json_extract_string(relative_data,'$.health_scores.piotroski_f_score'), '$.total_score') AS DOUBLE)",  "Piotroski F-Score (0–9)","Health Scores", "numeric", ""),
    "graham_number": ("TRY_CAST(json_extract_string(relative_data,'$.health_scores.graham_number_value') AS DOUBLE)","Graham Number (₹)",      "Health Scores", "numeric", ""),
    "altman_z":      ("TRY_CAST(json_extract_string(relative_data,'$.health_scores.altman_z_proxy') AS DOUBLE)",     "Altman Z-Score Proxy",   "Health Scores", "numeric", ""),

    # ── FORENSIC / RISK ───────────────────────────────────────────────────

    "hni_absorption":  ("TRY_CAST(json_extract_string(relative_data,'$.risk_and_forensic_signals.hni_absorption_score') AS DOUBLE)","HNI Absorption Score","Forensic", "numeric", ""),
    "debt_crisis":     ("TRY_CAST(json_extract_string(relative_data,'$.aggregated_news_signals.active_debt_crisis_flag') AS DOUBLE)","Debt Crisis Flag (0/1)","Forensic", "flag", ""),
    "regulatory_flag": ("TRY_CAST(json_extract_string(relative_data,'$.aggregated_news_signals.active_regulatory_flag') AS DOUBLE)","Regulatory Flag (0/1)","Forensic", "flag", ""),

    # ── QUANT / RANK ──────────────────────────────────────────────────────
    "raw_rank": ("raw_rank", "Raw Rank (0–1)", "Quant", "numeric", "Raw Rank (0–1)."),

    # ── MACRO REGIME ──────────────────────────────────────────────────────
    "vix_intensity":   ("TRY_CAST(json_extract_string(relative_data,'$.macro_market_regime.vix_intensity_ratio') AS DOUBLE)",   "VIX Intensity Ratio",   "Macro", "numeric", ""),
    "is_bull_regime":  ("TRY_CAST(json_extract_string(relative_data,'$.macro_market_regime.is_bull_regime') AS DOUBLE)",        "Bull Regime (0/1)",      "Macro", "flag", ""),
    "nifty_trend":     ("TRY_CAST(json_extract_string(relative_data,'$.macro_market_regime.nifty_50_trend_ratio') AS DOUBLE)",  "Nifty 50 Trend Ratio",  "Macro", "numeric", ""),
    "market_breadth":  ("TRY_CAST(json_extract_string(relative_data,'$.market_breadth_regime.market_breadth_50dma_pct') AS DOUBLE)","Market Breadth % above 50DMA","Macro", "numeric", ""),
}

# ────────────────────────────────────────────────────────────────────────────
#  MUTUAL FUND METRICS REGISTRY
# ────────────────────────────────────────────────────────────────────────────
MF_METRICS: dict[str, tuple] = {
    # ── IDENTITY ──────────────────────────────────────────────────────────
    "category":          ("category",      "Category",         "Identity", "string", "Category."),
    "sub_category":      ("sub_category",  "Sub-Category",     "Identity", "string", "Sub-Category."),
    "risk":              ("risk",          "Risk Level",       "Identity", "string", "Risk Level."),
    "risk_rating":       ("risk_rating",   "Risk Score (1–7)", "Identity", "numeric", "Risk Score (1–7)."),
    "plan_type":         ("plan_type",     "Plan Type",        "Identity", "string", "Plan Type."),
    "fund_house":        ("fund_house",    "Fund House",       "Identity", "string", "Fund House."),

    # ── SIZE & COST ───────────────────────────────────────────────────────
    "aum":           ("aum",           "AUM (Cr)",       "Size & Cost", "numeric", "AUM (Cr)."),
    "nav":           ("nav",           "NAV (₹)",        "Size & Cost", "numeric", "NAV (₹)."),
    "expense_ratio": ("TRY_CAST(expense_ratio AS DOUBLE)", "Expense Ratio %", "Size & Cost", "numeric", ""),
    "min_sip":       ("min_sip_investment", "Min SIP (₹)", "Size & Cost", "numeric", "Min SIP (₹)."),
    "min_lumpsum":   ("min_investment_amount", "Min Lumpsum (₹)", "Size & Cost", "numeric", "Min Lumpsum (₹)."),

    # ── LUMP-SUM RETURNS ──────────────────────────────────────────────────
    "return1d":   ("return1d",   "1D Return %",  "Returns (Lump Sum)", "numeric", "1D Return %."),
    "return3m":   ("return3m",   "3M Return %",  "Returns (Lump Sum)", "numeric", "3M Return %."),
    "return6m":   ("return6m",   "6M Return %",  "Returns (Lump Sum)", "numeric", "6M Return %."),
    "return1y":   ("return1y",   "1Y Return %",  "Returns (Lump Sum)", "numeric", "1Y Return %."),
    "return3y":   ("return3y",   "3Y Return %",  "Returns (Lump Sum)", "numeric", "3Y Return %."),
    "return5y":   ("return5y",   "5Y Return %",  "Returns (Lump Sum)", "numeric", "5Y Return %."),
    "return7y":   ("return7y",   "7Y Return %",  "Returns (Lump Sum)", "numeric", "7Y Return %."),
    "return10y":  ("return10y",  "10Y Return %", "Returns (Lump Sum)", "numeric", "10Y Return %."),
    "mean_return":("mean_return","Mean Return %", "Returns (Lump Sum)", "numeric", "Mean Return %."),

    # ── SIP RETURNS ───────────────────────────────────────────────────────
    "sip_return3m":  ("sip_return3m",  "SIP 3M %",  "Returns (SIP)", "numeric", "SIP 3M %."),
    "sip_return6m":  ("sip_return6m",  "SIP 6M %",  "Returns (SIP)", "numeric", "SIP 6M %."),
    "sip_return1y":  ("sip_return1y",  "SIP 1Y %",  "Returns (SIP)", "numeric", "SIP 1Y %."),
    "sip_return3y":  ("sip_return3y",  "SIP 3Y %",  "Returns (SIP)", "numeric", "SIP 3Y %."),
    "sip_return5y":  ("sip_return5y",  "SIP 5Y %",  "Returns (SIP)", "numeric", "SIP 5Y %."),

    # ── BENCHMARK ─────────────────────────────────────────────────────────
    "sub_cat_return3y": ("sub_category_average_return3y", "Sub-Cat Avg 3Y %", "Benchmark", "numeric", "Sub-Cat Avg 3Y %."),

    # ── AVAILABILITY ──────────────────────────────────────────────────────
    "available_for_investment": ("available_for_investment", "Available for Investment (0/1)", "Availability", "flag", "Available for Investment (0/1)."),
    "sip_allowed":              ("sip_allowed",              "SIP Allowed (0/1)",              "Availability", "flag", "SIP Allowed (0/1)."),
}

# ────────────────────────────────────────────────────────────────────────────
#  PYDANTIC MODELS
# ────────────────────────────────────────────────────────────────────────────
class QueryToken(BaseModel):
    type: str
    value: Any

class FilterClause(BaseModel):
    field: str
    op: str        # >, <, >=, <=, =, !=
    value: Any
    logic: str = None # "AND" or "OR"
    op2: str = None
    value2: Any = None
    outerLogic: str = None # "AND" or "OR"

class ScreenerRequest(BaseModel):
    filters:      List[FilterClause] = []
    query_tokens: List[QueryToken] = []
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
    
    db_parquet_actual = os.path.realpath(DB_PARQUET_LINK)
    mf_parquet_actual = os.path.realpath(MF_PARQUET_LINK)
    
    if not os.path.exists(db_parquet_actual):
        raise RuntimeError(f"Parquet not found: {db_parquet_actual}")
        
    con = duckdb.connect(":memory:")
    con.execute(f"CREATE OR REPLACE VIEW stocks AS SELECT * FROM '{db_parquet_actual}'")
    
    if os.path.exists(mf_parquet_actual):
        con.execute(f"CREATE OR REPLACE VIEW mutual_funds AS SELECT * FROM '{mf_parquet_actual}'")

    etf_parquet_actual = os.path.realpath(ETF_PARQUET_LINK)
    if os.path.exists(etf_parquet_actual):
        con.execute(f"CREATE OR REPLACE VIEW etfs AS SELECT * FROM '{etf_parquet_actual}'")
        
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
    where_sql_parts = []
    params = []
    
    if req.query_tokens:
        for t in req.query_tokens:
            if t.type == 'bracket':
                if str(t.value) in ['(', ')']:
                    where_sql_parts.append(str(t.value))
            elif t.type == 'logic':
                logic_val = str(t.value).upper()
                if logic_val in ['AND', 'OR']:
                    where_sql_parts.append(logic_val)
            elif t.type == 'operator':
                op_val = str(t.value).strip()
                if op_val in VALID_OPS:
                    where_sql_parts.append(op_val)
            elif t.type == 'metric':
                metric_key = str(t.value)
                if metric_key in registry:
                    expr = registry[metric_key][0]
                    where_sql_parts.append(f"({expr})")
            elif t.type == 'value':
                try:
                    val = float(t.value) if isinstance(t.value, str) else t.value
                except (TypeError, ValueError):
                    val = t.value
                where_sql_parts.append("?")
                params.append(val)
    elif req.filters:
        # Fallback to old filters logic
        for f in req.filters:
            if f.field not in registry:
                continue
            op1 = f.op.strip()
            if op1 not in VALID_OPS:
                continue
            expr = registry[f.field][0]
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
            m["description"] = v[4]
        if len(v) > 5:
            m["options"] = v[5]
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

# ─────────────────────────────────────────────────────────────────────────────
#  ETF METRICS REGISTRY
# ─────────────────────────────────────────────────────────────────────────────
ETF_METRICS: dict[str, tuple] = {

    # ── IDENTITY ──────────────────────────────────────────────────────────
    "etf_type":  ("type", "ETF Type", "Identity", "string", "The type classification of the ETF.", ""),

    # ── PRICE & RETURNS ───────────────────────────────────────────────────
    "live_price":     ("livePrice",     "Live Price (₹)",  "Price", "numeric", "Current market price of the ETF.", ""),
    "day_change_pct": ("dayChangePerc", "Day Change %",     "Price", "numeric", "Percentage price change over the last trading day.", ""),
    "return_1m":  ("TRY_CAST(json_extract_string(stats,'$.returns.return1M')  AS DOUBLE)", "1M Return %",  "Price", "numeric", "ETF return over last 1 month.", ""),
    "return_3m":  ("TRY_CAST(json_extract_string(stats,'$.returns.return3M')  AS DOUBLE)", "3M Return %",  "Price", "numeric", "ETF return over last 3 months.", ""),
    "return_6m":  ("TRY_CAST(json_extract_string(stats,'$.returns.return6M')  AS DOUBLE)", "6M Return %",  "Price", "numeric", "ETF return over last 6 months.", ""),
    "return_1y":  ("TRY_CAST(json_extract_string(stats,'$.returns.return1Y')  AS DOUBLE)", "1Y Return %",  "Price", "numeric", "ETF return over last 1 year.", ""),
    "return_3y":  ("TRY_CAST(json_extract_string(stats,'$.returns.return3Y')  AS DOUBLE)", "3Y Return %",  "Price", "numeric", "ETF return over last 3 years.", ""),
    "return_5y":  ("TRY_CAST(json_extract_string(stats,'$.returns.return5Y')  AS DOUBLE)", "5Y Return %",  "Price", "numeric", "ETF return over last 5 years.", ""),
    "cat_return_1y": ("TRY_CAST(json_extract_string(stats,'$.returns.categoryReturn1Y') AS DOUBLE)", "Category 1Y Return %", "Price", "numeric", "Category average 1Y return.", ""),

    # ── SIZE & COST ───────────────────────────────────────────────────────
    "aum":            ("marketCap",  "AUM (Cr)",          "Size & Cost", "numeric", "Assets Under Management in Crores.", ""),
    "nav":            ("TRY_CAST(json_extract_string(stats,'$.nav') AS DOUBLE)",            "NAV (₹)",            "Size & Cost", "numeric", "Net Asset Value per unit.", ""),
    "expense_ratio":  ("TRY_CAST(json_extract_string(stats,'$.expenseRatio') AS DOUBLE)",   "Expense Ratio %",     "Size & Cost", "numeric", "Annual fee charged by the ETF as a % of AUM.", ""),
    "tracking_error": ("TRY_CAST(json_extract_string(stats,'$.trackingError') AS DOUBLE)",  "Tracking Error %",    "Size & Cost", "numeric", "Deviation of ETF returns from the benchmark index.", ""),

    # ── VALUATION ─────────────────────────────────────────────────────────
    "pe_ratio": ("peRatio",                                                           "P/E Ratio",   "Valuation", "numeric", "Price-to-Earnings Ratio of the ETF.", ""),
    "pb_ratio": ("TRY_CAST(json_extract_string(stats,'$.pbRatio') AS DOUBLE)",        "P/B Ratio",   "Valuation", "numeric", "Price-to-Book Ratio of the ETF.", ""),

    # ── RANK (within category) ────────────────────────────────────────────
    "rank_1m": ("TRY_CAST(json_extract_string(stats,'$.returns.rank1M') AS INTEGER)", "Rank (1M)",   "Rank", "numeric", "Rank within category over 1 month.", ""),
    "rank_1y": ("TRY_CAST(json_extract_string(stats,'$.returns.rank1Y') AS INTEGER)", "Rank (1Y)",   "Rank", "numeric", "Rank within category over 1 year.", ""),
    "rank_3y": ("TRY_CAST(json_extract_string(stats,'$.returns.rank3Y') AS INTEGER)", "Rank (3Y)",   "Rank", "numeric", "Rank within category over 3 years.", ""),
}


# ─────────────────────────────────────────────────────────────────────────────
#  ETF SCREENER ENDPOINT
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/api/screener/etfs")
def screen_etfs(req: ScreenerRequest):
    try:
        con = get_con()
        always = [
            "slug",
            "ticker",
            "name",
            "type",
            "json_extract_string(header,'$.logoUrl') AS logo_url",
        ]
        main_sql, count_sql, params = build_query("etfs", ETF_METRICS, req, always)

        df    = con.execute(main_sql,  params).df()
        df    = df.replace({np.nan: None, np.inf: None, -np.inf: None})
        data  = nan_safe(df.to_dict("records"))
        count = con.execute(count_sql, params).fetchone()[0]

        return {
            "data": data,
            "total": count,
            "page": req.page,
            "limit": req.limit,
            "available_metrics": metrics_meta(ETF_METRICS, "etfs")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

