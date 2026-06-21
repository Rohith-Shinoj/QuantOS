import requests
import json
import re

url = "https://groww.in/stocks/state-bank-of-india/technicals"
headers = {'User-Agent': 'Mozilla/5.0'}
resp = requests.get(url, headers=headers)
match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', resp.text, re.DOTALL)
if match:
    data = json.loads(match.group(1))
    props = data.get("props", {}).get("pageProps", {})
    stock_data = props.get("stockData", {})
    news = stock_data.get("news", []) or props.get("newsData", [])
    print(json.dumps(news[:3], indent=2))
else:
    print("No match")
