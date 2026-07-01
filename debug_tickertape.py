import requests

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

search_url = "https://api.tickertape.in/search?text=reliance&types=stock"
res = requests.get(search_url, headers=headers)
print("Search code:", res.status_code)
if res.status_code == 200:
    data = res.json()
    print("Found:", data['data']['stocks'][0]['ticker'])
    sid = data['data']['stocks'][0]['sid']
    print("SID:", sid)
    
    # Try fetching forecasts
    forecast_url = f"https://api.tickertape.in/stocks/forecasts/{sid}"
    f_res = requests.get(forecast_url, headers=headers)
    print("Forecast code:", f_res.status_code)
    if f_res.status_code == 200:
        print(f_res.json())
