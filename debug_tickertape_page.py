import requests
from bs4 import BeautifulSoup

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

url = "https://www.tickertape.in/stocks/reliance-industries-RELI?origin=search"
res = requests.get(url, headers=headers)
print("Page code:", res.status_code)
if res.status_code == 200:
    soup = BeautifulSoup(res.text, 'html.parser')
    # Check if we see forecast data
    print("Has forecast?", "forecast" in res.text.lower())
    print("Has analyst?", "analyst" in res.text.lower())
