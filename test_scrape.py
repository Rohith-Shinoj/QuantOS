import requests
import re
from bs4 import BeautifulSoup

url = "https://groww.in/stocks/megasoft-ltd"
headers = {"User-Agent": "Mozilla/5.0"}
r = requests.get(url, headers=headers)
soup = BeautifulSoup(r.text, 'html.parser')
logo_div = soup.find('div', class_=re.compile('companyLogo_logoContainer'))
if logo_div:
    img = logo_div.find('img')
    if img:
        print("Megasoft Logo:", img.get('src'))

url = "https://groww.in/indices/nifty-bank"
r = requests.get(url, headers=headers)
soup = BeautifulSoup(r.text, 'html.parser')
logo_div = soup.find('div', class_=re.compile('companyLogo_logoContainer'))
if logo_div:
    img = logo_div.find('img')
    if img:
        print("Nifty Bank Logo:", img.get('src'))

