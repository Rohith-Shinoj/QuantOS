import os
import sys
import re
import json
import time

# Ensure root directory is in path for imports
sys.path.append(os.getcwd())
import math
import argparse
import requests
import numpy as np
import duckdb
from datetime import datetime, date
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from bs4 import BeautifulSoup

# Initialize SIA once
sia = SentimentIntensityAnalyzer()
sia.lexicon.update({
    'crushed': 0.7, 'beat': 0.8, 'missed': -0.8, 'liability': 0.0,
    'surged': 0.6, 'plunged': -0.8, 'bankruptcy': -0.9, 'default': -0.9,
    'growth': 0.4, 'profitable': 0.5, 'slashed': -0.4, 'downgraded': -0.6, 'upgraded': 0.6,
    'bullish': 0.5, 'bearish': -0.5, 'dividend': 0.3, 'fraud': -0.9, 'investigation': -0.6,
    'scam': -0.9, 'resignation': -0.7, 'lawsuit': -0.6, 'fine': -0.5, 'probe': -0.5,
    'invest': 0.4, 'expansion': 0.5, 'acquire': 0.5, 'deal': 0.4, 'partnership': 0.5,
    'surge': 0.5, 'record': 0.5, 'target': 0.3, 'upgrade': 0.5, 'downgrade': -0.5
})

# --- UTILITIES ---

def clean_float(val):
    if val is None or val == '-': return np.nan
    try:
        if isinstance(val, (int, float)): return float(val)
        clean_str = re.sub(r'[₹%, \s]', '', str(val))
        if not clean_str or clean_str == '-': return np.nan
        return float(clean_str)
    except: return np.nan

def safe_div(n, d):
    try:
        n_f, d_f = float(n), float(d)
        if d_f == 0 or np.isnan(n_f) or np.isnan(d_f): return np.nan
        return n_f / d_f
    except: return np.nan

def safe_log(val):
    try:
        if val is None or np.isnan(val) or val <= 0: return np.nan
        return math.log(val)
    except: return np.nan

def parse_quarter_date(q_str):
    try:
        m, y = q_str.split(" '")
        months = {"Jan":1, "Feb":2, "Mar":3, "Apr":4, "May":5, "Jun":6, 
                  "Jul":7, "Aug":8, "Sep":9, "Oct":10, "Nov":11, "Dec":12}
        return datetime(2000 + int(y), months[m], 1)
    except: return datetime(1900, 1, 1)

def get_nested(data, path, default=np.nan):
    keys = path.split('.')
    for key in keys:
        if isinstance(data, dict): data = data.get(key)
        else: return default
    return data if data is not None else default

def sanitize_nan(obj):
    if isinstance(obj, dict): return {k: sanitize_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list): return [sanitize_nan(i) for i in obj]
    elif isinstance(obj, (float, np.float64)) and np.isnan(obj): return None
    return obj

# --- ENGINEERING ---

class MLDatasetEngineer:
    def __init__(self, raw_data, ohlcv, ref_idx=-1, index_map=None, market_breadth_map=None):
        self.raw = raw_data.get("raw_next_data", {})
        self.stock_data = self.raw.get("stockData", {})
        self.ohlcv = ohlcv or []
        self.index_map = index_map or {}
        self.market_breadth_map = market_breadth_map or {}
        
        if not self.ohlcv:
            self.ref_idx = 0
            self.active_ohlcv = []
            self.ref_time = datetime.now()
        else:
            if ref_idx < 0: self.ref_idx = len(self.ohlcv) + ref_idx
            else: self.ref_idx = ref_idx
            self.ref_idx = max(0, min(self.ref_idx, len(self.ohlcv) - 1))
            self.active_ohlcv = self.ohlcv[:self.ref_idx + 1]
            self.ref_time = datetime.fromtimestamp(self.ohlcv[self.ref_idx]["Timestamp"])

        self.cap_type = self.stock_data.get("stats", {}).get("cappedType", "Small Cap")
        if self.cap_type == "Large Cap": self.benchmark_key = "NIFTY"
        elif self.cap_type == "Mid Cap":
            self.benchmark_key = "NIFTYMIDCAP150"
            if self.benchmark_key not in self.index_map: self.benchmark_key = "NIFTY"
        else:
            self.benchmark_key = "NIFTYSMALLCAP250"
            if self.benchmark_key not in self.index_map: self.benchmark_key = "NIFTY"

        self.active_indices = {}
        ref_ts = self.ohlcv[self.ref_idx]["Timestamp"] if self.ohlcv else 0
        for name, idx_ohlcv in self.index_map.items():
            self.active_indices[name] = [c for c in idx_ohlcv if c["Timestamp"] <= ref_ts]

        self.live_price = raw_data.get("live_price", 0.0)
        if self.live_price == 0.0 and self.active_ohlcv:
            self.live_price = float(self.active_ohlcv[-1]["Close"])
            
        self.features = {}
        self.fallback_count = 0
        self.total_expected_features = 0

    def track(self, val, is_fallback=False):
        self.total_expected_features += 1
        if is_fallback or val is None or (isinstance(val, (float, np.float64)) and np.isnan(val)):
            self.fallback_count += 1
            return np.nan
        return val

    def derive_all(self, present_price=None):
        self.features["meta_features"] = self._derive_meta()
        self.features["normalized_fundamentals"] = self._derive_fundamentals()
        self.features["structural_capital_efficiency"] = self._derive_efficiency()
        self.features["financial_growth_signals"] = self._derive_growth()
        self.features["shareholding_momentum_vectors"] = self._derive_momentum()
        self.features["technical_state_signals"] = self._derive_technicals()
        self.features["aggregated_news_signals"] = self._derive_news()
        self.features["liquidity_valuation_ratios"] = self._derive_liquidity()
        self.features["sector_relative_premiums"] = self._derive_sector_premiums()
        self.features["relative_strength_signals"] = self._derive_relative_strength()
        self.features["macro_market_regime"] = self._derive_macro_regime()
        self.features["continuous_scale_transformations"] = self._derive_scaling()
        self.features["historical_time_series_matrix"] = self._derive_history()
        self.features["health_scores"] = self._derive_health_scores()
        self.features["risk_and_forensic_signals"] = self._derive_risk_and_forensics()
        self.features["macro_resilience_profile"] = self._derive_resilience()
        self.features["market_breadth_regime"] = self._derive_market_breadth()
        self.features["price_returns"] = self._derive_price_returns()
        
        self.features["data_integrity"] = 1.0 - safe_div(self.fallback_count, self.total_expected_features)
        return self.features

    def _derive_price_returns(self):
        returns = {}
        
        def calc_ret(periods):
            if not self.active_ohlcv or len(self.active_ohlcv) <= periods: return np.nan
            start_price = self.active_ohlcv[-1-periods]["Close"]
            end_price = self.active_ohlcv[-1]["Close"]
            return safe_div(end_price - start_price, start_price) * 100.0

        returns["1m_return"] = self.track(calc_ret(21))
        returns["3m_return"] = self.track(calc_ret(63))
        returns["6m_return"] = self.track(calc_ret(126))
        returns["1y_return"] = self.track(calc_ret(252))
        returns["5y_return"] = self.track(calc_ret(1260))

        ytd_return = np.nan
        if self.active_ohlcv:
            current_year = datetime.fromtimestamp(self.active_ohlcv[-1]["Timestamp"]).year
            start_price = None
            for c in reversed(self.active_ohlcv):
                if datetime.fromtimestamp(c["Timestamp"]).year != current_year:
                    break
                start_price = c["Close"]
            if start_price is not None:
                end_price = self.active_ohlcv[-1]["Close"]
                ytd_return = safe_div(end_price - start_price, start_price) * 100.0
        returns["ytd_return"] = self.track(ytd_return)
        
        # Calculate vs Nifty returns
        nifty_ohlcv = self.active_indices.get("NIFTY", [])
        
        def calc_nifty_ret(periods):
            if not nifty_ohlcv or len(nifty_ohlcv) <= periods: return np.nan
            start_price = nifty_ohlcv[-1-periods]["Close"]
            end_price = nifty_ohlcv[-1]["Close"]
            return safe_div(end_price - start_price, start_price) * 100.0

        returns["1m_nifty_return"] = self.track(calc_nifty_ret(21))
        returns["3m_nifty_return"] = self.track(calc_nifty_ret(63))
        returns["6m_nifty_return"] = self.track(calc_nifty_ret(126))
        returns["1y_nifty_return"] = self.track(calc_nifty_ret(252))
        returns["5y_nifty_return"] = self.track(calc_nifty_ret(1260))
        
        ytd_nifty_return = np.nan
        if nifty_ohlcv:
            current_year = datetime.fromtimestamp(nifty_ohlcv[-1]["Timestamp"]).year
            start_price = None
            for c in reversed(nifty_ohlcv):
                if datetime.fromtimestamp(c["Timestamp"]).year != current_year:
                    break
                start_price = c["Close"]
            if start_price is not None:
                end_price = nifty_ohlcv[-1]["Close"]
                ytd_nifty_return = safe_div(end_price - start_price, start_price) * 100.0
        returns["ytd_nifty_return"] = self.track(ytd_nifty_return)

        return returns

    def _derive_risk_and_forensics(self):
        # 1. Volatility Squeeze Index (Bollinger Band Width instead of arbitrary division)
        v_squeeze = np.nan
        if self.active_ohlcv and len(self.active_ohlcv) >= 20:
            closes = [c["Close"] for c in self.active_ohlcv[-20:]]
            sma20 = np.mean(closes)
            std20 = np.std(closes)
            if sma20 > 0:
                v_squeeze = (2 * std20) / sma20 # BBW


        # 2. HNI Absorption Score
        mom = self._derive_momentum()
        shp = self.stock_data.get("shareHoldingPattern", {})
        hni_absorption = np.nan
        try:
            if isinstance(shp, dict):
                quarters = sorted([q for q in shp.keys() if isinstance(shp[q], dict) and parse_quarter_date(q) <= self.ref_time], key=parse_quarter_date)
                if len(quarters) >= 2:
                    t, t_1 = quarters[-1], quarters[-2]
                    retail_t, retail_t1 = get_nested(shp[t], "retailAndOthers.percent", 0.0), get_nested(shp[t_1], "retailAndOthers.percent", 0.0)
                    hni_absorption = safe_div(retail_t1 - retail_t, mom.get("free_float_pct", 0.5))
        except: pass

        # 3. Tax-to-Profit Divergence (Forensic)
        financials = self.stock_data.get("financialStatement", [])
        tax_divergence = np.nan
        try:
            if financials:
                def get_f_data(titles):
                    for t in titles:
                        item = next((i for i in financials if i.get("title") == t), None)
                        if item: return item.get("quarterly", {})
                    return {}
                pbt_data = get_f_data(["Profit Before Tax", "PBT", "Operating Profit"])
                tax_data = get_f_data(["Tax", "Income Tax", "Provision for Tax"])
                qs = sorted([q for q in pbt_data.keys() if parse_quarter_date(q) <= self.ref_time], key=parse_quarter_date)
                if len(qs) >= 5:
                    t, t4 = qs[-1], qs[-5] # YoY comparison
                    pbt_growth = safe_div(clean_float(pbt_data[t]) - clean_float(pbt_data[t4]), clean_float(pbt_data[t4]))
                    tax_growth = safe_div(clean_float(tax_data.get(t)) - clean_float(tax_data.get(t4)), clean_float(tax_data.get(t4)))
                    if not np.isnan(pbt_growth) and not np.isnan(tax_growth):
                        tax_divergence = pbt_growth - tax_growth # High positive = Red Flag
        except: pass

        return {
            "volatility_squeeze_index": self.track(v_squeeze),
            "hni_absorption_score": self.track(hni_absorption),
            "tax_profit_divergence": self.track(tax_divergence),
            "qes_forensic_red_flag": self.track(1 if (tax_divergence or 0) > 0.3 else 0)
        }

    def _derive_market_breadth(self):
        date_str = self.ref_time.strftime('%d-%m-%Y')
        return {"market_breadth_50dma_pct": self.track(self.market_breadth_map.get(date_str, np.nan))}

    def _derive_relative_strength(self):
        rs_signals = {}
        for name, index_ohlcv in self.active_indices.items():
            if name == "INDIAVIX": continue
            def calc_rs(periods):
                if len(self.active_ohlcv) < periods + 1 or len(index_ohlcv) < periods + 1: return np.nan
                s_ret = safe_div(self.active_ohlcv[-1]["Close"] - self.active_ohlcv[-1-periods]["Close"], self.active_ohlcv[-1-periods]["Close"])
                i_ret = safe_div(index_ohlcv[-1]["Close"] - index_ohlcv[-1-periods]["Close"], index_ohlcv[-1-periods]["Close"])
                return safe_div(1.0 + s_ret, 1.0 + i_ret)
            rs_signals[f"rs_{name.lower()}_52w"] = self.track(calc_rs(52))
        
        # AI Metrics Additions: Beta Calculation
        benchmark_ohlcv = self.active_indices.get(self.benchmark_key, [])
        beta_val = np.nan
        if len(self.active_ohlcv) >= 53 and len(benchmark_ohlcv) >= 53:
            try:
                s_closes = [c["Close"] for c in self.active_ohlcv[-53:]]
                b_closes = [c["Close"] for c in benchmark_ohlcv[-53:]]
                s_returns = [(s_closes[i] - s_closes[i-1])/s_closes[i-1] for i in range(1, 53)]
                b_returns = [(b_closes[i] - b_closes[i-1])/b_closes[i-1] for i in range(1, 53)]
                covariance = np.cov(s_returns, b_returns)[0][1]
                variance = np.var(b_returns)
                if variance > 0:
                    beta_val = covariance / variance
            except: pass
        rs_signals["beta_vs_benchmark"] = self.track(beta_val)
        
        rs_signals["primary_benchmark"] = self.benchmark_key
        return rs_signals

    def _derive_macro_regime(self):
        nifty = self.active_indices.get("NIFTY", [])
        vix = self.active_indices.get("INDIAVIX", [])
        nifty_trend = safe_div(nifty[-1]["Close"], np.mean([c["Close"] for c in nifty[-40:]])) if len(nifty) >= 40 else np.nan
        vix_ratio = safe_div(vix[-1]["Close"], np.mean([c["Close"] for c in vix[-52:]])) if len(vix) >= 52 else np.nan
        return {
            "nifty_50_trend_ratio": self.track(nifty_trend),
            "vix_intensity_ratio": self.track(vix_ratio),
            "is_bull_regime": self.track(1 if (nifty_trend or 0) > 1.0 else 0),
            "is_high_fear_regime": self.track(1 if (vix_ratio or 0) > 1.2 else 0)
        }

    def _derive_resilience(self):
        nifty = self.active_indices.get("NIFTY", [])
        vix = self.active_indices.get("INDIAVIX", [])
        stock = self.active_ohlcv
        if len(stock) < 20 or len(nifty) < 20:
            return {
                "up_beta": np.nan, "down_beta": np.nan,
                "up_capture": np.nan, "down_capture": np.nan,
                "vix_stress_reaction": np.nan, "avg_recovery_days": np.nan
            }

        try:
            import pandas as pd
            
            # Convert to DataFrames
            df_s = pd.DataFrame(stock)
            df_s['Date'] = pd.to_datetime(df_s['Date'], format='%d-%m-%Y', errors='coerce')
            df_s.set_index('Date', inplace=True)
            df_s.sort_index(inplace=True)
            df_s = df_s.tail(756)
            
            df_n = pd.DataFrame(nifty)
            df_n['Date'] = pd.to_datetime(df_n['Date'], format='%d-%m-%Y', errors='coerce')
            df_n.set_index('Date', inplace=True)
            df_n.sort_index(inplace=True)
            df_n = df_n.tail(756)
            
            df_v = pd.DataFrame(vix)
            df_v['Date'] = pd.to_datetime(df_v['Date'], format='%d-%m-%Y', errors='coerce')
            df_v.set_index('Date', inplace=True)
            df_v.sort_index(inplace=True)
            df_v = df_v.tail(756)
            
            # Monthly Resampling for Beta & Capture Ratios
            df_m = pd.DataFrame({
                'Stock': df_s['Close'].resample('ME').last(),
                'Nifty': df_n['Close'].resample('ME').last()
            }).dropna()
            
            ret_m = df_m.pct_change().dropna()
            
            up_mask = ret_m['Nifty'] > 0
            dn_mask = ret_m['Nifty'] < 0
            
            up_s = ret_m['Stock'][up_mask]
            up_n = ret_m['Nifty'][up_mask]
            
            dn_s = ret_m['Stock'][dn_mask]
            dn_n = ret_m['Nifty'][dn_mask]
            
            def calc_beta(s, n):
                if len(s) < 2: return np.nan
                cov = np.cov(s, n)[0][1]
                var = np.var(n, ddof=1)
                return float(cov / var) if var != 0 else np.nan
                
            up_beta = calc_beta(up_s, up_n)
            down_beta = calc_beta(dn_s, dn_n)
            
            def calc_capture(s, n):
                if len(s) < 2: return np.nan
                # Annualized compounded returns formula for capture ratio
                comp_s = (np.prod(1 + s) ** (12 / len(s))) - 1.0
                comp_n = (np.prod(1 + n) ** (12 / len(n))) - 1.0
                return float(comp_s / comp_n) if comp_n != 0 else np.nan
                
            up_capture = calc_capture(up_s, up_n)
            down_capture = calc_capture(dn_s, dn_n)
            
            # VIX Stress Reaction using Daily Data
            df_d = pd.DataFrame({
                'Stock': df_s['Close'],
                'VIX': df_v['Close']
            }).dropna()
            ret_d = df_d.pct_change().dropna()
            
            if len(ret_d) > 10:
                top_spikes = ret_d.nlargest(max(1, int(len(ret_d)*0.05)), 'VIX')
                vix_reaction = float(top_spikes['Stock'].mean())
            else:
                vix_reaction = np.nan
                
            # Drawdown Recovery Days
            peak = df_s['Close'].iloc[0]
            peak_idx = df_s.index[0]
            in_drawdown = False
            trough = peak
            
            recovery_days = []
            for date, row in df_s.iterrows():
                c = row['Close']
                if c > peak:
                    if in_drawdown:
                        dd_depth = (trough - peak) / peak
                        if dd_depth <= -0.10: # >10% drawdown
                            days = (date - peak_idx).days
                            recovery_days.append(days)
                    peak = c
                    peak_idx = date
                    in_drawdown = False
                else:
                    if not in_drawdown:
                        in_drawdown = True
                        trough = c
                    else:
                        trough = min(trough, c)
                        
            avg_recovery = float(np.mean(recovery_days)) if recovery_days else np.nan
            
            return {
                "up_beta": self.track(up_beta),
                "down_beta": self.track(down_beta),
                "up_capture": self.track(up_capture),
                "down_capture": self.track(down_capture),
                "vix_stress_reaction": self.track(vix_reaction),
                "avg_recovery_days": self.track(avg_recovery)
            }
        except Exception as e:
            # Fallback on nan if something goes wrong
            return {
                "up_beta": np.nan, "down_beta": np.nan,
                "up_capture": np.nan, "down_capture": np.nan,
                "vix_stress_reaction": np.nan, "avg_recovery_days": np.nan
            }

    def _derive_meta(self):
        cap = self.stock_data.get("stats", {}).get("cappedType", "")
        return {
            "is_large_cap": self.track(1 if cap == "Large Cap" else 0),
            "is_mid_cap": self.track(1 if cap == "Mid Cap" else 0),
            "is_small_cap": self.track(1 if cap == "Small Cap" else 0),
            "industry_name": self.track(self.stock_data.get("header", {}).get("industryName", "Unknown"))
        }

    def _derive_fundamentals(self):
        stats = self.stock_data.get("stats", {})
        return {
            "pe_vs_sector_ratio": self.track(safe_div(stats.get("peRatio"), stats.get("industryPe"))),
            "pb_vs_sector_ratio": self.track(safe_div(stats.get("pbRatio"), stats.get("sectorPb"))),
            "debt_to_equity": self.track(clean_float(stats.get("debtToEquity"))),
            "return_on_equity": self.track(safe_div(stats.get("roe"), 100.0)),
            "net_profit_margin": self.track(safe_div(stats.get("netProfitMargin"), 100.0))
        }

    def _derive_efficiency(self):
        stats = self.stock_data.get("stats", {})
        pe, roe = clean_float(stats.get("peRatio")), safe_div(stats.get("roe"), 100.0)
        div_yield = safe_div(clean_float(stats.get("divYield")), 100.0)
        payout = div_yield * pe
        return {
            "equity_multiplier": self.track(safe_div(stats.get("returnOnEquity"), stats.get("returnOnAssets"))),
            "sustainable_growth_rate": self.track(roe * (1.0 - (payout if not np.isnan(payout) else 0.5)))
        }

    def _derive_growth(self):
        financials = self.stock_data.get("financialStatement", [])
        def get_q_growth(titles):
            for t in titles:
                item = next((i for i in financials if i.get("title") == t), None)
                if item:
                    data = item.get("quarterly", {})
                    qs = sorted([q for q in data.keys() if parse_quarter_date(q) <= self.ref_time], key=parse_quarter_date)
                    if len(qs) >= 5:
                        curr, prev = clean_float(data[qs[-1]]), clean_float(data[qs[-5]])
                        return safe_div(curr - prev, prev)
            return np.nan
        return {"revenue_yoy": self.track(get_q_growth(["Revenue", "Net Revenue"])), "profit_yoy": self.track(get_q_growth(["Profit", "Net Profit"]))}

    def _derive_momentum(self):
        shp = self.stock_data.get("shareHoldingPattern", {})
        try: qs = sorted([q for q in shp.keys() if isinstance(shp[q], dict) and parse_quarter_date(q) <= self.ref_time], key=parse_quarter_date)
        except: qs = []
        if len(qs) < 2: return {"institutional_accumulation_qoq": np.nan, "free_float_pct": 0.5, "promoter_pledge_delta": np.nan}
        t, t1 = qs[-1], qs[-2]
        def get_inst(q): return get_nested(shp[q], "mutualFunds.percent", 0.0) + get_nested(shp[q], "foreignInstitutions.percent", 0.0) + get_nested(shp[q], "otherDomesticInstitutions.percent", 0.0)
        inst_t, inst_t1 = get_inst(t), get_inst(t1)
        pledge_t, pledge_t1 = get_nested(shp[t], "promoters.pledgedPercent", 0.0), get_nested(shp[t1], "promoters.pledgedPercent", 0.0)
        prom_total = get_nested(shp[t], "promoters.total", 0.0)
        if prom_total == 0.0: prom_total = get_nested(shp[t], "promoters.individual.percent", 0.0) + get_nested(shp[t], "promoters.corporate.percent", 0.0)
        return {
            "institutional_accumulation_qoq": self.track(inst_t - inst_t1),
            "free_float_pct": self.track(safe_div(100.0 - prom_total, 100.0)),
            "promoter_pledge_delta": self.track(pledge_t - pledge_t1)
        }

    def _derive_technicals(self):
        if not self.active_ohlcv: return {}
        closes = [c["Close"] for c in self.active_ohlcv]
        sma50 = np.mean(closes[-50:]) if len(closes) >= 50 else np.nan
        vol_intensity = safe_div(self.active_ohlcv[-1]["Volume"], np.mean([c["Volume"] for c in self.active_ohlcv[-52:]])) if len(self.active_ohlcv) >= 52 else 1.0
        volatility = np.std([safe_log(safe_div(closes[i], closes[i-1])) for i in range(len(closes)-13, len(closes))]) if len(closes) >= 14 else np.nan
        
        tech = self.raw.get("stocksTechnicalsData")
        if not isinstance(tech, dict): tech = {}
        
        # AI Metrics Additions
        bb_upper = bb_lower = macd_hist = atr_14 = np.nan
        if len(closes) >= 20:
            sma20 = np.mean(closes[-20:])
            std20 = np.std(closes[-20:])
            bb_upper = sma20 + (2 * std20)
            bb_lower = sma20 - (2 * std20)
        
        if len(closes) >= 26:
            ema12 = np.mean(closes[-12:])
            ema26 = np.mean(closes[-26:])
            macd_hist = ema12 - ema26
            
        if len(self.active_ohlcv) >= 14:
            trs = []
            for i in range(len(self.active_ohlcv)-14, len(self.active_ohlcv)):
                c = self.active_ohlcv[i]
                pc = self.active_ohlcv[i-1]["Close"]
                tr = max(c["High"] - c["Low"], abs(c["High"] - pc), abs(c["Low"] - pc))
                trs.append(tr)
            atr_14 = np.mean(trs)
        
        return {
            "rsi_normalized": self.track(safe_div(clean_float(tech.get("rsi14", 50)), 100.0)),
            "distance_from_sma50": self.track(safe_div(self.live_price - sma50, sma50)),
            "volume_intensity_52w": self.track(vol_intensity),
            "volatility_13w": self.track(volatility),
            "bollinger_upper": self.track(bb_upper),
            "bollinger_lower": self.track(bb_lower),
            "macd_histogram": self.track(macd_hist),
            "atr_14": self.track(atr_14)
        }

    def _derive_news(self):
        # We now use the batched Trendlyne fetcher for high quality news instead of Groww's SEO pages
        ticker = extract_ticker(self.stock_data.get("header", {}))
        news = TrendlyneFetcher().get_news(ticker) if ticker else []
        
        flags = {
            "active_debt_crisis_flag": self.track(1 if any(any(k in str(n).lower() for k in ['debt','default','crisis']) for n in news) else 0),
            "active_regulatory_flag": self.track(1 if any(any(k in str(n).lower() for k in ['sebi','fine','probe','regulatory']) for n in news) else 0)
        }
        
        # NLP Sentiment Processing
        timeline = {}
        total_compound = 0.0
        news_count = 0
        raw_feed = []
        
        from datetime import timedelta, datetime
        now_time = datetime.now()
        
        # Initialize last 14 days timeline
        for i in range(13, -1, -1):
            d = (now_time - timedelta(days=i)).strftime('%b %d')
            timeline[d] = {"count": 0, "sum_sentiment": 0.0}
            
        for n in news:
            if not isinstance(n, dict): continue
            pub_date_str = n.get("pubDate")
            if not pub_date_str: continue
            
            try:
                # Handle dates like '2026-06-19T14:58:04'
                # fallback for missing tz
                clean_date_str = str(pub_date_str).replace('Z', '')
                pub_date = datetime.fromisoformat(clean_date_str)
                
                diff_days = (now_time.date() - pub_date.date()).days
                if 0 <= diff_days <= 13:
                    title = n.get('title', '')
                    summary = n.get('summary', '')
                    text = f"{title} {summary}"
                    if not text.strip(): continue
                    
                    score = sia.polarity_scores(text)['compound']
                    d_str = pub_date.strftime('%b %d')
                    if d_str in timeline:
                        timeline[d_str]["count"] += 1
                        timeline[d_str]["sum_sentiment"] += score
                    
                    total_compound += score
                    news_count += 1
                    
                    # Infer Tag
                    text_lower = text.lower()
                    if any(w in text_lower for w in ['earnings', 'profit', 'revenue', 'q1', 'q2', 'q3', 'q4', 'fy']): tag = 'Earnings'
                    elif any(w in text_lower for w in ['sebi', 'rbi', 'fines', 'probe', 'regulatory', 'court']): tag = 'Regulatory'
                    elif any(w in text_lower for w in ['order', 'contract', 'deal', 'partnership']): tag = 'Order Win'
                    elif any(w in text_lower for w in ['acquire', 'merger', 'buyout', 'stake']): tag = 'M&A'
                    elif any(w in text_lower for w in ['debt', 'default', 'downgrade']): tag = 'Credit Risk'
                    else: tag = 'General'
                    
                    raw_feed.append({
                        "date": d_str,
                        "title": title,
                        "score": score,
                        "tag": tag,
                        "timestamp": pub_date.isoformat()
                    })
            except: pass
            
        sentiment_timeline = []
        for d, stats in timeline.items():
            avg_sent = stats["sum_sentiment"] / stats["count"] if stats["count"] > 0 else 0
            # Velocity is an intensity metric combining volume and sentiment absolute magnitude
            velocity = (stats["count"] * 10) + (abs(avg_sent) * 20)
            sentiment_timeline.append({
                "name": d,
                "Sentiment": avg_sent,
                "Volume": stats["count"],
                "Velocity": velocity
            })
            
        flags["ewma_sentiment_all"] = self.track(total_compound / news_count if news_count > 0 else 0)
        flags["news_intensity_velocity"] = self.track(news_count / 14.0)
        flags["sentiment_timeline"] = sentiment_timeline
        flags["raw_feed"] = raw_feed
        
        return flags

    def _derive_liquidity(self):
        stats = self.stock_data.get("stats", {})
        return {"price_to_ocf": self.track(clean_float(stats.get("priceToOcf"))), "ev_to_ebitda": self.track(clean_float(stats.get("evToEbitda")))}

    def _derive_sector_premiums(self):
        stats = self.stock_data.get("stats", {})
        return {"roe_vs_sector_premium": self.track(clean_float(stats.get("roe")) - clean_float(stats.get("sectorRoe")))}

    def _derive_scaling(self):
        return {"log_market_cap": self.track(safe_log(clean_float(self.stock_data.get("stats", {}).get("marketCap"))))}

    def _derive_history(self):
        if len(self.active_ohlcv) < 53: return [[0.0, 0.0, 0.0]] * 52
        matrix = []
        for i in range(len(self.active_ohlcv)-52, len(self.active_ohlcv)):
            curr, prev = self.active_ohlcv[i], self.active_ohlcv[i-1]
            matrix.append([safe_log(safe_div(curr["Close"], prev["Close"])), safe_div(curr["High"]-curr["Low"], curr["Close"]), safe_div(curr["Open"]-prev["Close"], prev["Close"])])
        return matrix

    def _derive_health_scores(self):
        stats = self.stock_data.get("stats", {})
        financials = self.stock_data.get("financialStatement", [])
        
        # AI Metrics Additions: Graham Number & Altman Z Proxy
        eps = clean_float(stats.get("epsTtm"))
        bvps = clean_float(stats.get("bookValue"))
        graham_num = np.nan
        if not np.isnan(eps) and eps > 0 and not np.isnan(bvps) and bvps > 0:
            graham_num = math.sqrt(22.5 * eps * bvps)
            
        roe = safe_div(stats.get("roe"), 100.0)
        altman_proxy = np.nan
        debt_to_eq = clean_float(stats.get("debtToEquity"))
        if not np.isnan(roe) and not np.isnan(debt_to_eq):
            altman_proxy = (roe * 3.0) - (debt_to_eq * 1.5) + 1.0

        # --- PIOTROSki F-SCORE ---
        def get_yearly(title):
            item = next((i for i in financials if i.get("title") == title), None)
            if not item or "yearly" not in item: return None, None
            yearly = item["yearly"]
            years = sorted(yearly.keys())
            if len(years) >= 2: return yearly[years[-1]], yearly[years[-2]]
            elif len(years) == 1: return yearly[years[-1]], None
            return None, None

        f_score = 0
        roa = clean_float(stats.get("returnOnAssets"))
        if not np.isnan(roa) and roa > 0: f_score += 1
            
        price_to_ocf = clean_float(stats.get("priceToOcf"))
        if not np.isnan(price_to_ocf) and price_to_ocf > 0: f_score += 1
            
        p_cy, p_py = get_yearly("Profit")
        nw_cy, nw_py = get_yearly("Net Worth")
        rev_cy, rev_py = get_yearly("Revenue")
        
        if p_cy is not None and p_py is not None and nw_cy and nw_py:
            if (p_cy / nw_cy) > (p_py / nw_py): f_score += 1
                
        pe = clean_float(stats.get("peRatio"))
        if not np.isnan(price_to_ocf) and price_to_ocf > 0 and not np.isnan(pe) and pe > 0:
            if (1.0 / price_to_ocf) > (1.0 / pe): f_score += 1
                
        de = clean_float(stats.get("debtToEquity"))
        if not np.isnan(de) and de < 0.5: f_score += 1
            
        cr = clean_float(stats.get("currentRatio"))
        if not np.isnan(cr) and cr > 1.5: f_score += 1
            
        mcap = clean_float(stats.get("marketCap"))
        dy = clean_float(stats.get("divYield"))
        if not np.isnan(mcap) and nw_cy is not None and nw_py is not None and p_cy is not None:
            div_paid = mcap * (dy / 100.0) if not np.isnan(dy) else 0
            if ((nw_cy - nw_py) - p_cy + div_paid) <= (0.05 * abs(nw_py)): f_score += 1
                
        if p_cy is not None and p_py is not None and rev_cy and rev_py:
            if (p_cy / rev_cy) > (p_py / rev_py): f_score += 1
                
        if rev_cy is not None and rev_py is not None:
            if rev_cy > rev_py: f_score += 1
            
        return {
            "piotroski_f_score": self.track(f_score),
            "graham_number_value": self.track(graham_num),
            "altman_z_proxy": self.track(altman_proxy)
        }

# --- UNIFIED PROCESSING ---
class TrendlyneFetcher:
    def __init__(self, session=None):
        self.session = session or requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
    def get_news(self, ticker):
        """Resolves the Trendlyne ID and fetches the latest news."""
        try:
            # 1. Resolve ID via Redirect
            redirect_url = f"https://trendlyne.com/research-reports/stock/{ticker}"
            res1 = self.session.head(redirect_url, allow_redirects=True, timeout=10)
            final_url = res1.url
            
            # Example final_url: https://trendlyne.com/research-reports/stock/1127/RELIANCE/reliance-industries-ltd/
            match = re.search(r'/stock/(\d+)/([^/]+)/([^/]+)/', final_url)
            if not match:
                return []
                
            stock_id = match.group(1)
            canonical_slug = match.group(3)
            
            # 2. Fetch Latest News
            news_url = f"https://trendlyne.com/latest-news/{stock_id}/{ticker}/{canonical_slug}/"
            res2 = self.session.get(news_url, timeout=10)
            soup = BeautifulSoup(res2.text, 'html.parser')
            
            # 3. Parse News
            news = []
            for a in soup.find_all('a', class_='newslink'):
                title_text = re.sub(r'\s+', ' ', a.text).strip()
                # Filter out metadata lines
                if len(title_text) > 20 and 'Trendlyne' not in title_text and '|' not in title_text:
                    # Parse the date from the parent card if possible
                    card = a.find_parent('div', class_='post-body')
                    date_str = datetime.now().isoformat() + "Z" # default
                    if card:
                        # Try to find date in the card
                        date_span = card.find('span', attrs={'data-toggle': 'tooltip', 'title': True})
                        if date_span and date_span.get('title'):
                            try:
                                # format: "4 Jul, 2026 at 03:49 PM"
                                raw_title = date_span['title']
                                dt = datetime.strptime(raw_title, "%d %b, %Y at %I:%M %p")
                                date_str = dt.isoformat() + "Z"
                            except: pass
                            
                    news.append({
                        'title': title_text,
                        'summary': '',
                        'pubDate': date_str
                    })
            
            # Deduplicate by title
            seen = set()
            unique_news = []
            for n in news:
                if n['title'] not in seen:
                    seen.add(n['title'])
                    unique_news.append(n)
            
            return unique_news
        except Exception as e:
            print(f"Trendlyne News Error for {ticker}: {e}")
            return []
            
    def get_broker_targets(self, ticker):
        """Fetches institutional targets directly from Trendlyne."""
        result = []
        if not ticker: return result
        try:
            search_query = ticker.split('-')[0].split('_')[0]
            mc_link = f"https://trendlyne.com/research-reports/stock/{search_query}"
            
            page_res = None
            import random
            for attempt in range(3):
                with _TRENDLYNE_SEMAPHORE:
                    time.sleep(random.uniform(0.5, 1.5)) # Prevent burst requests
                    try:
                        page_res = self.session.get(mc_link, timeout=10)
                        if page_res.status_code == 200:
                            break
                        elif page_res.status_code in [403, 429]:
                            time.sleep(2 * (attempt + 1)) # Backoff on rate limit
                    except Exception as e:
                        if attempt == 2: raise e
                        time.sleep(2 * (attempt + 1))
                        
            if not page_res or page_res.status_code != 200: return result
                
            soup = BeautifulSoup(page_res.text, 'html.parser')
            table = soup.find('table')
            if not table: return result
                
            rows = table.find_all('tr')
            for r in rows[2:11]:
                cells = r.find_all('td')
                if len(cells) > 8:
                    date_str = cells[1].text.strip()
                    
                    author_cell = cells[3]
                    broker_a = author_cell.find('a')
                    broker = broker_a.text.strip() if broker_a else author_cell.text.replace('\n', '').replace('Target', '').replace('Reco', '').strip()
                    
                    signals = []
                    labels = author_cell.find_all('label')
                    for label in labels:
                        txt = label.text.strip().lower()
                        i_tag = label.find('i')
                        if not i_tag: continue
                        alt_text = i_tag.get('alt', '').lower()
                        signal_type = 'target' if 'target' in txt else 'reco' if 'reco' in txt else None
                        direction = 'up' if 'up' in alt_text else 'down' if 'down' in alt_text else None
                        if signal_type and direction:
                            signals.append({"type": signal_type, "direction": direction})

                    target_price_str = cells[5].text.strip()
                    upside_str = cells[7].text.strip().lower()
                    is_target_met = 'target met' in upside_str
                    action_str = cells[8].text.strip()
                    
                    target_price_clean = target_price_str.replace('Target', '').replace(',', '').strip()
                    
                    action = 'HOLD'
                    if 'buy' in action_str.lower() or 'accumulate' in action_str.lower() or 'add' in action_str.lower(): action = 'BUY'
                    elif 'sell' in action_str.lower() or 'reduce' in action_str.lower(): action = 'SELL'
                        
                    if date_str and broker and target_price_clean and target_price_clean != '-':
                        try:
                            tp = float(target_price_clean)
                            price_at_reco_str = cells[6].text.split('(')[0].replace(',', '').strip()
                            price_at_reco = float(price_at_reco_str) if price_at_reco_str and price_at_reco_str != '-' else None
                            result.append({
                                'date': date_str,
                                'broker': broker,
                                'action': action,
                                'target_price': tp,
                                'price_at_reco': price_at_reco,
                                'is_target_met': is_target_met,
                                'signals': signals
                            })
                        except ValueError: continue
            return result
        except Exception as e:
            print(f"Trendlyne Targets Error for {ticker}: {e}")
            return result

class GrowwFetcher:
    def __init__(self, session=None):
        self.session = session or requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })

    def get_stock_data(self, slug):
        """Unified fetch for all metadata with exponential backoff for 429s."""
        KNOWN_INDICES = ["nifty", "india-vix", "sp-bse-sensex", "nifty-smallcap-100", "nifty-midcap", "nifty-total-market-index", "nifty-metal", "nifty-it", "nifty-bank", "nifty-next", "nifty-midcap-150", "nifty-pharma", "nifty-218500", "nifty-auto", "nifty-financial-services", "nifty-realty", "nifty-psu-bank", "nifty-fmcg", "nifty-pvt-bank"]
        if slug in KNOWN_INDICES:
            path_type = "indices"
            url = f"https://groww.in/indices/{slug}"
        else:
            path_type = "etfs" if "etf" in slug.lower() else "stocks"
            url = f"https://groww.in/{path_type}/{slug}{'/technicals' if path_type == 'stocks' else ''}"
        
        max_retries = 3
        backoff = 2
        
        for attempt in range(max_retries):
            try:
                resp = self.session.get(url, timeout=10)
                if resp.status_code == 429:
                    wait = backoff ** (attempt + 1) + np.random.uniform(0, 1)
                    time.sleep(wait)
                    continue
                    
                if resp.status_code != 200: 
                    if resp.status_code != 404:
                        print(f"HTTP Error {resp.status_code} for {slug}")
                    return None
                
                # Extract JSON
                match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', resp.text, re.DOTALL)
                if not match: 
                    print(f"Regex failure for {slug}")
                    return None
                
                full_json = json.loads(match.group(1))
                page_props = full_json.get("props", {}).get("pageProps", {})
                
                if slug in KNOWN_INDICES:
                    stock_data = page_props.get("indexData", {})
                    if not stock_data: return None
                    header = stock_data.get("header", {})
                    script_code = header.get("nseScriptCode") or header.get("bseScriptCode")
                    live_price_data = page_props.get("livePriceData", {}).get(str(script_code), {})
                    html_price = str(live_price_data.get("ltp", ""))
                    day_change = live_price_data.get("dayChange")
                    day_change_perc = live_price_data.get("dayChangePerc")
                    html_change = f"{day_change} ({day_change_perc}%)" if day_change is not None and str(day_change) != "" else ""
                else:
                    stock_data = page_props.get("stockData") or page_props.get("etfData", {})
                    if not stock_data: return None
                    
                    # Extract Live Price & Change from HTML directly as fallback/enhancement
                    price_match = re.search(r"<span[^>]*tickerUi_livePrice[^>]*>(.*?)</span>", resp.text)
                    change_match = re.search(r"<span[^>]*tickerUi_dayChange[^>]*>(.*?)</span>", resp.text)
                    html_price = price_match.group(1).strip() if price_match else None
                    html_change = change_match.group(1).strip() if change_match else None
                
                return {
                    "raw_next_data": page_props,
                    "html_price": html_price,
                    "html_change": html_change
                }
            except Exception as e:
                if attempt == max_retries - 1: return None
                time.sleep(backoff ** (attempt + 1))
        return None

    def get_ohlcv(self, ticker, exchange="NSE"):
        if not ticker: return None
        end_ts = int(time.time() * 1000)
        # Using 5 years of history to be safe for daily candles (1440 minutes)
        start_ts = end_ts - (5 * 365 * 24 * 60 * 60 * 1000)
        url = f"https://groww.in/v1/api/charting_service/v2/chart/delayed/exchange/{exchange}/segment/CASH/{ticker}?endTimeInMillis={end_ts}&intervalInMinutes=1440&startTimeInMillis={start_ts}"
        try:
            resp = self.session.get(url, timeout=10)
            if resp.status_code != 200: return None
            data = resp.json()
            candles = data.get("candles", [])
            return candles
        except: return None

# --- UNIFIED PROCESSING ---

def extract_ticker(header):
    """Priority: Alphabetic > Numeric fallback."""
    keys = ["nseSymbol", "bseTradingSymbol", "symbol", "nseScriptCode", "bseSymbol", "bseScriptCode", "bseScriptCode"]
    # Pass 1: Alphabetic
    for k in keys:
        val = header.get(k)
        # if val == ""
        if val and not str(val).isdigit(): return str(val).strip()
    # Pass 2: Numeric
    for k in keys:
        val = header.get(k)
        if val: return str(val).strip()
    return None

def process_stock_unified(slug, fetcher, index_map, market_breadth_map, args):
    try:
        # 1. Single Network Call for Metadata
        raw = fetcher.get_stock_data(slug)
        if not raw: return False
        
        page_props = raw["raw_next_data"]
        KNOWN_INDICES = ["nifty", "india-vix", "sp-bse-sensex", "nifty-smallcap-100", "nifty-midcap", "nifty-total-market-index", "nifty-metal", "nifty-it", "nifty-bank", "nifty-next", "nifty-midcap-150", "nifty-pharma", "nifty-218500", "nifty-auto", "nifty-financial-services", "nifty-realty", "nifty-psu-bank", "nifty-fmcg", "nifty-pvt-bank"]
        if slug in KNOWN_INDICES:
            stock_data = page_props.get("indexData", {})
        else:
            stock_data = page_props.get("stockData") or page_props.get("etfData", {})
            
        header = stock_data.get("header", {})
        
        # 2. Extract Ticker
        ticker = extract_ticker(header)
        
        # 3. Single Network Call for OHLCV
        candles = fetcher.get_ohlcv(ticker, "NSE")
        if not candles: candles = fetcher.get_ohlcv(ticker, "BSE")
        # Try fallbacks if ticker looks alphabetic but failed on NSE
        if not candles and ticker and not ticker.isdigit():
             # Try BSE with numeric code if available
             bse_code = header.get("bseScriptCode") or header.get("bseSymbol")
             if bse_code and str(bse_code).isdigit():
                 candles = fetcher.get_ohlcv(bse_code, "BSE")
        
        # --- A. ABSOLUTE DATASET LOGIC ---
        abs_data = {
            "live price": raw["html_price"],
            "day change": raw["html_change"],
            "ticker": ticker,
            "displayName": header.get("displayName"),
            "marketCap": stock_data.get("stats", {}).get("marketCap"),
            "shareHoldingPattern": stock_data.get("shareHoldingPattern"),
            "financialStatement": stock_data.get("financialStatement"),
            "header_raw": header,
            "OHLCV": []
        }
        
        # Merge stats and fundamentals into abs_data
        stats = stock_data.get("stats", {})
        for k, v in stats.items():
            if k not in abs_data: abs_data[k] = v
            
        abs_data["technicals"] = page_props.get("stocksTechnicalsData", {})
            
        # Format OHLCV for Absolute
        ohlcv_converted = []
        for c in (candles or []):
            try:
                # Handle both [ms, o, h, l, c, v] and processed [s, o, h, l, c, v]
                ts = float(c[0])
                if ts > 10**11: ts = ts / 1000.0
                
                ohlcv_converted.append({
                    "Timestamp": ts, "Open": float(c[1]), "High": float(c[2]), "Low": float(c[3]), "Close": float(c[4]), "Volume": float(c[5]) if c[5] is not None else 0.0,
                    "Date": datetime.fromtimestamp(ts).strftime('%d-%m-%Y')
                })
            except: continue
            
        abs_data["OHLCV"] = [{"Date": x["Date"], "Open": x["Open"], "High": x["High"], "Low": x["Low"], "Close": x["Close"], "Volume": x["Volume"]} for x in ohlcv_converted]

        # No broker ledger processing inline anymore; UI scrapes on the fly

        # --- B. RELATIVE DATASET LOGIC ---
        rel_engineer = MLDatasetEngineer(
            {"raw_next_data": page_props, "live_price": clean_float(raw["html_price"])}, 
            ohlcv_converted, 
            index_map=index_map, 
            market_breadth_map=market_breadth_map
        )
        rel_data = rel_engineer.derive_all()
        
        # 4. Atomic Write
        abs_path = os.path.join(args.target, "absolute_dataset", f"{slug}.json")
        rel_path = os.path.join(args.target, "relative_dataset", f"{slug}.json")
        
        with open(abs_path, 'w') as f: json.dump(abs_data, f, indent=4)
        with open(rel_path, 'w') as f: json.dump(sanitize_nan(rel_data), f, indent=4)
        
        return True
    except Exception as e:
        import traceback
        print(f"Error processing {slug}: {str(e)}")
        # Print full traceback on unexpected errors
        traceback.print_exc()
        time.sleep(1) # Backoff on failure
        return False

def get_fast_market_breadth(active_buffer_path):
    """Optimized: Calculate from existing Parquet instead of 6000 JSONs."""
    breadth_map = {}
    if not active_buffer_path or not os.path.exists(active_buffer_path): return {}
    try:
        con = duckdb.connect(":memory:")
        # Read absolute_data to calculate historical breadth
        data = con.execute(f"SELECT absolute_data FROM '{active_buffer_path}'").fetchall()
        
        breadth_counts = {}
        for row in data:
            try:
                abs_json = json.loads(row[0])
                ohlcv = abs_json.get("OHLCV", [])
                if len(ohlcv) < 52: continue
                closes = [c["Close"] for c in ohlcv]
                for i in range(50, len(ohlcv)):
                    sma50 = sum(closes[i-50:i]) / 50.0
                    dt = ohlcv[i]["Date"]
                    if dt not in breadth_counts: breadth_counts[dt] = [0, 0]
                    breadth_counts[dt][0] += (1 if closes[i] > sma50 else 0)
                    breadth_counts[dt][1] += 1
            except: continue
        
        for dt, counts in breadth_counts.items():
            breadth_map[dt] = counts[0] / counts[1] if counts[1] > 0 else 0.5
    except: pass
    return breadth_map

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--slugs", default="stock_slugs.txt")
    parser.add_argument("--workers", type=int, default=64)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    os.makedirs(os.path.join(args.target, "absolute_dataset"), exist_ok=True)
    os.makedirs(os.path.join(args.target, "relative_dataset"), exist_ok=True)

    if not os.path.exists(args.slugs): return
    with open(args.slugs, 'r') as f: slugs = [l.strip() for l in f if l.strip()]
    if args.limit: slugs = slugs[:args.limit]

    fetcher = GrowwFetcher()
    
    active_parquet = os.path.realpath("datasets/active/market_data.parquet")
    print(f"Warming Market Breadth from {active_parquet}...")
    breadth_map = get_fast_market_breadth(active_parquet)
    
    index_map = {}
    for t in ["NIFTY", "INDIAVIX", "NIFTYSMALLCAP250", "NIFTYMIDCAP150"]:
        c = fetcher.get_ohlcv(t, "NSE")
        if c:
            index_map[t] = []
            for x in c:
                ts = x[0]/1000 if x[0]>10**11 else x[0]
                index_map[t].append({"Timestamp": ts, "Date": datetime.fromtimestamp(ts).strftime('%d-%m-%Y'), "Close": x[4]})

    print(f"Starting Unified Update with {args.workers} workers...")
    success = 0
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(process_stock_unified, s, fetcher, index_map, breadth_map, args): s for s in slugs}
        for f in tqdm(as_completed(futures), total=len(slugs)):
            if f.result(): success += 1

    print(f"Unified Ingestion Complete. Success: {success}/{len(slugs)}")

if __name__ == "__main__":
    main()
