import os
import re
import json
import time
import math
import argparse
import requests
import nltk
import numpy as np
from datetime import datetime
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed
from nltk.sentiment.vader import SentimentIntensityAnalyzer

# Global SIA instance to avoid repeated instantiation overhead
sia = SentimentIntensityAnalyzer()
sia.lexicon.update({
    'crushed': -0.7, 'bankruptcy': -0.9, 'default': -0.9,
    'surge': 0.6, 'growth': 0.4, 'profitable': 0.5,
    'slashed': -0.4, 'downgraded': -0.6, 'upgraded': 0.6
})

# --- UTILITIES ---

def clean_float(val):
    if val is None or val == '-':
        return np.nan
    try:
        clean_str = re.sub(r'[₹%, \s]', '', str(val))
        if not clean_str or clean_str == '-':
            return np.nan
        return float(clean_str)
    except (ValueError, TypeError):
        return np.nan

def safe_div(n, d):
    try:
        if n is None or d is None:
            return np.nan
        n_f, d_f = float(n), float(d)
        if d_f == 0 or np.isnan(n_f) or np.isnan(d_f):
            return np.nan
        return n_f / d_f
    except (ValueError, TypeError):
        return np.nan

def safe_log(val):
    """Safely calculate natural log, handling val <= 0."""
    try:
        if val is None or np.isnan(val) or val <= 0:
            return np.nan
        return math.log(val)
    except (ValueError, TypeError):
        return np.nan

def get_nested(data, path, default=np.nan):
    """Get nested dictionary value using dot notation."""
    keys = path.split('.')
    for key in keys:
        if isinstance(data, dict):
            data = data.get(key)
        else:
            return default
    return data if data is not None else default

def parse_quarter_date(q_str):
    """Parses 'Mar '25' into a datetime object for chronological sorting."""
    try:
        m, y = q_str.split(" '")
        months = {"Jan":1, "Feb":2, "Mar":3, "Apr":4, "May":5, "Jun":6, 
                  "Jul":7, "Aug":8, "Sep":9, "Oct":10, "Nov":11, "Dec":12}
        return datetime(2000 + int(y), months[m], 1)
    except:
        return datetime(1900, 1, 1)

# --- ACQUISITION ---

class GrowwFetcher:
    def __init__(self, session=None):
        self.session = session or requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })

    def get_technicals(self, slug, retries=3):
        path_type = "etfs" if "etf" in slug.lower() else "stocks"
        url = f"https://groww.in/{path_type}/{slug}/technicals"
        for i in range(retries):
            try:
                response = self.session.get(url, timeout=15)
                if response.status_code == 429:
                    time.sleep(2 ** i)
                    continue
                response.raise_for_status()
                
                # Extract __NEXT_DATA__
                match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', response.text, re.DOTALL)
                if not match:
                    return None
                    
                full_json = json.loads(match.group(1))
                page_props = full_json.get("props", {}).get("pageProps", {})
                stock_data = page_props.get("stockData", {})
                
                header = stock_data.get("header", {})

                # Refined extraction: Exhaustively search for alphabetic symbols before settling for numeric
                ticker_keys = ["nseSymbol", "nseScriptCode", "bseTradingSymbol", "symbol", "bseSymbol", "bseScriptCode"]
                ticker = None

                # Pass 1: Try for alphabetic
                for key in ticker_keys:
                    val = header.get(key)
                    if val and not str(val).isdigit():
                        ticker = str(val).strip()
                        break

                # Pass 2: Fallback for everything else
                if not ticker:
                    for key in ticker_keys:
                        val = header.get(key)
                        if val:
                            ticker = str(val).strip()
                            break

                extracted = {
                    "raw_next_data": page_props,
                    "ticker": ticker,
                    "live_price": clean_float(re.search(r"<span[^>]*tickerUi_livePrice[^>]*>(.*?)</span>", response.text).group(1)) if re.search(r"<span[^>]*tickerUi_livePrice[^>]*>(.*?)</span>", response.text) else 0.0
                }
                return extracted
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
                data = response.json()
                candles = data.get("candles", [])
                if not candles:
                    return None
                
                ohlcv = []
                for c in candles:
                    if len(c) >= 6:
                        ts = c[0]
                        if ts > 10**11: # Milliseconds
                            ts = ts / 1000.0
                        
                        ohlcv.append({
                            "Timestamp": float(ts),
                            "Open": c[1],
                            "High": c[2],
                            "Low": c[3],
                            "Close": c[4],
                            "Volume": c[5]
                        })
                return ohlcv
            except Exception:
                if i < retries - 1:
                    time.sleep(1)
                continue
        return None


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
            if ref_idx < 0:
                self.ref_idx = len(self.ohlcv) + ref_idx
            else:
                self.ref_idx = ref_idx
            self.ref_idx = max(0, min(self.ref_idx, len(self.ohlcv) - 1))
            self.active_ohlcv = self.ohlcv[:self.ref_idx + 1]
            self.ref_time = datetime.fromtimestamp(self.ohlcv[self.ref_idx]["Timestamp"])

        self.cap_type = self.stock_data.get("stats", {}).get("cappedType", "Small Cap")
        if self.cap_type == "Large Cap":
            self.benchmark_key = "NIFTY"
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
        
        # New Requested Features
        self.features["risk_and_forensic_signals"] = self._derive_risk_and_forensics()
        self.features["market_breadth_regime"] = self._derive_market_breadth()
        
        self.features["target_labels"] = self._derive_forward_targets(present_price)
        self.features["data_integrity"] = 1.0 - safe_div(self.fallback_count, self.total_expected_features)
        return self.features

    def _derive_risk_and_forensics(self):
        # 1. Circuit Risk Index: combines low volatility, high volume, and high delivery
        tech = self._derive_technicals()
        volatility = tech.get("volatility_13w", 0.1)
        vol_intensity = tech.get("volume_intensity_52w", 1.0)
        
        delivery_pct = np.nan
        vol_stats = self.raw.get("stocksVolumeStatsData", {}).get("data", [])
        if vol_stats:
            latest = vol_stats[0]
            total = latest.get("totalVolume", 0)
            delivery = latest.get("deliveryVolume", 0)
            if total and total > 0:
                delivery_pct = (delivery / total) * 100.0
        
        circuit_risk = np.nan
        if not np.isnan(volatility) and not np.isnan(delivery_pct):
            # Formula: (Volume Intensity * Delivery %) / Volatility (Higher is more risk)
            circuit_risk = safe_div(vol_intensity * delivery_pct, volatility + 0.001)

        # 2. HNI Absorption Score: retail liquidation vs free float
        mom = self._derive_momentum()
        shp = self.stock_data.get("shareHoldingPattern", {})
        hni_absorption = np.nan
        try:
            quarters = sorted([q for q in shp.keys() if isinstance(shp[q], dict) and parse_quarter_date(q) <= self.ref_time], key=parse_quarter_date)
            if len(quarters) >= 2:
                t = quarters[-1]
                t_1 = quarters[-2]
                retail_t = get_nested(shp[t], "retailAndOthers.percent", 0.0)
                retail_t1 = get_nested(shp[t_1], "retailAndOthers.percent", 0.0)
                retail_liquidation = retail_t1 - retail_t # Positive if retail is dumping
                free_float = mom.get("free_float_pct", 0.5)
                hni_absorption = safe_div(retail_liquidation, free_float)
        except:
            pass

        # 3. Forensic Red Flags (QES): high profit growth but negative operating cash flow
        growth = self._derive_growth()
        liq = self._derive_liquidity()
        profit_growth = growth.get("profit_yoy", 0.0)
        price_to_ocf = liq.get("price_to_ocf", np.nan)
        
        qes_red_flag = 0
        if profit_growth > 0.20 and not np.isnan(price_to_ocf) and price_to_ocf < 0:
            qes_red_flag = 1
        elif np.isnan(price_to_ocf) or np.isnan(profit_growth):
            qes_red_flag = np.nan

        return {
            "circuit_risk_index": self.track(circuit_risk),
            "hni_absorption_score": self.track(hni_absorption),
            "qes_forensic_red_flag": self.track(qes_red_flag)
        }

    def _derive_market_breadth(self):
        # Percent of entire market above their 50-day moving average
        date_str = self.ref_time.strftime('%d-%m-%Y')
        breadth_pct = self.market_breadth_map.get(date_str, np.nan)
        return {
            "market_breadth_50dma_pct": self.track(breadth_pct)
        }

    def _derive_forward_targets(self, present_price=None):
        if not self.ohlcv or self.ref_idx >= len(self.ohlcv):
            return {"forward_4w_8pct": np.nan, "forward_3m_12pct": np.nan, "forward_1y_25pct": np.nan, "forward_3y_70pct": np.nan}
            
        base_close = clean_float(self.ohlcv[self.ref_idx].get("Close"))
        if base_close <= 0 or np.isnan(base_close):
            return {"forward_4w_8pct": np.nan, "forward_3m_12pct": np.nan, "forward_1y_25pct": np.nan, "forward_3y_70pct": np.nan}

        def get_forward_label(offset, threshold):
            if present_price is not None:
                ret = safe_div(present_price - base_close, base_close)
                return 1 if ret >= threshold else 0
            else:
                target_idx = self.ref_idx + offset
                if target_idx < len(self.ohlcv):
                    fwd_close = clean_float(self.ohlcv[target_idx].get("Close"))
                    if fwd_close is None or np.isnan(fwd_close) or fwd_close <= 0: return np.nan
                    ret = safe_div(fwd_close - base_close, base_close)
                    return 1 if ret >= threshold else 0
                return np.nan

        return {
            "forward_4w_8pct": get_forward_label(4, 0.08),
            "forward_3m_12pct": get_forward_label(13, 0.12),
            "forward_1y_25pct": get_forward_label(52, 0.25),
            "forward_3y_70pct": get_forward_label(156, 0.70)
        }

    def _derive_relative_strength(self):
        rs_signals = {}
        for name, index_ohlcv in self.active_indices.items():
            if name == "INDIAVIX": continue
            def calc_rs(periods):
                if len(self.active_ohlcv) < periods + 1 or len(index_ohlcv) < periods + 1: return np.nan
                stock_start = self.active_ohlcv[-1 - periods]["Close"]
                stock_end = self.active_ohlcv[-1]["Close"]
                index_start = index_ohlcv[-1 - periods]["Close"]
                index_end = index_ohlcv[-1]["Close"]
                return safe_div(1.0 + safe_div(stock_end - stock_start, stock_start), 1.0 + safe_div(index_end - index_start, index_start))
            rs_signals[f"rs_{name.lower()}_4w"] = self.track(calc_rs(4))
            rs_signals[f"rs_{name.lower()}_13w"] = self.track(calc_rs(13))
            rs_signals[f"rs_{name.lower()}_52w"] = self.track(calc_rs(52))
        rs_signals["primary_benchmark"] = self.benchmark_key
        return rs_signals

    def _derive_macro_regime(self):
        nifty_ohlcv = self.active_indices.get("NIFTY", [])
        vix_ohlcv = self.active_indices.get("INDIAVIX", [])
        nifty_trend = np.nan
        if len(nifty_ohlcv) >= 40:
            nifty_closes = [c["Close"] for c in nifty_ohlcv]
            sma200 = np.mean(nifty_closes[-40:])
            nifty_trend = safe_div(nifty_closes[-1], sma200)
        vix_ratio = np.nan
        if len(vix_ohlcv) >= 52:
            vix_closes = [c["Close"] for c in vix_ohlcv]
            avg_vix_52w = np.mean(vix_closes[-52:])
            vix_ratio = safe_div(vix_closes[-1], avg_vix_52w)
        return {
            "nifty_50_trend_ratio": self.track(nifty_trend),
            "vix_intensity_ratio": self.track(vix_ratio),
            "is_bull_regime": self.track(1 if (not np.isnan(nifty_trend) and nifty_trend > 1.0) else 0),
            "is_high_fear_regime": self.track(1 if (not np.isnan(vix_ratio) and vix_ratio > 1.2) else 0)
        }

    def _derive_meta(self):
        cap_type = self.stock_data.get("stats", {}).get("cappedType", "")
        header = self.stock_data.get("header", {})
        return {
            "is_large_cap": self.track(1 if cap_type == "Large Cap" else 0),
            "is_mid_cap": self.track(1 if cap_type == "Mid Cap" else 0),
            "is_small_cap": self.track(1 if cap_type == "Small Cap" else 0),
            "industry_name": self.track(header.get("industryName", "Unknown"))
        }

    def _derive_fundamentals(self):
        stats = self.stock_data.get("stats", {})
        return {
            "pe_vs_sector_ratio": self.track(safe_div(stats.get("peRatio"), stats.get("industryPe"))),
            "pb_vs_sector_ratio": self.track(safe_div(stats.get("pbRatio"), stats.get("sectorPb"))),
            "dividend_yield_premium": self.track(clean_float(stats.get("divYield")) - clean_float(stats.get("sectorDivYield"))),
            "debt_to_equity": self.track(clean_float(stats.get("debtToEquity"))),
            "return_on_equity": self.track(safe_div(stats.get("roe"), 100.0)),
            "return_on_assets": self.track(safe_div(stats.get("returnOnAssets"), 100.0)),
            "operating_profit_margin": self.track(safe_div(stats.get("operatingProfitMargin"), 100.0)),
            "net_profit_margin": self.track(safe_div(stats.get("netProfitMargin"), 100.0))
        }

    def _derive_efficiency(self):
        stats = self.stock_data.get("stats", {})
        pe = clean_float(stats.get("peRatio"))
        div_yield = safe_div(clean_float(stats.get("divYield")), 100.0)
        payout = div_yield * pe
        roe = safe_div(stats.get("roe"), 100.0)
        return {
            "equity_multiplier": self.track(safe_div(stats.get("returnOnEquity"), stats.get("returnOnAssets"))),
            "payout_ratio_proxy": self.track(payout),
            "sustainable_growth_rate": self.track(roe * (1.0 - payout))
        }

    def _derive_growth(self):
        financials = self.stock_data.get("financialStatement", [])
        if not isinstance(financials, list): financials = []
        def get_data_by_titles(titles):
            for t in titles:
                item = next((i for i in financials if isinstance(i, dict) and i.get("title") == t), None)
                if item:
                    q_data = item.get("quarterly", {})
                    return q_data if isinstance(q_data, dict) else {}
            return {}
        rev_data = get_data_by_titles(["Revenue", "Net Revenue", "Total Income"])
        prof_data = get_data_by_titles(["Profit", "Net Profit", "Net Income"])
        def calc_growth(data, periods=1):
            if not data: return np.nan
            sorted_qs = sorted([q for q in data.keys() if parse_quarter_date(q) <= self.ref_time], key=parse_quarter_date)
            if len(sorted_qs) > periods:
                curr, prev = clean_float(data[sorted_qs[-1]]), clean_float(data[sorted_qs[-1 - periods]])
                return safe_div(curr - prev, prev)
            return np.nan
        rev_qoq, rev_yoy = calc_growth(rev_data, 1), calc_growth(rev_data, 4)
        prof_qoq, prof_yoy = calc_growth(prof_data, 1), calc_growth(prof_data, 4)
        return {"revenue_qoq": self.track(rev_qoq), "revenue_yoy": self.track(rev_yoy), "profit_qoq": self.track(prof_qoq), "profit_yoy": self.track(prof_yoy), "growth_quality_index": self.track(safe_div(prof_yoy, rev_yoy))}

    def _derive_momentum(self):
        shp = self.stock_data.get("shareHoldingPattern", {})
        if not isinstance(shp, dict): shp = {}
        try:
            quarters = sorted([q for q in shp.keys() if isinstance(shp[q], dict) and parse_quarter_date(q) <= self.ref_time], key=parse_quarter_date)
        except: quarters = []
        if len(quarters) < 2: return {"institutional_accumulation_qoq": self.track(0.0, True), "retail_liquidation_ratio": self.track(0.0, True), "promoter_stability_delta_yoy": self.track(0.0, True)}
        t, t_1 = quarters[-1], quarters[-2]
        t_4 = quarters[-4] if len(quarters) >= 4 else quarters[0]
        def get_inst(q):
            return get_nested(shp[q], "mutualFunds.percent", 0.0) + get_nested(shp[q], "foreignInstitutions.percent", 0.0) + get_nested(shp[q], "otherDomesticInstitutions.insurance.percent", 0.0)
        inst_t, inst_t1 = get_inst(t), get_inst(t_1)
        retail_t = get_nested(shp[t], "retailAndOthers.percent", 0.0)
        inst_simple_t = get_nested(shp[t], "mutualFunds.percent", 0.0) + get_nested(shp[t], "foreignInstitutions.percent", 0.0)
        prom_t, prom_t4 = get_nested(shp[t], "promoters.individual.percent", 0.0), get_nested(shp[t_4], "promoters.individual.percent", 0.0)
        pledge_t = get_nested(shp[t], "promoters.pledgedPercent", 0.0)
        prom_total_t = 0.0
        prom_data = shp[t].get("promoters", {})
        if isinstance(prom_data, dict):
            prom_total_t = prom_data.get("total", 0.0)
            if prom_total_t == 0.0: prom_total_t = prom_data.get("individual", {}).get("percent", 0.0) + prom_data.get("corporate", {}).get("percent", 0.0)
        return {"institutional_accumulation_qoq": self.track(inst_t - inst_t1), "retail_liquidation_ratio": self.track(safe_div(retail_t, inst_simple_t)), "promoter_stability_delta_yoy": self.track(prom_t - prom_t4), "promoter_pledge_pct": self.track(safe_div(pledge_t, 100.0)), "free_float_pct": self.track(safe_div(100.0 - prom_total_t, 100.0))}

    def _derive_technicals(self):
        if not self.active_ohlcv: return {k: 0.0 for k in ["rsi_normalized", "macd_signal_ratio", "distance_from_sma10", "distance_from_sma50", "distance_from_sma200", "distance_from_52w_high", "distance_from_52w_low", "pivot_channel_position", "volume_intensity_52w", "volatility_13w"]}
        closes = [c["Close"] for c in self.active_ohlcv]
        highs = [c["High"] for c in self.active_ohlcv[-52:]]
        lows = [c["Low"] for c in self.active_ohlcv[-52:]]
        high_52w, low_52w = max(highs) if highs else self.live_price, min(lows) if lows else self.live_price
        sma10 = np.mean(closes[-10:]) if len(closes) >= 10 else self.live_price
        sma50 = np.mean(closes[-50:]) if len(closes) >= 50 else self.live_price
        volumes = [c["Volume"] for c in self.active_ohlcv[-52:]]
        avg_vol_52w = np.mean(volumes) if volumes else 0.0
        current_vol = self.active_ohlcv[-1]["Volume"]
        vol_intensity = safe_div(current_vol, avg_vol_52w)
        vol_13w = np.std([math.log(closes[i]/closes[i-1]) for i in range(len(closes)-13, len(closes))]) if len(closes) >= 14 else np.nan
        last_c = self.active_ohlcv[-1]
        pivot = (last_c["High"] + last_c["Low"] + last_c["Close"]) / 3.0
        r1, s1 = (2 * pivot) - last_c["Low"], (2 * pivot) - last_c["High"]
        tech = self.raw.get("stocksTechnicalsData", {})
        rsi, macd = clean_float(tech.get("rsi14", 50.0)), clean_float(tech.get("macd", 0.0))
        return {"rsi_normalized": self.track(safe_div(rsi, 100.0)), "macd_signal_ratio": self.track(safe_div(macd, self.live_price)), "distance_from_sma10": self.track(safe_div(self.live_price - sma10, sma10)), "distance_from_sma50": self.track(safe_div(self.live_price - sma50, sma50)), "distance_from_sma200": self.track(0.0), "distance_from_52w_high": self.track(safe_div(self.live_price - high_52w, high_52w)), "distance_from_52w_low": self.track(safe_div(self.live_price - low_52w, low_52w)), "pivot_channel_position": self.track(safe_div(self.live_price - pivot, r1 - s1)), "volume_intensity_52w": self.track(vol_intensity), "volatility_13w": self.track(vol_13w)}

    def _derive_news(self):
        news_list = self.stock_data.get("news", []) or self.raw.get("newsData", []) or self.raw.get("news", [])
        if not news_list: return {"ewma_sentiment_all": self.track(np.nan), "news_intensity_velocity": self.track(np.nan), "active_debt_crisis_flag": self.track(0), "active_regulatory_flag": self.track(0)}
        alpha, ewma, active_news_scores, news_dates = 0.3, np.nan, [], []
        def get_date(n):
            for key in ["pubDate", "date", "createdDate", "timestamp"]:
                val = n.get(key)
                if val:
                    try: return datetime.fromtimestamp(val if val < 10**11 else val/1000.0) if isinstance(val, (int, float)) else datetime.fromisoformat(str(val).split('.')[0].replace("Z", ""))
                    except: pass
            return datetime(1900, 1, 1)
        sorted_news = sorted([n for n in news_list if isinstance(n, dict)], key=get_date)
        for item in sorted_news:
            parsed_date = get_date(item)
            if parsed_date > self.ref_time: continue
            headline = item.get("title", "") or item.get("headline", "")
            description = item.get("description", "") or item.get("summary", "")
            if headline:
                scores = sia.polarity_scores(f"{headline}. {description}")
                active_news_scores.append(scores['compound'])
                if parsed_date.year > 1900: news_dates.append(parsed_date)
        if active_news_scores:
            ewma = active_news_scores[0]
            for score in active_news_scores[1:]: ewma = alpha * score + (1 - alpha) * ewma
        intensity_velocity = np.nan
        if len(news_dates) > 1: intensity_velocity = len(news_dates) / max(1.0, float((max(news_dates) - min(news_dates)).days))
        elif len(news_dates) == 1: intensity_velocity = 1.0
        return {"ewma_sentiment_all": self.track(ewma), "news_intensity_velocity": self.track(intensity_velocity), "active_debt_crisis_flag": self.track(1 if any(any(k in f"{n.get('title','')}{n.get('description','')}".lower() for k in ['debt','default','crisis','liquidation']) for n in news_list if get_date(n) <= self.ref_time) else 0), "active_regulatory_flag": self.track(1 if any(any(k in f"{n.get('title','')}{n.get('description','')}".lower() for k in ['sebi','fine','probe','regulatory','penalty']) for n in news_list if get_date(n) <= self.ref_time) else 0)}

    def _derive_liquidity(self):
        stats = self.stock_data.get("stats", {})
        return {"quick_ratio": self.track(clean_float(stats.get("quickRatio"))), "current_ratio": self.track(clean_float(stats.get("currentRatio"))), "cash_ratio": self.track(clean_float(stats.get("cashRatio"))), "ev_to_sales": self.track(clean_float(stats.get("evToSales"))), "ev_to_ebitda": self.track(clean_float(stats.get("evToEbitda"))), "price_to_ocf": self.track(clean_float(stats.get("priceToOcf"))), "price_to_fcf": self.track(clean_float(stats.get("priceToFcf"))), "peg_ratio": self.track(clean_float(stats.get("pegRatio"))), "roic": self.track(clean_float(stats.get("roic"))), "earnings_yield": self.track(clean_float(stats.get("earningsYield")))}

    def _derive_sector_premiums(self):
        stats = self.stock_data.get("stats", {})
        return {"roe_vs_sector_premium": self.track(clean_float(stats.get("roe")) - clean_float(stats.get("sectorRoe"))), "roce_vs_sector_premium": self.track(clean_float(stats.get("roic")) - clean_float(stats.get("sectorRoce"))), "pe_premium_vs_sector": self.track(clean_float(stats.get("pePremiumVsSector"))), "pb_premium_vs_sector": self.track(clean_float(stats.get("pbPremiumVsSector"))), "div_yield_vs_sector": self.track(clean_float(stats.get("divYieldVsSector")))}

    def _derive_scaling(self):
        mcap = clean_float(self.stock_data.get("stats", {}).get("marketCap"))
        return {"log_market_cap": self.track(safe_log(mcap)), "debt_to_asset": self.track(clean_float(self.stock_data.get("stats", {}).get("debtToAsset")))}

    def _derive_history(self):
        if not self.active_ohlcv: return [[0.0, 0.0, 0.0]] * 52
        matrix = []
        for i in range(1, len(self.active_ohlcv)):
            curr, prev = self.active_ohlcv[i], self.active_ohlcv[i-1]
            log_ret = safe_log(safe_div(curr["Close"], prev["Close"]))
            intra_spread = safe_div(curr["High"] - curr["Low"], curr["Close"])
            ovn_gap = safe_div(curr["Open"] - prev["Close"], prev["Close"])
            matrix.append([log_ret, intra_spread, ovn_gap])
        if len(matrix) >= 52: return matrix[-52:]
        return [[0.0, 0.0, 0.0]] * (52 - len(matrix)) + matrix

    def _derive_health_scores(self):
        score = 0
        financials = self.stock_data.get("financialStatement", [])
        if not isinstance(financials, list): financials = []
        prof_stmt = next((s for s in financials if isinstance(s, dict) and s.get("title") == "Profit"), {})
        q_prof = prof_stmt.get("quarterly", {})
        try: sorted_qs = sorted([q for q in q_prof.keys() if parse_quarter_date(q) <= self.ref_time], key=parse_quarter_date)
        except: sorted_qs = []
        if not sorted_qs: return {"piotroski_f_score": self.track(0)}
        latest_q = sorted_qs[-1]
        prev_q = sorted_qs[-2] if len(sorted_qs) > 1 else None
        if q_prof.get(latest_q, 0) > 0: score += 1
        if prev_q and q_prof.get(latest_q, 0) > q_prof.get(prev_q, 0): score += 1
        return {"piotroski_f_score": self.track(score)}

# --- MAIN ORCHESTRATOR ---

def sanitize_nan(obj):
    if isinstance(obj, dict): return {k: sanitize_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list): return [sanitize_nan(i) for i in obj]
    elif isinstance(obj, (float, np.float64)) and np.isnan(obj): return None
    return obj

def process_stock(slug, fetcher, index_map, market_breadth_map, args):
    try:
        raw_data = fetcher.get_technicals(slug)
        if not raw_data: return False
        ticker = raw_data.get("ticker")
        ohlcv = fetcher.get_ohlcv(ticker, "NSE")
        if not ohlcv: ohlcv = fetcher.get_ohlcv(ticker, "BSE")
        if not ohlcv: return False
        results = []
        if args.mode == "train":
            present_idx = len(ohlcv) - 1
            present_price = float(ohlcv[present_idx]["Close"])
            for offset in [4, 13, 52, 156]:
                ref_idx = present_idx - offset
                if ref_idx >= 0 and ohlcv[ref_idx]["Timestamp"] >= 1451606400:
                    engineer = MLDatasetEngineer(raw_data, ohlcv, ref_idx=ref_idx, index_map=index_map, market_breadth_map=market_breadth_map)
                    snapshot = engineer.derive_all(present_price=present_price)
                    snapshot["meta_features"]["anchor_offset_weeks"] = offset
                    snapshot["meta_features"]["anchor_date"] = engineer.ref_time.strftime('%Y-%m-%d')
                    results.append(snapshot)
        else:
            engineer = MLDatasetEngineer(raw_data, ohlcv, ref_idx=-1, index_map=index_map, market_breadth_map=market_breadth_map)
            results = engineer.derive_all()
        if results:
            output_path = os.path.join(args.output_dir, f"{slug}.json")
            with open(output_path, 'w') as f: json.dump(sanitize_nan(results), f, indent=4)
            return True
    except: return False
    return False

def calculate_market_breadth(absolute_dir):
    breadth_counts = {}
    if not os.path.exists(absolute_dir): return {}
    files = [f for f in os.listdir(absolute_dir) if f.endswith(".json")]
    for f in tqdm(files, desc="Calculating Market Breadth"):
        try:
            with open(os.path.join(absolute_dir, f), 'r') as jf:
                data = json.load(jf)
                ohlcv = data.get("OHLCV", [])
                if len(ohlcv) < 52: continue # Need history for 50-DMA
                closes = [c["Close"] for c in ohlcv]
                for i in range(50, len(ohlcv)):
                    sma50 = sum(closes[i-50:i]) / 50.0
                    is_above = 1 if closes[i] > sma50 else 0
                    dt = ohlcv[i]["Date"]
                    if dt not in breadth_counts: breadth_counts[dt] = [0, 0]
                    breadth_counts[dt][0] += is_above
                    breadth_counts[dt][1] += 1
        except: continue
    return {dt: safe_div(counts[0], counts[1]) for dt, counts in breadth_counts.items()}

def main():
    parser = argparse.ArgumentParser(description="Build ML dataset with enhanced metrics.")
    parser.add_argument("--slugs", default="stock_slugs.txt")
    parser.add_argument("--target", required=True, help="Target buffer directory (e.g., datasets/inactive)")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--mode", choices=["train", "inference"], default="inference")
    parser.add_argument("--workers", type=int, default=15)
    args = parser.parse_args()

    args.output_dir = os.path.join(args.target, "relative_dataset")
    args.absolute_dir = os.path.join(args.target, "absolute_dataset")

    if not os.path.exists(args.output_dir): os.makedirs(args.output_dir)
    if not os.path.exists(args.slugs): return

    with open(args.slugs, 'r') as f: slugs = [line.strip() for line in f if line.strip()]
    if args.limit: slugs = slugs[:args.limit]

    fetcher = GrowwFetcher()
    index_map = {}
    for ticker in ["NIFTY", "INDIAVIX", "NIFTYSMALLCAP250", "NIFTYMIDCAP150"]:
        ohlcv = fetcher.get_ohlcv(ticker, "NSE")
        if ohlcv: index_map[ticker] = ohlcv

    market_breadth_map = calculate_market_breadth(args.absolute_dir)

    print(f"Starting parallel processing with {args.workers} workers...")
    
    success_count = 0
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(process_stock, slug, fetcher, index_map, market_breadth_map, args): slug for slug in slugs}
        for future in tqdm(as_completed(futures), total=len(slugs), desc="Processing stocks"):
            try: 
                if future.result():
                    success_count += 1
            except: pass

    print(f"\nProcessing complete.")
    print(f"Total Slugs Attempted: {len(slugs)}")
    print(f"Total JSONs Generated: {success_count}")

if __name__ == "__main__":
    main()
