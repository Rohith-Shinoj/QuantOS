import json
import pandas as pd

def calculate_macro_drawdown(ohlcv_json):
    try:
        if not ohlcv_json: return 0.0
        data = json.loads(ohlcv_json)
        if not data: return 0.0
        history = data[-252:] 
        highs = [float(c.get('High', 0)) for c in history if c.get('High')]
        if not highs: return 0.0
        max_high = max(highs)
        live_price = float(history[-1].get('Close', 0))
        if max_high == 0: return 0.0
        return (max_high - live_price) / max_high
    except Exception as e:
        return 0.0

def calculate_liquidity_gates(ohlcv_json, min_adtv=10000000, min_price=20.0):
    try:
        if not ohlcv_json: return False, 0.0
        data = json.loads(ohlcv_json)
        if len(data) == 0: return False, 0.0
        recent = data[-30:]
        total_value = sum(float(c.get('Close', 0)) * float(c.get('Volume', 0)) for c in recent)
        adtv = total_value / max(1, len(recent))
        live_price = float(data[-1].get('Close', 0))
        return (adtv >= min_adtv) and (live_price >= min_price), live_price
    except Exception as e:
        return False, 0.0

def winsorize_series(s):
    lower = s.quantile(0.05)
    upper = s.quantile(0.95)
    return s.clip(lower=lower, upper=upper)

def extract_forensics(abs_t0_json, abs_tminus1_json, industry):
    z_score, f_score = -1.0, 0
    try:
        t0 = json.loads(abs_t0_json) if abs_t0_json else {}
        t1 = json.loads(abs_tminus1_json) if abs_tminus1_json else {}
        
        roa_t0 = float(t0.get('returnOnAssets', 0) or 0)
        roa_t1 = float(t1.get('returnOnAssets', 0) or 0)
        cf_t0 = float(t0.get('priceToOcf', 0) or 0)
        pe_t0 = float(t0.get('peRatio', 0) or 0)
        debt_t0 = float(t0.get('debtToEquity', 0) or 0)
        debt_t1 = float(t1.get('debtToEquity', 0) or 0)
        cr_t0 = float(t0.get('currentRatio', 0) or 0)
        cr_t1 = float(t1.get('currentRatio', 0) or 0)
        opm_t0 = float(t0.get('operatingProfitMargin', 0) or 0)
        opm_t1 = float(t1.get('operatingProfitMargin', 0) or 0)
        roe_t0 = float(t0.get('returnOnEquity', 0) or 0)
        
        if roa_t0 > 0: f_score += 1
        if cf_t0 > 0: f_score += 1
        if roa_t0 >= roa_t1: f_score += 1
        if cf_t0 > 0 and pe_t0 > cf_t0: f_score += 1
        if debt_t0 <= debt_t1: f_score += 1
        if cr_t0 >= cr_t1: f_score += 1
        if opm_t0 >= opm_t1: f_score += 1
        
        if industry in ['Banks', 'Financial Services']:
            z_score = 3.0
        else:
            x1 = cr_t0 - 1.0
            x2 = roe_t0 / 100.0
            x3 = roa_t0 / 100.0
            x4 = 1.0 / (debt_t0 + 0.001) if debt_t0 > 0 else 5.0
            x5 = opm_t0 / 100.0
            z_score = 1.2*x1 + 1.4*x2 + 3.3*x3 + 0.6*x4 + 1.0*x5
            
    except Exception:
        pass
        
    return z_score, f_score
