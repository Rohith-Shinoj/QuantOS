import requests
import json
try:
    r = requests.get('http://127.0.0.1:8000/api/stocks/nifty-total-market-index')
    data = r.json()
    if 'absolute' in data and 'OHLCV' in data['absolute']:
        print("Data length:", len(data['absolute']['OHLCV']))
        print("First:", data['absolute']['OHLCV'][0])
        print("Last:", data['absolute']['OHLCV'][-1])
except Exception as e:
    print(e)
