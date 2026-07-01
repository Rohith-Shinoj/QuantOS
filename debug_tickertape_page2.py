import requests
import json
from bs4 import BeautifulSoup

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

url = "https://www.tickertape.in/stocks/reliance-industries-RELI"
res = requests.get(url, headers=headers)
if res.status_code == 200:
    soup = BeautifulSoup(res.text, 'html.parser')
    script = soup.find('script', id='__NEXT_DATA__')
    if script:
        data = json.loads(script.string)
        # We can dump the keys to see where forecast data is
        print(data['props']['pageProps'].keys())
        if 'stockInfo' in data['props']['pageProps']:
            print("Stock Info keys:", data['props']['pageProps']['stockInfo'].keys())
