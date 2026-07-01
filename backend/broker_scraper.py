import requests
from bs4 import BeautifulSoup
import re
from cachetools import cached, TTLCache

# Cache targets for 4 hours to avoid repeatedly hitting Moneycontrol for popular stocks
target_cache = TTLCache(maxsize=500, ttl=4 * 60 * 60)

@cached(cache=target_cache)
def fetch_broker_targets_from_mc(slug: str, ticker: str):
    """
    Fetches institutional targets directly from Moneycontrol on-the-fly.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
    }
    
    result = []
    
    try:
        # Step 1: Use autosuggest API to find the exact Moneycontrol link
        # Clean ticker (e.g. RELIANCE-EQ -> RELIANCE)
        search_query = ticker.split('-')[0].split('_')[0]
        search_url = f"https://www.moneycontrol.com/mccode/common/autosuggestion_solr.php?query={search_query}&type=1&format=json"
        
        res = requests.get(search_url, headers=headers, timeout=5)
        
        if res.status_code != 200:
            return result
            
        data = res.json()
        if not data or len(data) == 0:
            return result
            
        mc_link = None
        for item in data:
            if 'link_src' in item and 'india/stockpricequote' in item['link_src']:
                mc_link = item['link_src']
                break
                
        if not mc_link:
            return result
            
        # Step 2: Hit the actual stock page
        page_res = requests.get(mc_link, headers=headers, timeout=8)
        
        if page_res.status_code != 200:
            return result
            
        soup = BeautifulSoup(page_res.text, 'html.parser')
        broker_div = soup.find('div', id='broker_research')
        
        if not broker_div:
            return result
            
        items = broker_div.find_all('div', class_='brrs_bx')
        
        # Limit to 9 items as requested by frontend grid
        for item in items[:9]:
            date_div = item.find('div', class_='br_date')
            broker_h3 = item.find('h3')
            action_td = item.find('td', class_='str_buy') or item.find('td', class_='str_sell') or item.find('td', class_='str_hold')
            
            # Target Price typically inside the table next to "Target Price" label
            target_td = item.find('td', string=lambda text: text and 'Target Price' in text)
            
            target_price = None
            if target_td and target_td.find_next_sibling('td'):
                raw_target = target_td.find_next_sibling('td').text.strip()
                # Clean up comma parsing
                target_price = raw_target.replace(',', '')
                
            if date_div and broker_h3 and action_td and target_price and target_price != '-':
                # Standardize action string
                raw_action = action_td.text.strip().upper()
                action = 'HOLD'
                if 'BUY' in raw_action or 'ACCUMULATE' in raw_action or 'OUTPERFORM' in raw_action or 'ADD' in raw_action:
                    action = 'BUY'
                elif 'SELL' in raw_action or 'REDUCE' in raw_action or 'UNDERPERFORM' in raw_action:
                    action = 'SELL'
                    
                result.append({
                    'date': date_div.text.strip(),
                    'broker': broker_h3.text.strip(),
                    'action': action,
                    'target_price': float(target_price) if target_price.replace('.', '', 1).isdigit() else 0
                })
                
    except Exception as e:
        print(f"Error fetching targets for {ticker}: {e}")
        pass
        
    return result
