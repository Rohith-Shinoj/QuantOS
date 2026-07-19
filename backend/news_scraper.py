import requests
import re
import time
import numpy as np
from cachetools import cached, TTLCache

news_cache = TTLCache(maxsize=500, ttl=4 * 60 * 60)

@cached(cache=news_cache)
def fetch_live_news_from_trendlyne(slug: str, ticker: str):
    """
    Fetches live news directly from Trendlyne dynamically.
    Mirrors the scraper logic from generate_datasets but safely handled for live web API.
    """
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=64, pool_maxsize=64)
    session.mount('https://', adapter)
    session.mount('http://', adapter)
    
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
    })
    
    max_retries = 3
    backoff = 2
    for attempt in range(max_retries):
        try:
            # 1. Resolve ID via Redirect
            search_query = ticker.split('-')[0].split('_')[0]
            redirect_url = f"https://trendlyne.com/research-reports/stocks/{search_query}"
            res1 = session.head(redirect_url, allow_redirects=True, timeout=8)
            if res1.status_code == 429:
                wait = backoff ** (attempt + 1) + np.random.uniform(0, 1)
                time.sleep(wait)
                continue
                
            final_url = res1.url
            match = re.search(r'/stocks/(\d+)/([^/]+)/([^/]+)/', final_url)
            if not match:
                return []
                
            stock_id = match.group(1)
            canonical_slug = match.group(3)
            
            # 2. Fetch Latest News
            news_url = f"https://trendlyne.com/latest-news/{stock_id}/{search_query}/{canonical_slug}/"
            res2 = session.get(news_url, timeout=10)
            if res2.status_code == 429:
                wait = backoff ** (attempt + 1) + np.random.uniform(0, 1)
                time.sleep(wait)
                continue
                
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(res2.text, 'html.parser')
            
            # 3. Parse News
            news = []
            for a in soup.find_all('a', class_='newslink'):
                title = a.text.strip()
                parent = a.find_parent('div', class_='row')
                if parent:
                    summary = parent.find('div', class_='small').text.strip() if parent.find('div', class_='small') else ""
                    date_span = parent.find('span', class_='text-muted')
                    date_str = date_span.text.strip() if date_span else ""
                    news.append({
                        "title": title,
                        "summary": summary,
                        "date": date_str,
                        "url": a['href'] if a.has_attr('href') else "",
                        "tag": "General", # Dummy fallback
                        "score": 0.0 # Dummy fallback
                    })
                    
            # Basic fallback sentiment and tagging logic since VADER is heavy
            for n in news:
                title_lower = n["title"].lower()
                if "profit" in title_lower or "revenue" in title_lower or "q1" in title_lower or "q2" in title_lower or "q3" in title_lower or "q4" in title_lower:
                    n["tag"] = "Earnings"
                    n["score"] = 0.6
                elif "sebi" in title_lower or "probe" in title_lower:
                    n["tag"] = "Regulatory"
                    n["score"] = -0.5
                elif "order" in title_lower or "contract" in title_lower:
                    n["tag"] = "Order Win"
                    n["score"] = 0.5
                elif "debt" in title_lower or "default" in title_lower:
                    n["tag"] = "Credit Risk"
                    n["score"] = -0.8
                elif "acquire" in title_lower or "merger" in title_lower or "buyout" in title_lower:
                    n["tag"] = "M&A"
                    n["score"] = 0.3
                    
            unique_news = []
            for n in news:
                if not any(u["title"] == n["title"] for u in unique_news):
                    unique_news.append(n)
                    
            return unique_news[:15]
            
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"Error fetching live news for {ticker}: {e}")
                return []
            
    return []
