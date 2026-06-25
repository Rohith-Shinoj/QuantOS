import os
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
import json
import torch
from quant_model import WalkForwardTransformer, CrossSectionalDataset

def masked_mse_loss(predictions, targets, binary_mask):
    squared_error = (predictions - targets) ** 2
    masked_error = squared_error * binary_mask
    active_stocks = torch.sum(binary_mask)
    if active_stocks == 0: return torch.tensor(0.0).to(predictions.device)
    return torch.sum(masked_error) / active_stocks

def verify():
    print("--- Loading Epoch 688 Weights for Verification ---")
    os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
    
    if torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")
        
    tensor_dir = "datasets/active/tensors"
    with open(os.path.join(tensor_dir, "tensor_meta.json"), 'r') as f:
        meta = json.load(f)
        
    model = WalkForwardTransformer(meta["num_continuous_features"], meta["num_sectors"]).to(device)
    model.load_state_dict(torch.load("ml_engine/models/pytorch/walk_forward_T1.pth"))
    model.eval()
    
    t = 688
    print(f"\nEvaluating Prediction for Day T={t+1} (using features from Day {t})")
    
    # Load just the slice for t=688
    from torch.utils.data import DataLoader
    ds = CrossSectionalDataset(tensor_dir, start_t=t, end_t=t+1, target_t=t+1)
    loader = DataLoader(ds, batch_size=1)
    
    for x, s_ids, pad_mask, y, bin_mask in loader:
        x, s_ids, pad_mask = x.to(device).squeeze(0), s_ids.to(device).squeeze(0), pad_mask.to(device).squeeze(0)
        y, bin_mask = y.to(device).squeeze(0), bin_mask.to(device).squeeze(0)
        
        with torch.no_grad():
            predictions = model(x, s_ids, pad_mask)
            test_loss = masked_mse_loss(predictions, y, bin_mask)
                
        print(f"-> Cross-Sectional MSE Error across all active stocks: {test_loss.item():.6f}")
        print(f"-> Predictions contains NaN: {torch.isnan(predictions).any().item()}")
        print(f"-> Targets contains NaN: {torch.isnan(y).any().item()}")
        
        # Let's show 5 random active stocks
        active_indices = torch.nonzero(bin_mask.squeeze(-1)).squeeze()
        print("\nSample Predictions vs Actual Returns (T+1):")
        for i in range(min(5, len(active_indices))):
            idx = active_indices[i].item()
            pred_ret = predictions[idx].item() * 100 # Convert to percentage
            actual_ret = y[idx].item() * 100
            slug = meta["slugs"][idx]
            print(f"Stock: {slug:<20} | Predicted T+1: {pred_ret:>6.2f}% | Actual T+1: {actual_ret:>6.2f}%")

if __name__ == "__main__":
    verify()
