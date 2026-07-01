import requests
from bs4 import BeautifulSoup

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

url = "https://trendlyne.com/stock-reports/broker-reports/"
res = requests.get(url, headers=headers)
print("Broker reports code:", res.status_code)
