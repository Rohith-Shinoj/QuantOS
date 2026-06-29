#!/bin/bash
set -e

# Configuration
ACTIVE_LINK="datasets/active"
ADMIN_TOKEN=$(grep ADMIN_TOKEN .env | cut -d '=' -f2)
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
NEW_BUFFER="datasets/run_$TIMESTAMP"
LAST_TS_FILE="datasets/last_market_timestamp.txt"

echo "--- Starting Data Update Pipeline ---"

# Step 0: Pre-flight Data-Driven Holiday/Weekend Check
echo "Step 0: Checking if market data has updated..."
LATEST_TS=$(python3 scripts/check_market_status.py || echo "error")

if [ "$LATEST_TS" != "error" ] && [ -f "$LAST_TS_FILE" ]; then
    PREV_TS=$(cat "$LAST_TS_FILE")
    if [ "$LATEST_TS" == "$PREV_TS" ]; then
        echo "Market data unchanged (Holiday/Weekend). Latest timestamp: $LATEST_TS."
        echo "Aborting update to save compute resources."
        exit 0
    fi
fi

# Step 1: Determine Current Buffer
CURRENT_TARGET=$(readlink "$ACTIVE_LINK" || echo "")

echo "Active Buffer: $CURRENT_TARGET"
echo "New Ephemeral Buffer: $NEW_BUFFER"

# Step 2: Create New Buffer
echo "Step 2: Creating new buffer from existing active data..."
if [ -n "$CURRENT_TARGET" ]; then
    # Ensure we use the correct path if readlink returned a basename
    TARGET_PATH="datasets/$(basename "$CURRENT_TARGET")"
    if [ -d "$TARGET_PATH" ]; then
        cp -r "$TARGET_PATH" "$NEW_BUFFER"
    else
        mkdir -p "$NEW_BUFFER"
    fi
else
    mkdir -p "$NEW_BUFFER"
fi

# Step 3: Unified Data Generation
echo "Step 3: Running unified parallel data generation for stocks..."
python3 scripts/generate_datasets.py --target "$NEW_BUFFER" --workers 32
echo "Stock data generation complete."

echo "Step 3.5: Running data generation for mutual funds..."
python3 scripts/generate_mf_datasets.py --target "$NEW_BUFFER" --full-refresh --extra-slugs mf_slugs.txt
echo "Mutual fund data generation complete."

# Step 4: Shadow Ingestion
echo "Step 4: Compiling Parquet file..."
python3 backend/data_loader.py --target "$NEW_BUFFER"

# Step 5: Database Validation
echo "Step 5: Skipping legacy database validation..."

# Step 6: History & Graveyard Management (Predictive Infrastructure)
echo "Step 6: Archiving snapshot and managing graveyard..."
if [ -n "$CURRENT_TARGET" ]; then
    TARGET_PATH="datasets/$(basename "$CURRENT_TARGET")"
    if [ -f "$TARGET_PATH/market_data.duckdb" ]; then
        python3 ml_engine/archive_manager.py \
            --old-db "$TARGET_PATH/market_data.duckdb" \
            --new-db "$NEW_BUFFER/market_data.duckdb"
    else
        python3 ml_engine/archive_manager.py \
            --old-db "$NEW_BUFFER/market_data.duckdb" \
            --new-db "$NEW_BUFFER/market_data.duckdb"
    fi
else
    python3 ml_engine/archive_manager.py \
        --old-db "$NEW_BUFFER/market_data.duckdb" \
        --new-db "$NEW_BUFFER/market_data.duckdb"
fi

# Step 7: Predictive Intelligence Inference
echo "Step 7: Running dual-engine inference and SHAP explainability..."
PYTHONPATH=. python3 ml_engine/predictor_2.py \
    --db "$NEW_BUFFER/market_data.duckdb" \
    --parquet "$NEW_BUFFER/market_data.parquet"

# Step 8: Atomic Swap
echo "Step 8: Swapping symlink to new buffer..."
# Use basename so symlink works if run from root directory
ln -sfn "$(basename "$NEW_BUFFER")" "$ACTIVE_LINK"

# Step 9: Save Timestamp
if [ "$LATEST_TS" != "error" ]; then
    echo "$LATEST_TS" > "$LAST_TS_FILE"
    echo "Step 9: Saved latest market timestamp ($LATEST_TS)."
else
    echo "Step 9: Failed to save market timestamp."
fi

# Step 10: Backend Reload
echo "Step 10: Signaling backend reload..."
curl -X POST http://localhost:8000/api/admin/reload_db \
     -H "X-Admin-Token: $ADMIN_TOKEN" \
     --max-time 30 --retry 5 --retry-delay 5 --retry-connrefused || true

echo "Step 11: Snapshotting user portfolio..."
python3 scripts/snapshot_portfolio.py || true

# Step 12: Cleanup Old Buffer
echo "Step 12: Cleaning up old buffer..."
if [ -n "$CURRENT_TARGET" ]; then
    TARGET_PATH="datasets/$(basename "$CURRENT_TARGET")"
    # Ensure we don't accidentally delete the newly created active buffer
    if [ -d "$TARGET_PATH" ] && [ "$TARGET_PATH" != "$NEW_BUFFER" ]; then
        echo "Removing outdated buffer: $TARGET_PATH"
        rm -rf "$TARGET_PATH"
    fi
fi

# Legacy architecture cleanup (A and B buffers)
for OLD_DIR in datasets/A datasets/B; do
    if [ -d "$OLD_DIR" ] && [ "$(readlink "$ACTIVE_LINK")" != "$(basename "$OLD_DIR")" ]; then
        echo "Removing legacy buffer: $OLD_DIR"
        rm -rf "$OLD_DIR"
    fi
done

echo "--- Data Update Successful ---"
