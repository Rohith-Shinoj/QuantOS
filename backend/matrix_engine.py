import json
import pandas as pd
import numpy as np
from typing import List, Dict

def compute_15_card_matrix(con, holdings: List[Dict]) -> Dict:
    stock_slugs = [h['slug'] for h in holdings if h['type'] == 'STOCKS']
    mf_slugs = [h['slug'] for h in holdings if h['type'] == 'MUTUAL_FUNDS']
    
    if not holdings:
        return {
            "growth_view": {}, "allocation_view": {}, "backtest_view": {},
            "performance_view": {}, "drawdown_view": {}, "ai_outlook_view": {}
        }
        
    slug_list_str = ','.join([f"'{s}'" for s in stock_slugs]) if stock_slugs else "''"
    mf_list_str = ','.join([f"'{s}'" for s in mf_slugs]) if mf_slugs else "''"
    
    stocks_df = con.execute(f"SELECT * FROM stocks WHERE slug IN ({slug_list_str})").df() if stock_slugs else pd.DataFrame()
    mf_df = con.execute(f"SELECT scheme_code as slug, historical_navs FROM mutual_funds WHERE scheme_code IN ({mf_list_str})").df() if mf_slugs else pd.DataFrame()
    macro_df = con.execute("SELECT slug, absolute_data FROM stocks WHERE slug IN ('nifty', 'india-vix')").df()
    
    def get_val(h):
        val = h.get('holding_value', 0)
        return val if val > 0 else h.get('invested_amount', 0)
    
    total_invested = sum(get_val(h) for h in holdings)
    weights = {h['slug']: get_val(h) / total_invested if total_invested > 0 else 0 for h in holdings}
    
    # Process portfolio history
    stock_series = {}
    if not stocks_df.empty:
        for idx, row in stocks_df.iterrows():
            abs_data = json.loads(row['absolute_data']) if pd.notna(row['absolute_data']) else {}
            ohlcv = abs_data.get('OHLCV', [])
            if ohlcv:
                df = pd.DataFrame({'Date': [x['Date'] for x in ohlcv], row['slug']: [x['Close'] for x in ohlcv]})
                df['Date'] = pd.to_datetime(df['Date'], format="%d-%m-%Y", errors='coerce')
                df = df.dropna(subset=['Date'])
                stock_series[row['slug']] = df.set_index('Date')
                
    if not mf_df.empty:
        for idx, row in mf_df.iterrows():
            hist_navs = row['historical_navs']
            if hist_navs is not None and len(hist_navs) > 0:
                try:
                    df = pd.DataFrame(list(hist_navs), columns=['Timestamp', 'Close'])
                    df['Date'] = pd.to_datetime(df['Timestamp'], unit='ms').dt.normalize()
                    df = df.groupby('Date').last().reset_index()
                    df = df[['Date', 'Close']].rename(columns={'Close': row['slug']})
                    stock_series[row['slug']] = df.set_index('Date')
                except Exception:
                    pass
            
    if stock_series:
        port_df = pd.concat(stock_series.values(), axis=1).sort_index().ffill()
        
        # True backward projection based on absolute monetary values (eliminates look-ahead bias)
        current_values = pd.Series({h['slug']: get_val(h) for h in holdings})
        total_portfolio_value_t = pd.Series(0.0, index=port_df.index)
        
        # Backfill prices for pre-IPO periods so they act as cash (0% return)
        port_df_filled = port_df.bfill()
        
        for slug in current_values.index:
            if slug in port_df_filled.columns:
                last_valid_price = port_df_filled[slug].dropna().iloc[-1] if not port_df_filled[slug].dropna().empty else 1.0
                units = current_values[slug] / last_valid_price if last_valid_price > 0 else 0
                total_portfolio_value_t += port_df_filled[slug] * units

        port_returns = total_portfolio_value_t.pct_change().dropna()
        returns_df = port_df.pct_change().dropna(how='all')
    else:
        port_returns = pd.Series(dtype=float)
        returns_df = pd.DataFrame()
        
    # Process Macros
    vix_df = pd.DataFrame()
    nifty_df = pd.DataFrame()
    master_df = pd.DataFrame()
    
    vix_rows = macro_df[macro_df['slug'] == 'india-vix']
    nifty_rows = macro_df[macro_df['slug'] == 'nifty']
    
    if not vix_rows.empty and not nifty_rows.empty:
        vix_data = vix_rows['absolute_data'].iloc[0]
        nifty_data = nifty_rows['absolute_data'].iloc[0]
        
        vix_ohlcv = json.loads(vix_data).get('OHLCV', []) if pd.notna(vix_data) else []
        if vix_ohlcv:
            vix_df = pd.DataFrame({'Date': [x['Date'] for x in vix_ohlcv], 'vix': [x['Close'] for x in vix_ohlcv]})
            vix_df['Date'] = pd.to_datetime(vix_df['Date'], format="%d-%m-%Y", errors='coerce')
            vix_df = vix_df.dropna(subset=['Date']).set_index('Date').sort_index()
            
        nifty_ohlcv = json.loads(nifty_data).get('OHLCV', []) if pd.notna(nifty_data) else []
        if nifty_ohlcv:
            nifty_df = pd.DataFrame({'Date': [x['Date'] for x in nifty_ohlcv], 'nifty': [x['Close'] for x in nifty_ohlcv]})
            nifty_df['Date'] = pd.to_datetime(nifty_df['Date'], format="%d-%m-%Y", errors='coerce')
            nifty_df = nifty_df.dropna(subset=['Date']).set_index('Date').sort_index()
            nifty_returns = nifty_df['nifty'].pct_change().dropna()
            
            if not port_returns.empty and not vix_df.empty:
                master_df = pd.DataFrame({'portfolio': port_returns, 'nifty': nifty_returns, 'vix': vix_df['vix']}).dropna()
    
    return {
        "growth_view": compute_growth_view(stocks_df, weights, returns_df),
        "allocation_view": compute_allocation_view(stocks_df, weights, master_df),
        "backtest_view": compute_backtest_view(master_df),
        "performance_view": compute_performance_view(master_df),
        "drawdown_view": compute_drawdown_view(stocks_df, weights, master_df),
        "ai_outlook_view": compute_ai_outlook_view(stocks_df, weights)
    }

def compute_growth_view(stocks_df, weights, returns_df):
    port_profit_yoy = 0
    port_1y_return = 0
    valid_profit_weight = 0
    
    for idx, row in stocks_df.iterrows():
        rel_data = json.loads(row['relative_data']) if pd.notna(row['relative_data']) else {}
        w = weights.get(row['slug'], 0)
        profit_yoy = rel_data.get('financial_growth_signals', {}).get('profit_yoy')
        
        # Only add to profit_yoy if it's not None (e.g. valid corporate stock, not ETF)
        if profit_yoy is not None:
            port_profit_yoy += (float(profit_yoy) / 100) * w
            valid_profit_weight += w
            
            # ONLY sum returns of the exact same direct equities
            if row['slug'] in returns_df.columns:
                stock_series = returns_df[row['slug']].dropna()
                last_252 = stock_series.tail(252)
                if not last_252.empty:
                    ret_1y = (1 + last_252).prod() - 1
                    port_1y_return += ret_1y * w
            
    # Normalize by valid weight
    if valid_profit_weight > 0:
        port_profit_yoy = port_profit_yoy / valid_profit_weight
        # Re-weight the 1Y return to match the same denominator scope
        port_1y_return = port_1y_return / valid_profit_weight
    else:
        port_profit_yoy = 0
        port_1y_return = 0
        
    pe_expansion = ((1 + port_1y_return) / (1 + port_profit_yoy)) - 1 if port_profit_yoy != -1 else 0
    total_change = abs(port_profit_yoy) + abs(pe_expansion)
    
    if total_change > 0:
        profit_contrib = abs(port_profit_yoy) / total_change * 100
        pe_contrib = abs(pe_expansion) / total_change * 100
    else:
        profit_contrib, pe_contrib = 50, 50
        
    return {
        "earnings_quality": {
            "total_1y_return": round(port_1y_return * 100, 2),
            "profit_growth": round(port_profit_yoy * 100, 2),
            "pe_expansion": round(pe_expansion * 100, 2),
            "profit_contrib": round(profit_contrib, 1),
            "pe_contrib": round(pe_contrib, 1)
        }
    }

def compute_allocation_view(stocks_df, weights, master_df):
    if master_df.empty:
        vix_trajectory = "Unknown"
        alignment = "N/A"
    else:
        vix_30d = master_df['vix'].tail(30)
        if len(vix_30d) > 1:
            vix_slope = np.polyfit(range(len(vix_30d)), vix_30d.values, 1)[0]
            vix_trajectory = "Rising" if vix_slope > 0.05 else "Falling" if vix_slope < -0.05 else "Neutral"
        else:
            vix_trajectory = "Neutral"
            
    large_cap_w = sum(weights.get(row['slug'], 0) for _, row in stocks_df.iterrows() if pd.notna(row.get('market_cap_type')) and row['market_cap_type'] == 'Large Cap')
    
    alignment = "MATCH"
    if vix_trajectory == "Rising" and large_cap_w < 0.4:
        alignment = "MISMATCH (Underweight Large Caps in Rising VIX)"
    elif vix_trajectory == "Falling" and large_cap_w > 0.7:
        alignment = "MISMATCH (Overweight Large Caps in Falling VIX)"
        
    # Factor Exposure Math
    val_w = 0; valid_val = 0
    gro_w = 0; valid_gro = 0
    mom_w = 0; valid_mom = 0
    
    for idx, row in stocks_df.iterrows():
        rel_data = json.loads(row['relative_data']) if pd.notna(row['relative_data']) else {}
        w = weights.get(row['slug'], 0)
        
        pe = row.get('pe_ratio')
        profit_yoy = rel_data.get('financial_growth_signals', {}).get('profit_yoy')
        rs = rel_data.get('momentum_signals', {}).get('rs_rating')
        
        if pd.notna(pe) and pe > 0:
            val_w += (1 / pe) * w
            valid_val += w
        if profit_yoy is not None:
            gro_w += float(profit_yoy) * w
            valid_gro += w
        if rs is not None and float(rs) != 0.0:
            mom_w += float(rs) * w
            valid_mom += w
            
    agg_pe = valid_val / val_w if val_w > 0 else 0
    val_score = round(agg_pe, 1)
    
    # Static Baseline Nifty PE = 22.5, StdDev = 4.0
    # TODO: Migrate static Nifty baseline to a dynamic downstream index-valuation Parquet feed in v1.1
    val_z = round(-(agg_pe - 22.5) / 4.0, 1) if agg_pe > 0 else 0
    
    gro_score = round(gro_w / valid_gro, 1) if valid_gro > 0 else 0
    mom_score = round(mom_w / valid_mom, 1) if valid_mom > 0 else "ERR_DATA_MISSING"

    return {
        "regime_alignment": {
            "vix_trajectory": vix_trajectory,
            "large_cap_weight": round(large_cap_w * 100, 1),
            "alignment": alignment
        },
        "factor_exposure": {
            "value_score": val_score,
            "value_z": val_z,
            "growth_score": gro_score,
            "momentum_score": mom_score
        }
    }

def compute_backtest_view(master_df):
    if master_df.empty: return {}
    
    ret = master_df['portfolio']
    
    # Inject 7% annualized risk-free rate for Indian market accuracy
    rf = 0.07 
    daily_rf = rf / 252
    excess_ret = ret - daily_rf
    
    sharpe = (excess_ret.mean() / ret.std()) * np.sqrt(252) if ret.std() > 0 else 0
    neg_excess_ret = excess_ret[excess_ret < 0]
    sortino = (excess_ret.mean() / neg_excess_ret.std()) * np.sqrt(252) if not neg_excess_ret.empty and neg_excess_ret.std() > 0 else 0
    
    port_cum = (1 + ret).cumprod()
    rolling_1y = port_cum.pct_change(252).dropna()
    best_1y = rolling_1y.max() * 100 if not rolling_1y.empty else 0
    worst_1y = rolling_1y.min() * 100 if not rolling_1y.empty else 0
    
    corr = ret.corr(master_df['nifty']) if master_df['nifty'].std() > 0 else 0
    
    return {
        "risk_adjusted": {
            "sharpe": round(sharpe, 2),
            "sortino": round(sortino, 2)
        },
        "horizons": {
            "best_1y": round(best_1y, 2),
            "worst_1y": round(worst_1y, 2)
        },
        "stress_overlays": {
            "nifty_correlation": round(corr, 2)
        }
    }

def compute_performance_view(master_df):
    if master_df.empty: return {}
    
    master_df['vix_mean_6m'] = master_df['vix'].rolling(126).mean()
    master_df['vix_std_6m'] = master_df['vix'].rolling(126).std()
    
    # Avoid division by zero
    vix_std = master_df['vix_std_6m'].replace(0, np.nan)
    master_df['vix_zscore'] = (master_df['vix'] - master_df['vix_mean_6m']) / vix_std
    
    current_vix = master_df['vix'].iloc[-1]
    current_z = master_df['vix_zscore'].iloc[-1] if pd.notna(master_df['vix_zscore'].iloc[-1]) else 0
    
    if current_z > 1.5: regime = "HIGH PANIC"
    elif current_z < -1.0: regime = "COMPLACENT"
    else: regime = "NORMAL TRANSITION"
    
    panic_days = master_df[(master_df['vix_zscore'] > 1.5) & (master_df['nifty'] < 0)]
    avg_panic_drop = panic_days['portfolio'].mean() * 100 if not panic_days.empty else 0
    
    ret_1m = (1 + master_df['portfolio'].tail(21)).prod() - 1 if len(master_df) >= 21 else 0
    ret_6m = (1 + master_df['portfolio'].tail(126)).prod() - 1 if len(master_df) >= 126 else 0
    
    return {
        "volatility_regime": {
            "current_regime": regime,
            "z_score": round(current_z, 2),
            "current_vix": round(current_vix, 2),
            "avg_panic_drop": round(avg_panic_drop, 2)
        },
        "periodic_attribution": {
            "ret_1m": round(ret_1m * 100, 2),
            "ret_6m": round(ret_6m * 100, 2)
        }
    }

def compute_drawdown_view(stocks_df, weights, master_df):
    if master_df.empty: return {}
    
    port_cum = (1 + master_df['portfolio']).cumprod()
    roll_max = port_cum.cummax()
    drawdown = (port_cum - roll_max) / roll_max
    max_dd = drawdown.min() * 100 if not drawdown.empty else 0
    
    # Needs vix_zscore which might not be computed if performance_view isn't called or modifies a copy
    # Re-compute locally to be safe
    vix_std = master_df['vix'].rolling(126).std().replace(0, np.nan)
    vix_z = (master_df['vix'] - master_df['vix'].rolling(126).mean()) / vix_std
    panic_days = master_df[(vix_z > 1.5) & (master_df['nifty'] < 0)]
    
    if len(panic_days) > 1 and panic_days['nifty'].var() > 0:
        downside_beta = panic_days['portfolio'].cov(panic_days['nifty']) / panic_days['nifty'].var()
    else:
        downside_beta = 1.0
        
    avg_inst_accum = 0
    valid_inst = 0
    for _, row in stocks_df.iterrows():
        if pd.notna(row.get('inst_accum')):
            w = weights.get(row['slug'], 0)
            avg_inst_accum += float(row['inst_accum']) * w
            valid_inst += w
            
    if valid_inst > 0:
        avg_inst_accum = avg_inst_accum / valid_inst
    
    return {
        "crash_profiler": {
            "max_drawdown": round(max_dd, 2),
            "downside_beta": round(downside_beta, 2)
        },
        "institutional_flow": {
            "accumulation_score": round(avg_inst_accum, 2),
            "verdict": "Structural Shakeout (Smart Money Accumulating)" if avg_inst_accum > 0 else "Structural Distribution (Institutions Selling)"
        }
    }

def compute_ai_outlook_view(stocks_df, weights):
    agg_alpha = 0
    valid_alpha = 0
    agg_qes = 0
    valid_qes = 0
    
    shap_counts = {}
    
    for _, row in stocks_df.iterrows():
        w = weights.get(row['slug'], 0)
        
        if pd.notna(row.get('alpha_score_conservative')) and float(row.get('alpha_score_conservative')) != 0.0:
            agg_alpha += float(row['alpha_score_conservative']) * w
            valid_alpha += w
            
        if pd.notna(row.get('qes_flag')) and float(row.get('qes_flag')) != 0.0:
            agg_qes += float(row['qes_flag']) * w
            valid_qes += w
            
        r1 = row.get('shap_reason_1')
        r2 = row.get('shap_reason_2')
        if pd.notna(r1) and str(r1).strip() != "":
            shap_counts[r1] = shap_counts.get(r1, 0) + w
        if pd.notna(r2) and str(r2).strip() != "":
            shap_counts[r2] = shap_counts.get(r2, 0) + w
            
    if valid_alpha > 0: 
        agg_alpha = round((agg_alpha / valid_alpha) * 100, 1)
    else: 
        agg_alpha = "PENDING"
        
    if valid_qes > 0: 
        agg_qes = round((agg_qes / valid_qes) * 100, 1)
    else: 
        agg_qes = "PENDING"
    
    top_shaps = sorted(shap_counts.items(), key=lambda x: x[1], reverse=True)[:2]
    top_drivers = [x[0] for x in top_shaps]
    
    return {
        "ensemble_alpha": agg_alpha,
        "forensic_risk": agg_qes,
        "shap_drivers": top_drivers
    }
