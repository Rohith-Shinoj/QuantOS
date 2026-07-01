import requests

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

search_url = "https://www.moneycontrol.com/mccode/common/autosuggestion.php?query=RELIANCE&type=1&format=json"
res = requests.get(search_url, headers=headers)
print("Search code:", res.status_code)
