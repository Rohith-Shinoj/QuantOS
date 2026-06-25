import pandas as pd
import numpy as np

def score_multibaggers():
    print("Loading fundamental data...")
    df = pd.read_parquet('datasets/active/fundamentals/fundamental_data.parquet')
    
    # 1. Base Filters
    # ADTV > ₹1 Crore (10,000,000) and Price > ₹20
    df = df[(df['latest_close'] > 20) & (df['adtv_20d'] > 10_000_000)].copy()
    
    # We only want profitable, growing businesses
    df = df[(df['revenue_growth_yoy'] > 0) & (df['profit_growth_yoy'] > 0)]
    df = df[df['peRatio'] > 0] 
    
    # 2. Rank Building (Z-Scores)
    def winsorize(s):
        return s.clip(lower=s.quantile(0.05), upper=s.quantile(0.95))
        
    def zscore(s):
        s_w = winsorize(s)
        return (s_w - s_w.mean()) / (s_w.std() + 1e-5)
        
    # Value Score (Higher is cheaper)
    df['z_pe'] = -zscore(df['peRatio'])
    df['z_pb'] = -zscore(df['pbRatio'])
    df['value_score'] = df['z_pe'] + df['z_pb']
    
    # Growth Score (Higher is faster growing)
    df['z_rev_growth'] = zscore(df['revenue_growth_yoy'])
    df['z_profit_growth'] = zscore(df['profit_growth_yoy'])
    df['growth_score'] = df['z_rev_growth'] + df['z_profit_growth']
    
    # Quality Score (Higher is more efficient/safe)
    df['z_roe'] = zscore(df['roe'])
    df['z_debt'] = -zscore(df['debtToEquity'].fillna(0))
    df['quality_score'] = df['z_roe'] + df['z_debt']
    
    # Composite Multibagger Score
    # Weighting: 40% Growth, 30% Value, 30% Quality
    df['multibagger_score'] = (0.4 * df['growth_score']) + (0.3 * df['value_score']) + (0.3 * df['quality_score'])
    
    # Sort and Print
    top_picks = df.sort_values('multibagger_score', ascending=False).head(30)
    
    print("\n" + "="*85)
    print("🚀 TOP 30 FUNDAMENTAL MULTIBAGGER CANDIDATES 🚀")
    print("="*85)
    print(f"{'Company Name':<30} | {'Industry':<20} | {'P/E':<6} | {'ROE%':<6} | {'Rev Grw%':<8} | {'Score':<6}")
    print("-" * 85)
    
    for _, row in top_picks.iterrows():
        name = str(row['companyName'])[:28]
        ind = str(row['industry'])[:18]
        pe = f"{row['peRatio']:.1f}"
        roe = f"{row['roe']:.1f}"
        rev_g = f"{row['revenue_growth_yoy']*100:.1f}"
        score = f"{row['multibagger_score']:.2f}"
        
        print(f"{name:<30} | {ind:<20} | {pe:<6} | {roe:<6} | {rev_g:<8} | {score:<6}")
        
if __name__ == "__main__":
    score_multibaggers()
