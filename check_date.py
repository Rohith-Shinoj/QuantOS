import requests
import json
try:
    r = requests.get('http://127.0.0.1:8000/api/stocks/nifty-total-market-index')
    data = r.json()
    ohlcv = data['absolute']['OHLCV']
    for d in ohlcv:
        if d['Date'].endswith('06-2023') or d['Date'].endswith('07-2023'):
            print(d['Date'], d['Close'])
except Exception as e:
    print(e)
