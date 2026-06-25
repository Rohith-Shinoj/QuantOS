import pandas as pd
import xgboost as xgb
import os
import json

def run_live_inference():
    print("Loading XGBoost Model...")
    model = xgb.XGBRegressor()
    model.load_model("ml_engine/models/xgboost/walk_forward_T5.json")
    
    print("Loading Latest Market Data...")
    data_dir = "datasets/active/tensors"
    df = pd.read_parquet(os.path.join(data_dir, "xgboost_dataset.parquet"))
    
    with open(os.path.join(data_dir, "xgboost_meta.json"), 'r') as f:
        meta = json.load(f)
        
    features = meta['features']
    features.append('sector_id')
    
    # Get the absolute latest date available in the dataset
    latest_date = df['Date'].max()
    print(f"Executing predictions for live date: {pd.to_datetime(latest_date).strftime('%Y-%m-%d')}")
    
    latest_df = df[df['Date'] == latest_date].copy()
    
    # Predict
    X_live = latest_df[features]
    preds = model.predict(X_live)
    latest_df['predicted_return_5d'] = preds
    
    # Sort and get top 20
    top_20 = latest_df.sort_values('predicted_return_5d', ascending=False).head(20)
    
    print("\n" + "="*50)
    print(f"🔥 TOP 20 'BUY' SIGNALS FOR THE NEXT 5 DAYS 🔥")
    print("="*50)
    
    for i, (_, row) in enumerate(top_20.iterrows(), 1):
        slug = row['slug']
        pred = row['predicted_return_5d']
        print(f"{i:>2}. {slug:<30} | Expected T+5 Return: +{pred:.2f}%")
        
    print("="*50)

if __name__ == "__main__":
    run_live_inference()
