import os
from quant_model import test_and_fine_tune

if __name__ == "__main__":
    tensor_dir = "datasets/active/tensors"
    
    if not os.path.exists(os.path.join(tensor_dir, "market_features.pt")):
        print(f"Error: Could not find {tensor_dir}/market_features.pt")
        exit(1)
        
    # Execute the X-3 to X inference, testing, and sequential re-training
    test_and_fine_tune(tensor_dir, test_reserve=3)
