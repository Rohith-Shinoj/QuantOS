import requests
from bs4 import BeautifulSoup
import re

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
        if 'moneycontrol.com/india/stockpricequote' in href:
            # Extract the actual URL
            actual_url = href
            if '/url?q=' in href:
                actual_url = href.split('/url?q=')[1].split('&')[0]
            print("Found URL:", actual_url)
            # Fetch from MC
            mc_res = requests.get(actual_url, headers=headers)
            print("MC Status:", mc_res.status_code)
            if mc_res.status_code == 200:
                print("Length:", len(mc_res.text))
            break
