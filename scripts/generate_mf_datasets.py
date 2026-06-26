import os
import sys
import json
import argparse
import requests
from bs4 import BeautifulSoup
from time import sleep
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed

def scrape_detailed_data(search_id):
    url = f"https://groww.in/mutual-funds/{search_id}"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        html = requests.get(url, headers=headers, timeout=10).text
        soup = BeautifulSoup(html, "html.parser")
        script = soup.find("script", id="__NEXT_DATA__")
        if script:
            data = json.loads(script.string)
            mf_data = data.get("props", {}).get("pageProps", {}).get("mfServerSideData", {})
            return {
                "holdings": mf_data.get("holdings", []),
                "stats": mf_data.get("stats", [])
            }
    except Exception as e:
        pass
    return {"holdings": [], "stats": []}

def process_fund(fund):
    search_id = fund.get("direct_search_id") or fund.get("search_id")
    scheme_code = fund.get("direct_scheme_code") or fund.get("scheme_code")
    if search_id:
        details = scrape_detailed_data(search_id)
        fund["detailed_holdings"] = details["holdings"]
        fund["advanced_stats"] = details["stats"]
    
    if scheme_code:
        try:
            graph_url = f"https://groww.in/v1/api/data/mf/web/v1/scheme/{scheme_code}/graph?benchmark=false"
            headers = {"User-Agent": "Mozilla/5.0"}
            g_resp = requests.get(graph_url, headers=headers, timeout=10)
            if g_resp.status_code == 200:
                fund["historical_navs"] = g_resp.json().get("folio", {}).get("data", [])
        except Exception as e:
            pass

    return fund

def fetch_all_mutual_funds(target_dir, full_refresh=False):
    all_funds = []
    page = 0
    size = 100
    base_url = "https://groww.in/v1/api/search/v3/query/filter_derived_data/st_filter"
    
    print(f"Fetching Mutual Funds data to {target_dir}...")
    
    with tqdm(desc="Fetching pages") as pbar:
        while True:
            try:
                url = f"{base_url}?available_for_investment=true&doc_type=scheme&index=false&page={page}&plan_type=Direct&scheme_type=Growth&size={size}&sort_by=3"
                response = requests.get(url, timeout=10)
                response.raise_for_status()
                data = response.json()
                
                content = data.get("content", [])
                if not content:
                    break
                    
                all_funds.extend(content)
                pbar.update(1)
                pbar.set_postfix(funds=len(all_funds))
                
                if len(content) < size:
                    break
                    
                page += 1
                sleep(0.2)  # Polite delay
            except Exception as e:
                print(f"Error fetching page {page}: {e}")
                break
            
    # If full refresh is enabled, fetch detailed data
    if full_refresh:
        print(f"Starting FULL REFRESH: Scraping detailed data for {len(all_funds)} funds with 32 workers...")
        processed_funds = []
        with ThreadPoolExecutor(max_workers=32) as executor:
            futures = {executor.submit(process_fund, fund): fund for fund in all_funds}
            for future in tqdm(as_completed(futures), total=len(all_funds), desc="Scraping details"):
                processed_funds.append(future.result())
        all_funds = processed_funds
    else:
        # Load existing static data if it exists
        out_path = os.path.join(target_dir, "mutual_funds.json")
        if os.path.exists(out_path):
            with open(out_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                existing_map = {f.get("search_id"): f for f in existing_data if f.get("search_id")}
                for fund in all_funds:
                    search_id = fund.get("search_id")
                    if search_id in existing_map:
                        fund["detailed_holdings"] = existing_map[search_id].get("detailed_holdings", [])
                        fund["advanced_stats"] = existing_map[search_id].get("advanced_stats", [])

    # Save to JSON
    os.makedirs(target_dir, exist_ok=True)
    out_path = os.path.join(target_dir, "mutual_funds.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_funds, f, indent=2)
        
    print(f"Successfully saved {len(all_funds)} funds to {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True, help="Target buffer directory (e.g., datasets/B)")
    parser.add_argument("--full-refresh", action="store_true", help="Scrape detailed HTML for holdings and ratios")
    args = parser.parse_args()
    
    fetch_all_mutual_funds(args.target, args.full_refresh)
