import os
import requests
from tqdm import tqdm
from PIL import Image
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor, as_completed

logo_dir = "/Users/rohith/groww/frontend/public/logos"
os.makedirs(logo_dir, exist_ok=True)

base_urls = [
    "https://assets-netstorage.groww.in/stock-assets/logos2/{}.webp",
    "https://assets-netstorage.groww.in/stock-assets/logos/GIDX{}.png",
    "https://assets-netstorage.groww.in/stock-assets/logos/{}.png"
]

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def process_stock(stock):
    ticker = stock.get("ticker", "")
    if not ticker:
        return 0
        
    target_path = os.path.join(logo_dir, f"{ticker}.webp")
    if os.path.exists(target_path):
        return 0
        
    for url_template in base_urls:
        url = url_template.format(ticker)
        try:
            r = requests.get(url, headers=headers, timeout=5)
            if r.status_code == 200:
                try:
                    img = Image.open(BytesIO(r.content))
                    img.save(target_path, "WEBP")
                    return 1
                except Exception:
                    pass
        except Exception:
            pass
            
    return 0

def download_logos():
    print("Fetching stocks from backend...")
    try:
        res = requests.get("http://localhost:8000/api/stocks")
        stocks = res.json()
    except Exception as e:
        print(f"Error fetching stocks: {e}")
        return
        
    print(f"Processing {len(stocks)} stocks...")
    count = 0
    with ThreadPoolExecutor(max_workers=50) as executor:
        futures = [executor.submit(process_stock, s) for s in stocks]
        for future in tqdm(as_completed(futures), total=len(futures), desc="Downloading Logos"):
            count += future.result()

    print(f"Successfully downloaded {count} new logos. They are saved in {logo_dir}")

if __name__ == "__main__":
    download_logos()
