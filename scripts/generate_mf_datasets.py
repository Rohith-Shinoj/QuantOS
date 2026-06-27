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

def fetch_all_mutual_funds(target_dir, full_refresh=False, extra_slugs=None):
    all_funds = []
    page = 0
    size = 100
    base_url = "https://groww.in/v1/api/search/v3/query/filter_derived_data/st_filter"
    
    print(f"Fetching Mutual Funds data to {target_dir}...")
    
    with tqdm(desc="Fetching pages") as pbar:
        for idx_flag in ["false", "true"]:
            page = 0
            while True:
                try:
                    url = f"{base_url}?available_for_investment=true&doc_type=scheme&index={idx_flag}&page={page}&plan_type=Direct&scheme_type=Growth&size={size}&sort_by=3"
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
                    print(f"Error fetching page {page} with index={idx_flag}: {e}")
                    break
            
    # Explicitly fetch missing funds from the provided extra slugs file
    if extra_slugs and os.path.exists(extra_slugs):
        try:
            with open(extra_slugs, "r") as f:
                missing_slugs = [line.strip() for line in f if line.strip()]
            
            existing_slugs = set()
            for f in all_funds:
                if f.get("search_id"): existing_slugs.add(f["search_id"])
                if f.get("direct_search_id"): existing_slugs.add(f["direct_search_id"])
                if f.get("scheme_code"): existing_slugs.add(str(f["scheme_code"]))
                
            missing_slugs = [slug for slug in missing_slugs if slug not in existing_slugs]
            
            if missing_slugs:
                print(f"Fetching {len(missing_slugs)} extra funds manually...")
                for slug in missing_slugs:
                    try:
                        url = f"https://groww.in/mutual-funds/{slug}"
                        headers = {"User-Agent": "Mozilla/5.0"}
                        html = requests.get(url, headers=headers, timeout=10).text
                        soup = BeautifulSoup(html, "html.parser")
                        script = soup.find("script", id="__NEXT_DATA__")
                        if script:
                            data = json.loads(script.string)
                            mf_data = data.get("props", {}).get("pageProps", {}).get("mfServerSideData", {})
                            if mf_data:
                                fund = {
                                    "search_id": mf_data.get("search_id", slug),
                                    "direct_search_id": mf_data.get("direct_search_id", slug),
                                    "scheme_code": mf_data.get("scheme_code"),
                                    "direct_scheme_code": mf_data.get("direct_scheme_code"),
                                    "scheme_name": mf_data.get("scheme_name", slug.replace("-", " ").title()),
                                    "fund_name": mf_data.get("fund_name", ""),
                                    "category": mf_data.get("category", "Mutual Fund"),
                                    "sub_category": mf_data.get("sub_category", ""),
                                    "nav": mf_data.get("nav", 0),
                                    "amc": mf_data.get("amc", ""),
                                    "fund_house": mf_data.get("fund_house", ""),
                                    "return1y": mf_data.get("return_stats", {}).get("return1y", 0) if isinstance(mf_data.get("return_stats"), dict) else 0,
                                }
                                all_funds.append(fund)
                                print(f"Added extra fund: {slug}")
                    except Exception as e:
                        print(f"Failed to manually fetch {slug}: {e}")
        except Exception as e:
            print(f"Error reading extra slugs file: {e}")

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
    parser.add_argument("--extra-slugs", default="mf_slugs.txt", help="Text file with additional slugs to fetch")
    args = parser.parse_args()
    
    fetch_all_mutual_funds(args.target, args.full_refresh, args.extra_slugs)
