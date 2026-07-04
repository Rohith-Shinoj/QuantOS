import requests
from bs4 import BeautifulSoup
import re
from datetime import datetime

url = "https://trendlyne.com/latest-news/1127/RELIANCE/reliance-industries-ltd/"
res = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
soup = BeautifulSoup(res.text, 'html.parser')

news = []
for a in soup.find_all('a'):
    href = a.get('href', '')
    if '/news/article/' in href or '/news/' in href:
        title_text = re.sub(r'\s+', ' ', a.text).strip()
        if len(title_text) > 20 and 'Trendlyne' not in title_text and '|' not in title_text:
            news.append({'title': title_text, 'pubDate': datetime.now().isoformat() + "Z"})

for n in news[:5]:
    print(n)
