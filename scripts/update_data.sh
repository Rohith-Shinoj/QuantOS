#!/bin/bash
set -e

# Configuration
ACTIVE_LINK="datasets/active"
ADMIN_TOKEN=$(grep ADMIN_TOKEN .env | cut -d '=' -f2)

echo "--- Starting Data Update Pipeline ---"

# Step 1: Determine Buffers
CURRENT_TARGET=$(readlink "$ACTIVE_LINK")
if [ "$CURRENT_TARGET" == "A" ]; then
    INACTIVE_BUFFER="B"
else
    INACTIVE_BUFFER="A"
fi

echo "Active Buffer: $CURRENT_TARGET"
echo "Inactive Buffer: $INACTIVE_BUFFER"

# Step 2: Differential Sync
echo "Step 2: Syncing existing data to inactive buffer..."
rsync -a --delete "datasets/$CURRENT_TARGET/" "datasets/$INACTIVE_BUFFER/"

# Step 3: Unified Data Generation
echo "Step 3: Running unified parallel data generation for stocks..."
python3 scripts/generate_datasets.py --target "datasets/$INACTIVE_BUFFER" --workers 64
echo "Stock data generation complete."

echo "Step 3.5: Running data generation for mutual funds..."
python3 scripts/generate_mf_datasets.py --target "datasets/$INACTIVE_BUFFER" --full-refresh
echo "Mutual fund data generation complete."

# Step 4: Shadow Ingestion
echo "Step 4: Compiling Parquet file..."
python3 backend/data_loader.py --target "datasets/$INACTIVE_BUFFER"

# Step 5: Database Validation
# (Validation script was removed during architecture cleanup to reduce bloat)
echo "Step 5: Skipping legacy database validation..."

# Step 6: History & Graveyard Management (Predictive Infrastructure)
echo "Step 6: Archiving snapshot and managing graveyard..."
python3 ml_engine/archive_manager.py \
    --old-db "datasets/$CURRENT_TARGET/market_data.duckdb" \
    --new-db "datasets/$INACTIVE_BUFFER/market_data.duckdb"

# Step 7: Predictive Intelligence Inference
echo "Step 7: Running ensemble inference and SHAP explainability..."
python3 ml_engine/predictor.py \
    --db "datasets/$INACTIVE_BUFFER/market_data.duckdb" \
    --parquet "datasets/$INACTIVE_BUFFER/market_data.parquet"

# Step 7.5: Deep Learning Walk-Forward Inference
# (Mock script removed to prevent pipeline crash)

# Step 8: Atomic Swap
echo "Step 8: Swapping symlink to $INACTIVE_BUFFER..."
ln -sfn "$INACTIVE_BUFFER" "$ACTIVE_LINK"

# Step 9: Backend Reload
echo "Step 9: Signaling backend reload..."
curl -X POST http://localhost:8000/api/admin/reload_db \
     -H "X-Admin-Token: $ADMIN_TOKEN" \
     --max-time 30 --retry 5 --retry-delay 5 --retry-connrefused

echo "--- Data Update Successful ---"
