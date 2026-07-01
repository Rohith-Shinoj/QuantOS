import requests
from bs4 import BeautifulSoup
import re
import time

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

query = "site:moneycontrol.com/india/stockpricequote/ reliance industries"
res = requests.get(f"https://www.google.com/search?q={query}", headers=headers)
print("Google Status:", res.status_code)
if res.status_code == 200:
    soup = BeautifulSoup(res.text, 'html.parser')
    for a in soup.find_all('a'):
        href = a.get('href', '')
        if 'moneycontrol.com' in href and 'stockpricequote' in href and '/url?q=' in href:
            actual_url = href.split('/url?q=')[1].split('&')[0]
            print("Found URL:", actual_url)
            # Fetch from MC
            mc_res = requests.get(actual_url, headers=headers)
            print("MC Status:", mc_res.status_code)
            if mc_res.status_code == 200:
                print("Length:", len(mc_res.text))
                
                # Try to parse targets
                page_soup = BeautifulSoup(mc_res.text, 'html.parser')
                broker_div = page_soup.find('div', id='broker_research')
                if broker_div:
                    items = broker_div.find_all('div', class_='brrs_bx')
                    print(f"Found {len(items)} broker targets!")
            break
