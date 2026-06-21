import os
import requests
import re
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
from io import BytesIO
from tqdm import tqdm

logo_dir = "/Users/rohith/groww/frontend/public/logos"
os.makedirs(logo_dir, exist_ok=True)

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def process_stock(stock):
    slug = stock.get("slug")
    ticker = stock.get("ticker")
    if not slug or not ticker:
        return 0
        
    target_path = os.path.join(logo_dir, f"{ticker}.webp")
    if os.path.exists(target_path):
        # Already downloaded, but wait... maybe we want to retry if we didn't find it previously?
        # Actually, let's skip if we already downloaded it successfully.
        # But wait, what if the user wants all of them? If the file exists, it's valid.
        return 0

    is_index = "nifty" in slug or "sensex" in slug or "vix" in slug
    base_url = "https://groww.in/indices/" if is_index else "https://groww.in/stocks/"
    
    url = f"{base_url}{slug}"
    try:
        r = requests.get(url, headers=headers, timeout=5)
        if r.status_code == 404 and not is_index:
            r = requests.get(f"https://groww.in/indices/{slug}", headers=headers, timeout=5)
            
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, 'html.parser')
            logo_div = soup.find('div', class_=re.compile('companyLogo_logoContainer'))
            if logo_div:
                img = logo_div.find('img')
                if img and img.get('src'):
                    img_url = img.get('src')
                    if img_url.startswith('//'):
                        img_url = 'https:' + img_url
                    elif img_url.startswith('/'):
                        img_url = 'https://groww.in' + img_url
                        
                    # download image
                    img_resp = requests.get(img_url, headers=headers, timeout=5)
                    if img_resp.status_code == 200:
                        try:
                            image = Image.open(BytesIO(img_resp.content))
                            image.save(target_path, "WEBP")
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
        
    print(f"Scraping and downloading logos for {len(stocks)} stocks...")
    count = 0
    with ThreadPoolExecutor(max_workers=30) as executor:
        futures = [executor.submit(process_stock, s) for s in stocks]
        for future in tqdm(as_completed(futures), total=len(futures), desc="Scraping Logos"):
            count += future.result()

    print(f"Successfully scraped and downloaded {count} new logos.")

if __name__ == "__main__":
    download_logos()
