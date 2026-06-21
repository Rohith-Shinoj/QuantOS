import requests
import re

resp = requests.get("https://groww.in/indices/nifty")
change_match = re.search(r"<span[^>]*tickerUi_dayChange[^>]*>(.*?)</span>", resp.text)
print("Regex change match:", change_match.group(1) if change_match else None)

change_alt = re.search(r'dayChange[^>]*>([^<]+)<', resp.text)
print("Alt regex:", change_alt.group(1) if change_alt else None)
