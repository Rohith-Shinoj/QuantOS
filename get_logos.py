import os
import requests
import time
from tqdm import tqdm
from PIL import Image
from io import BytesIO

def download_logos():
    print("Fetching stocks from backend...")
    res = requests.get("http://localhost:8000/api/stocks")
    stocks = res.json()
    
    logo_dir = "/Users/rohith/groww/frontend/public/logos"
    os.makedirs(logo_dir, exist_ok=True)
    
    # Base URLs
    base_urls = [
        "https://assets-netstorage.groww.in/stock-assets/logos2/{}.webp",
        "https://assets-netstorage.groww.in/stock-assets/logos/GIDX{}.png",
        "https://assets-netstorage.groww.in/stock-assets/logos/{}.png"
    ]
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    count = 0
    for stock in tqdm(stocks, desc="Downloading Logos"):
        ticker = stock.get("ticker", "")
        if not ticker:
            continue
            
        target_path = os.path.join(logo_dir, f"{ticker}.webp")
        if os.path.exists(target_path):
            continue
            
        success = False
        for url_template in base_urls:
            url = url_template.format(ticker)
            try:
                r = requests.get(url, headers=headers, timeout=5)
                if r.status_code == 200:
                    try:
                        img = Image.open(BytesIO(r.content))
                        # Convert to RGBA then to RGB to handle transparency if saving as webp without alpha, or just save as webp directly
                        img.save(target_path, "WEBP")
                        success = True
                        count += 1
                        break
                    except Exception as e:
                        print(f"Error processing {ticker} from {url}: {e}")
            except Exception as e:
                pass
                
        if not success:
            # Just ignore if we can't find it, we'll fall back to text in UI
            pass

    print(f"Successfully downloaded {count} new logos. They are saved in {logo_dir}")

if __name__ == "__main__":
    download_logos()
