import os
from quant_model import train_walk_forward

if __name__ == "__main__":
    tensor_dir = "datasets/active/tensors"
    
    if not os.path.exists(os.path.join(tensor_dir, "market_features.pt")):
        print(f"Error: Could not find {tensor_dir}/market_features.pt")
        print("Please run tensor_builder.py first.")
        exit(1)
        
    print("Launching massive Walk-Forward Cross-Sectional Training Loop...")
    train_walk_forward(tensor_dir, epochs_per_window=5, fine_tune_only=False)
