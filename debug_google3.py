import requests
from bs4 import BeautifulSoup
import urllib.parse

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

ticker = "RELIANCE"
query = f"site:moneycontrol.com/india/stockpricequote/ {ticker}"
res = requests.get(f"https://www.google.com/search?q={query}", headers=headers)
print("Google Status:", res.status_code)
if res.status_code == 200:
    soup = BeautifulSoup(res.text, 'html.parser')
    for a in soup.find_all('a'):
        href = a.get('href', '')
        if '/url?url=' in href or '/url?q=' in href:
            if 'moneycontrol.com/india/stockpricequote' in href:
                param = '/url?q=' if '/url?q=' in href else '/url?url='
                actual_url = href.split(param)[1].split('&')[0]
                actual_url = urllib.parse.unquote(actual_url)
                print("Found Target MC URL:", actual_url)
                
                # Test fetch
                mc_res = requests.get(actual_url, headers=headers)
                print("MC Status:", mc_res.status_code)
                if mc_res.status_code == 200:
                    mc_soup = BeautifulSoup(mc_res.text, 'html.parser')
                    broker_div = mc_soup.find('div', id='broker_research')
                    if broker_div:
                        items = broker_div.find_all('div', class_='brrs_bx')
                        print(f"Success! Found {len(items)} broker targets")
                break
