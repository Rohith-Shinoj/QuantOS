import os
import argparse
import duckdb
import pandas as pd
import numpy as np
import torch
from quant_model import WalkForwardNet

def run_quant_inference(db_path, parquet_path):
    print(f"Running Deep Learning Quant Inference on {db_path}...")
    
    con = duckdb.connect(db_path)
    
    # Ensure column exists
    try:
        con.execute("ALTER TABLE stocks ADD COLUMN ai_t1_prediction DOUBLE")
    except:
        pass
        
    # Extract the features we just added in MLDatasetEngineer
    query = """
        SELECT 
            slug,
            CAST(json_extract_string(relative_data, '$.technical_state_signals.rsi_normalized') AS DOUBLE) as rsi,
            CAST(json_extract_string(relative_data, '$.technical_state_signals.distance_from_sma50') AS DOUBLE) as dist_sma,
            CAST(json_extract_string(relative_data, '$.technical_state_signals.bollinger_upper') AS DOUBLE) as bb_upper,
            CAST(json_extract_string(relative_data, '$.technical_state_signals.bollinger_lower') AS DOUBLE) as bb_lower,
            CAST(json_extract_string(relative_data, '$.relative_strength_signals.beta_vs_benchmark') AS DOUBLE) as beta,
            CAST(json_extract_string(relative_data, '$.health_scores.altman_z_proxy') AS DOUBLE) as altman
        FROM stocks
    """
    df = con.execute(query).df()
    
    # Fill NAs with 0 for PyTorch
    df = df.fillna(0.0)
    
    # Extract features tensor
    features = df[['rsi', 'dist_sma', 'bb_upper', 'bb_lower', 'beta', 'altman']].values
    
    # MOCK INFERENCE: If we had a fully trained PyTorch model, we would load the weights here.
    # Since this is a structural integration, we will initialize the model architecture 
    # and pass the features through it to prove the pipeline works end-to-end.
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = WalkForwardNet(num_features=6).to(device)
    model.eval()
    
    with torch.no_grad():
        x_tensor = torch.tensor(features, dtype=torch.float32).to(device)
        predictions = model(x_tensor).cpu().numpy().flatten()
        
    df['ai_t1_prediction'] = predictions
    
    # Update DuckDB
    print("Persisting T+1 predictions to DuckDB...")
    con.execute("CREATE TEMP TABLE update_q_data AS SELECT * FROM df")
    con.execute("""
        UPDATE stocks 
        SET 
            ai_t1_prediction = update_q_data.ai_t1_prediction
        FROM update_q_data 
        WHERE stocks.slug = update_q_data.slug
    """)
    
    print(f"Exporting PyTorch enriched data back to Parquet: {parquet_path}")
    con.execute(f"COPY stocks TO '{parquet_path}' (FORMAT PARQUET)")
    
    con.close()
    print("Deep Learning Walk-Forward Inference complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    parser.add_argument("--parquet", required=True)
    args = parser.parse_args()
    
    run_quant_inference(args.db, args.parquet)
