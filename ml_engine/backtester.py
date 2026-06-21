import os
import glob
import pandas as pd
import numpy as np
import duckdb
import joblib

def run_backtest(snapshot_dir="datasets/snapshots", model_dir="ml_engine/models"):
    print("📈 Initiating Institutional Walk-Forward Backtest...")
    
    files = sorted(glob.glob(os.path.join(snapshot_dir, "snapshot_*.parquet")))
    if len(files) < 2:
        print("⚠️ Not enough historical snapshots to perform backtest.")
        return

    # Load Models
    try:
        acc_model = joblib.load(os.path.join(model_dir, "accountant.pkl"))
        str_model = joblib.load(os.path.join(model_dir, "strategist.pkl"))
        aud_model = joblib.load(os.path.join(model_dir, "auditor.pkl"))
        meta_model = joblib.load(os.path.join(model_dir, "meta_learner.pkl"))
    except:
        print("❌ Models not found. Train models first.")
        return

    fundamental_feats = ['pe_ratio', 'debt_to_equity', 'return_on_equity', 'net_profit_margin', 'equity_multiplier', 'sustainable_growth_rate', 'revenue_yoy', 'profit_yoy']
    momentum_feats = ['rs_rating', 'volatility_squeeze', 'inst_accum']
    forensic_feats = ['qes_flag', 'tax_divergence', 'pledge_delta']

    con = duckdb.connect(":memory:")
    
    cumulative_portfolio_return = 1.0
    cumulative_benchmark_return = 1.0
    
    print("\n" + "="*50)
    print("BACKTEST REPORT: TOP 20 AI ALPHA PORTFOLIO")
    print("="*50)

    for i in range(len(files) - 1):
        t0_file = files[i]
        t0_date = os.path.basename(t0_file).replace("snapshot_", "").replace(".parquet", "")
        t1_file = files[i+1]
        t1_date = os.path.basename(t1_file).replace("snapshot_", "").replace(".parquet", "")
        
        # Load T0 data
        query_t0 = f"""
            SELECT 
                slug, ticker,
                pe_ratio,
                CAST(json_extract_string(relative_data, '$.normalized_fundamentals.debt_to_equity') AS DOUBLE) as debt_to_equity,
                CAST(json_extract_string(relative_data, '$.normalized_fundamentals.return_on_equity') AS DOUBLE) as return_on_equity,
                CAST(json_extract_string(relative_data, '$.normalized_fundamentals.net_profit_margin') AS DOUBLE) as net_profit_margin,
                CAST(json_extract_string(relative_data, '$.structural_capital_efficiency.equity_multiplier') AS DOUBLE) as equity_multiplier,
                CAST(json_extract_string(relative_data, '$.structural_capital_efficiency.sustainable_growth_rate') AS DOUBLE) as sustainable_growth_rate,
                CAST(json_extract_string(relative_data, '$.financial_growth_signals.revenue_yoy') AS DOUBLE) as revenue_yoy,
                CAST(json_extract_string(relative_data, '$.financial_growth_signals.profit_yoy') AS DOUBLE) as profit_yoy,
                rs_rating, volatility_squeeze, inst_accum, qes_flag, tax_divergence, pledge_delta,
                CAST(regexp_replace(json_extract_string(absolute_data, '$.live price'), '[^0-9.]', '', 'g') AS DOUBLE) as price_t0
            FROM '{t0_file}'
        """
        df_t0 = con.execute(query_t0).df().fillna(0)
        
        # Inference at T0
        p_acc = acc_model.predict_proba(df_t0[fundamental_feats])[:, 1]
        p_str = str_model.predict_proba(df_t0[momentum_feats])[:, 1]
        p_aud = aud_model.predict_proba(df_t0[forensic_feats])[:, 1]
        meta_X = pd.DataFrame({'acc_prob': p_acc, 'str_prob': p_str, 'aud_risk_prob': p_aud})
        df_t0['alpha_score'] = meta_model.predict_proba(meta_X)[:, 1]
        df_t0.loc[p_aud > 0.70, 'alpha_score'] = 0.01 # Veto
        
        # Select Top 20 Portfolio
        top_20 = df_t0.sort_values('alpha_score', ascending=False).head(20)
        
        # Load T1 data to check returns
        query_t1 = f"""
            SELECT 
                slug, 
                CAST(regexp_replace(json_extract_string(absolute_data, '$.live price'), '[^0-9.]', '', 'g') AS DOUBLE) as price_t1
            FROM '{t1_file}'
        """
        df_t1 = con.execute(query_t1).df().dropna()
        
        # Merge to get returns
        portfolio = top_20.merge(df_t1, on='slug', how='inner')
        if len(portfolio) == 0: continue
        
        portfolio['return'] = (portfolio['price_t1'] / portfolio['price_t0']) - 1.0
        
        # Assuming equal weight
        period_portfolio_return = portfolio['return'].mean()
        
        # Approximation: Benchmark drift ~12% per year.
        period_benchmark_return = 0.12 
        
        cumulative_portfolio_return *= (1 + period_portfolio_return)
        cumulative_benchmark_return *= (1 + period_benchmark_return)
        
        hit_rate = (portfolio['return'] > 0).mean() * 100
        alpha = (period_portfolio_return - period_benchmark_return) * 100
        
        # Monte Carlo Simulation (1000 random portfolios of size 20)
        random_returns = []
        df_merged = df_t0.merge(df_t1, on='slug', how='inner')
        df_merged['return'] = (df_merged['price_t1'] / df_merged['price_t0']) - 1.0
        
        if len(df_merged) >= 20:
            for _ in range(1000):
                sample = df_merged.sample(n=20, replace=False)
                random_returns.append(sample['return'].mean())
            
            mc_mean = np.mean(random_returns)
            mc_95th = np.percentile(random_returns, 95)
            mc_win_prob = np.mean(period_portfolio_return > random_returns) * 100
        else:
            mc_mean, mc_95th, mc_win_prob = 0, 0, 0
        
        print(f"🗓️  Period: {t0_date} to {t1_date}")
        print(f"   - Portfolio Return:  {period_portfolio_return*100:.2f}%")
        print(f"   - Benchmark Return:  {period_benchmark_return*100:.2f}%")
        print(f"   - Alpha Generated:   {alpha:+.2f}%")
        print(f"   - Win Rate:          {hit_rate:.1f}%")
        print(f"   🎲 Monte Carlo Check:")
        print(f"      - Random Mean:    {mc_mean*100:.2f}%")
        print(f"      - AI Beat Prob:   {mc_win_prob:.1f}% (AI vs 1000 Random Portfolios)")
        print("-" * 50)
        
    print(f"\n📊 CUMULATIVE PERFORMANCE")
    print(f"   - Total Portfolio Return: {(cumulative_portfolio_return - 1)*100:.2f}%")
    print(f"   - Total Benchmark Return: {(cumulative_benchmark_return - 1)*100:.2f}%")
    print(f"   - Total Alpha:            {((cumulative_portfolio_return - cumulative_benchmark_return)*100):+.2f}%")
    print("="*50 + "\n")
    
    # Export for UI
    report = {
        "summary": {
            "portfolio_return": (cumulative_portfolio_return - 1),
            "benchmark_return": (cumulative_benchmark_return - 1),
            "total_alpha": (cumulative_portfolio_return - cumulative_benchmark_return)
        }
    }
    os.makedirs("datasets/reports", exist_ok=True)
    with open("datasets/reports/backtest_summary.json", 'w') as f:
        import json
        json.dump(report, f, indent=4)
    print("✅ Backtest report saved to datasets/reports/backtest_summary.json")
    
    con.close()

if __name__ == "__main__":
    run_backtest()
