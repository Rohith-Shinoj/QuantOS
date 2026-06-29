#!/bin/bash
set -e
NEW_BUFFER="datasets/run_20260629_203123"
ACTIVE_LINK="datasets/active"
CURRENT_TARGET=$(readlink "$ACTIVE_LINK" || echo "")

echo "Step 4: Compiling Parquet file..."
python3 backend/data_loader.py --target "$NEW_BUFFER"

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

echo "Step 8: Swapping symlink to new buffer..."
ln -sfn "$(basename "$NEW_BUFFER")" "$ACTIVE_LINK"

echo "--- Resume Successful ---"
