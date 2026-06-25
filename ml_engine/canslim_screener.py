import pandas as pd

def score_canslim():
    df = pd.read_parquet('datasets/active/canslim/canslim_data.parquet')
    
    # 1. Base Filters: Eliminate Dead Stocks and Penny Stocks
    df = df[df['days_since_trade'] <= 10]
    df = df[df['latest_close'] >= 20]
    df = df[df['adtv'] >= 10_000_000] # 1 Crore
    
    # L - Leader: Top industries by average C_growth and A_growth
    industry_scores = df.groupby('industry')[['C_growth', 'A_growth']].mean().sum(axis=1)
    top_industries = industry_scores.nlargest(int(len(industry_scores)*0.3)).index
    df['L_leader'] = df['industry'].isin(top_industries)
    
    # CANSLIM Boolean Scoring
    df['score_C'] = (df['C_growth'] >= 0.25).astype(int)
    df['score_A'] = (df['A_growth'] >= 0.25).astype(int)
    df['score_N'] = df['N_near_high'].astype(int)
    df['score_S'] = df['S_vol_surge'].astype(int)
    df['score_L'] = df['L_leader'].astype(int)
    df['score_I'] = (df['I_inst_hold'] >= 5.0).astype(int) # >5% institutional
    
    df['canslim_score'] = df['score_C'] + df['score_A'] + df['score_N'] + df['score_S'] + df['score_L'] + df['score_I']
    
    top_picks = df.sort_values(['canslim_score', 'C_growth'], ascending=[False, False]).head(30)
    
    print("\n" + "="*95)
    print("🚀 TOP 30 STRICT CANSLIM CANDIDATES (Closest Matches) 🚀")
    print("="*95)
    print(f"{'Company Name':<30} | {'Industry':<20} | {'Score/6':<7} | {'C%':<6} | {'A%':<6} | {'Inst%':<6}")
    print("-" * 95)
    
    for _, row in top_picks.iterrows():
        name = str(row['companyName'])[:28]
        ind = str(row['industry'])[:18]
        score = f"{row['canslim_score']}/6"
        c = f"{row['C_growth']*100:.1f}"
        a = f"{row['A_growth']*100:.1f}"
        inst = f"{row['I_inst_hold']:.1f}"
        
        print(f"{name:<30} | {ind:<20} | {score:<7} | {c:<6} | {a:<6} | {inst:<6}")

if __name__ == "__main__":
    score_canslim()
