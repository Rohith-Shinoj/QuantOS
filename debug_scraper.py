import requests

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.moneycontrol.com/',
    'Origin': 'https://www.moneycontrol.com'
}

search_url = "https://www.moneycontrol.com/mccode/common/autosuggestion_solr.php?query=RELIANCE&type=1&format=json"

res = requests.get(search_url, headers=headers)
print("Search code:", res.status_code)
if res.status_code == 200:
    print(res.json()[:2])
