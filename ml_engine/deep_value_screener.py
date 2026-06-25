import pandas as pd
import numpy as np

def score_deep_value():
    df = pd.read_parquet('datasets/active/deep_value/deep_value_data.parquet')
    
    # 1. Base Filters: Eliminate Dead Stocks and Penny Stocks
    df = df[df['days_since_trade'] <= 10]
    df = df[df['latest_close'] >= 20]
    df = df[df['adtv'] >= 10_000_000] # 1 Crore
    
    # 2. Deep Value Filters (The Buy Low Mandate)
    df = df[(df['peRatio'] > 0) & (df['peRatio'] <= 25)] # Undervalued P/E
    df = df[df['discount_from_high'] >= 0.20] # At least 20% off the high
    
    # 3. Growth & Institutional Filters (The Turnaround Evidence)
    df = df[(df['C_growth'] >= 0.20) | (df['A_growth'] >= 0.20)]
    df = df[df['I_inst_hold'] >= 5.0]
    
    # 4. Deep Value Z-Score Ranking
    def zscore(s):
        s_w = s.clip(lower=s.quantile(0.05), upper=s.quantile(0.95))
        return (s_w - s_w.mean()) / (s_w.std() + 1e-5)
        
    df['z_discount'] = zscore(df['discount_from_high']) # Higher discount is better
    df['z_pe'] = -zscore(df['peRatio']) # Lower PE is better
    df['z_growth'] = zscore(df['C_growth']) # Higher growth is better
    
    # Weighting: 40% Discount, 30% Low P/E, 30% Growth
    df['deep_value_score'] = (0.4 * df['z_discount']) + (0.3 * df['z_pe']) + (0.3 * df['z_growth'])
    
    top_picks = df.sort_values('deep_value_score', ascending=False).head(30)
    
    print("\n" + "="*95)
    print("💎 TOP 30 DEEP VALUE TURNAROUNDS (Buy Low, Sell High) 💎")
    print("="*95)
    print(f"{'Company Name':<28} | {'P/E':<6} | {'Discount%':<10} | {'C-Grw%':<8} | {'Inst%':<6} | {'Score':<6}")
    print("-" * 95)
    
    for _, row in top_picks.iterrows():
        name = str(row['companyName'])[:26]
        pe = f"{row['peRatio']:.1f}"
        discount = f"{row['discount_from_high']*100:.1f}%"
        c = f"{row['C_growth']*100:.1f}"
        inst = f"{row['I_inst_hold']:.1f}"
        score = f"{row['deep_value_score']:.2f}"
        
        print(f"{name:<28} | {pe:<6} | {discount:<10} | {c:<8} | {inst:<6} | {score:<6}")

if __name__ == "__main__":
    score_deep_value()
