import requests
from bs4 import BeautifulSoup
import re

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
query = "site:moneycontrol.com/india/stockpricequote/ reliance industries"
res = requests.get(f"https://html.duckduckgo.com/html/?q={query}", headers=headers)
print("DDG Status:", res.status_code)
if res.status_code == 200:
    soup = BeautifulSoup(res.text, 'html.parser')
    for a in soup.find_all('a', class_='result__snippet'):
        href = a.get('href')
        if href and 'stockpricequote' in href:
            print("Found URL via DDG:", href)
            # Try to fetch it
            mc_res = requests.get(href, headers=headers)
            print("MC Status:", mc_res.status_code)
            if mc_res.status_code == 200:
                print("Successfully loaded MC via direct link!")
            break
