#!/usr/bin/env python3
import os
import sys
import time
import shutil
import subprocess
from datetime import datetime
import urllib.request
import urllib.error

# Configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACTIVE_LINK = "datasets/active"
LAST_TS_FILE = "datasets/last_market_timestamp.txt"
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
NEW_BUFFER = f"datasets/run_{TIMESTAMP}"

def get_admin_token():
    try:
        with open('.env', 'r') as f:
            for line in f:
                if line.startswith('ADMIN_TOKEN='):
                    return line.strip().split('=', 1)[1]
    except FileNotFoundError:
        pass
    return ""

def run_cmd(cmd, allow_fail=False):
    print(f"\n=> Running: {' '.join(cmd)}")
    env = os.environ.copy()
    env["PYTHONPATH"] = "."
    res = subprocess.run(cmd, env=env)
    if res.returncode != 0 and not allow_fail:
        print(f"❌ Command failed with exit code {res.returncode}")
        sys.exit(1)
    return res.returncode

def main():
    # Guarantee we always execute from the root of the repository
    os.chdir(BASE_DIR)
    
    print("--- Starting Python Data Update Pipeline ---")
    
    force_update = "--force" in sys.argv
    
    workers_count = "32"
    if "--workers" in sys.argv:
        try:
            idx = sys.argv.index("--workers")
            workers_count = sys.argv[idx + 1]
        except (IndexError, ValueError):
            pass
    
    # Step 0: Check Market Status
    print("Step 0: Checking if market data has updated...")
    try:
        res = subprocess.run(["python3", "scripts/check_market_status.py"], capture_output=True, text=True, check=True)
        latest_ts = res.stdout.strip()
    except subprocess.CalledProcessError:
        latest_ts = "error"

    if latest_ts != "error" and not force_update and os.path.exists(LAST_TS_FILE):
        with open(LAST_TS_FILE, 'r') as f:
            prev_ts = f.read().strip()
        if latest_ts == prev_ts:
            print(f"Market data unchanged (Holiday/Weekend). Latest timestamp: {latest_ts}.")
            print("Aborting update to save compute resources. Use --force to override.")
            sys.exit(0)

    # Determine Current Buffer
    current_target = None
    if os.path.islink(ACTIVE_LINK):
        current_target = os.readlink(ACTIVE_LINK)
    
    print(f"Active Buffer: {current_target}")
    print(f"New Ephemeral Buffer: {NEW_BUFFER}")

    # Create New Buffer (Clean start)
    os.makedirs(NEW_BUFFER, exist_ok=True)
    
    try:
        print("\\nStep 3: Running unified parallel data generation for stocks...")
        run_cmd(["python3", "scripts/generate_datasets.py", "--target", NEW_BUFFER, "--workers", str(workers_count)])
        
        print("\\nStep 3.2: Running data generation for ETFs...")
        run_cmd(["python3", "scripts/generate_etf_datasets.py", "--target", NEW_BUFFER])
        
        print("\\nStep 3.5: Running data generation for mutual funds...")
        run_cmd(["python3", "scripts/generate_mf_datasets.py", "--target", NEW_BUFFER, "--full-refresh", "--extra-slugs", "mf_slugs.txt"])
        
        # Step 4: Shadow Ingestion
        print("\nStep 4: Compiling Parquet file...")
        run_cmd(["python3", "backend/data_loader.py", "--target", NEW_BUFFER])
        
        new_db_path = f"{NEW_BUFFER}/market_data.duckdb"

        # Step 8: Atomic Swap
        print("\nStep 8: Swapping symlink to new buffer...")
        
        # Preserve portfolio.json if it exists
        old_portfolio = f"{ACTIVE_LINK}/portfolio.json"
        new_portfolio = f"{NEW_BUFFER}/portfolio.json"
        if os.path.exists(old_portfolio):
            shutil.copy2(old_portfolio, new_portfolio)
            print(f"Copied {old_portfolio} to {new_portfolio}")
        new_buffer_basename = os.path.basename(NEW_BUFFER)
        # os.symlink cannot overwrite an existing link atomically directly without a temp link.
        temp_link = f"{ACTIVE_LINK}_tmp"
        if os.path.islink(temp_link) or os.path.exists(temp_link):
            os.remove(temp_link)
        os.symlink(new_buffer_basename, temp_link)
        os.replace(temp_link, ACTIVE_LINK)
        
        # Step 9: Save Timestamp
        if latest_ts != "error":
            with open(LAST_TS_FILE, "w") as f:
                f.write(latest_ts)
            print(f"\nStep 9: Saved latest market timestamp ({latest_ts}).")
            
        # Step 10: Backend Reload
        print("\nStep 10: Signaling backend reload...")
        admin_token = get_admin_token()
        req = urllib.request.Request("http://127.0.0.1:8000/api/admin/reload_db", method="POST")
        req.add_header("X-Admin-Token", admin_token)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                print("Backend reloaded successfully.")
        except Exception as e:
            print(f"Warning: Backend reload failed (or timed out): {e}")
            
        # Step 11: Snapshotting user portfolio
        print("\nStep 11: Snapshotting user portfolio...")
        run_cmd(["python3", "scripts/snapshot_portfolio.py"], allow_fail=True)
        
        # Step 12: Cleanup Old Buffers
        print("\nStep 12: Cleaning up old buffer...")
        for entry in os.listdir("datasets"):
            if entry.startswith("run_") and entry != new_buffer_basename:
                garbage_dir = os.path.join("datasets", entry)
                print(f"Removing outdated/abandoned buffer: {garbage_dir}")
                shutil.rmtree(garbage_dir, ignore_errors=True)
                
        print("\n--- Data Update Successful ---")

    except BaseException as e:
        print(f"\n❌ Pipeline failed or aborted: {e}")
        print(f"Cleaning up abandoned buffer: {NEW_BUFFER}")
        shutil.rmtree(NEW_BUFFER, ignore_errors=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
