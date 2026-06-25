import pandas as pd
import numpy as np
import xgboost as xgb
import os
import json
from scipy.stats import pearsonr
from tqdm import tqdm

def train_walk_forward_xgboost(data_dir):
    print("Loading XGBoost Flat Dataset...")
    df = pd.read_parquet(os.path.join(data_dir, "xgboost_dataset.parquet"))
    with open(os.path.join(data_dir, "xgboost_meta.json"), 'r') as f:
        meta = json.load(f)
        
    features = meta['features']
    features.append('sector_id')
    
    df = df.sort_values('Date').reset_index(drop=True)
    dates = df['Date'].unique()
    
    # Walk Forward Configuration
    initial_train_days = 250
    step_days = 20 # Train and roll forward every ~1 month
    
    results = []
    
    print("\nInitiating Walk-Forward Training & Testing Loop...")
    for t_idx in tqdm(range(initial_train_days, len(dates), step_days), desc="XGBoost Walk-Forward"):
        current_date = dates[t_idx]
        
        # Train data cutoff (T-5) to prevent future data leakage from the T+5 target
        if t_idx - 5 < 0: continue
        train_cutoff = dates[t_idx - 5]
        
        test_end_idx = min(t_idx + step_days, len(dates) - 1)
        test_end_date = dates[test_end_idx]
        
        train_df = df[df['Date'] <= train_cutoff]
        test_df = df[(df['Date'] >= current_date) & (df['Date'] < test_end_date)]
        
        if len(train_df) == 0 or len(test_df) == 0:
            continue
            
        X_train = train_df[features]
        y_train = train_df['target_return_5d']
        
        X_test = test_df[features]
        y_test = test_df['target_return_5d']
        
        print(f"Training up to {pd.to_datetime(train_cutoff).strftime('%Y-%m-%d')} | Testing {pd.to_datetime(current_date).strftime('%Y-%m-%d')} to {pd.to_datetime(test_end_date).strftime('%Y-%m-%d')}", flush=True)
        
        model = xgb.XGBRegressor(
            n_estimators=100,
            learning_rate=0.05,
            max_depth=6,
            subsample=0.8,
            colsample_bytree=0.8,
            tree_method='hist',
            random_state=42,
            n_jobs=-1
        )
        
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        
        # Evaluate Out of Sample Information Coefficient (IC)
        test_df = test_df.copy()
        test_df['pred'] = preds
        
        daily_ic = []
        for d in test_df['Date'].unique():
            day_data = test_df[test_df['Date'] == d]
            if len(day_data) > 5:
                # Rank correlation
                ic, _ = pearsonr(day_data['pred'], day_data['target_return_5d'])
                if not np.isnan(ic):
                    daily_ic.append(ic)
                    
        avg_ic = np.mean(daily_ic) if daily_ic else 0
        print(f"-> Out-of-Sample IC: {avg_ic:.4f}", flush=True)
        results.append(avg_ic)
        
    final_ic = np.mean(results)
    print("\n=== FINAL TEST REPORT ===")
    print(f"Average Out-of-Sample IC (Rank Correlation): {final_ic:.4f}")
    if final_ic > 0.02:
        print("Result: EXCELLENT ALPHA. The model has statistically significant predictive power.")
    elif final_ic > 0.0:
        print("Result: WEAK ALPHA. The model has slight predictive power.")
    else:
        print("Result: NO ALPHA. The model is predicting noise.")
        
    print("\nTraining final model on all available data for live inference...")
    final_cutoff = dates[-6]
    final_train = df[df['Date'] <= final_cutoff]
    final_model = xgb.XGBRegressor(n_estimators=100, learning_rate=0.05, max_depth=6, subsample=0.8, colsample_bytree=0.8, tree_method='hist', n_jobs=-1)
    final_model.fit(final_train[features], final_train['target_return_5d'])
    
    os.makedirs("ml_engine/models/xgboost", exist_ok=True)
    final_model.save_model("ml_engine/models/xgboost/walk_forward_T5.json")
    print("Final model saved successfully to 'ml_engine/models/xgboost/walk_forward_T5.json'.")

if __name__ == "__main__":
    train_walk_forward_xgboost("datasets/active/tensors")
