import requests

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

# Trendlyne Search API
search_url = "https://trendlyne.com/api/ac/search/?q=reliance"
res = requests.get(search_url, headers=headers)
print("Search code:", res.status_code)
if res.status_code == 200:
    print(res.json()[:2])
