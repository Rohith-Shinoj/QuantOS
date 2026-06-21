import requests
import time
import json

def get_ohlcv(ticker, exchange="NSE"):
    end_ts = int(time.time() * 1000)
    start_ts = 1465756200000 
    url = f"https://groww.in/v1/api/charting_service/v2/chart/delayed/exchange/{exchange}/segment/CASH/{ticker}?endTimeInMillis={end_ts}&intervalInMinutes=10080&startTimeInMillis={start_ts}"
    print(f"URL: {url}")
    resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    if resp.status_code != 200:
        print(f"Error: {resp.status_code}")
        return None
    data = resp.json()
    return data.get("candles", [])

for t in ["NIFTY", "INDIAVIX"]:
    c = get_ohlcv(t)
    print(f"{t}: {len(c) if c else 'None'}")
