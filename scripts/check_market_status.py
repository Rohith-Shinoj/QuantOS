import sys
import time
import requests

def get_latest_nifty_timestamp():
    end_ts = int(time.time() * 1000)
    start_ts = end_ts - (10 * 24 * 60 * 60 * 1000)
    url = f"https://groww.in/v1/api/charting_service/v2/chart/delayed/exchange/NSE/segment/CASH/NIFTY?endTimeInMillis={end_ts}&intervalInMinutes=1440&startTimeInMillis={start_ts}"
    
    try:
        resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}, timeout=10)
        if resp.status_code == 200:
            candles = resp.json().get("candles", [])
            if candles:
                # Last candle's timestamp
                return str(candles[-1][0])
    except Exception as e:
        pass
    
    # Fallback to returning the current date string if API fails, ensuring it runs anyway
    return time.strftime("%Y%m%d")

if __name__ == "__main__":
    print(get_latest_nifty_timestamp())
