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
        # Step 1: Hit Trendlyne research reports page for the ticker
        # Trendlyne automatically handles routing /stock/RELIANCE
        search_query = ticker.split('-')[0].split('_')[0]
        mc_link = f"https://trendlyne.com/research-reports/stock/{search_query}"
        
        page_res = requests.get(mc_link, headers=headers, timeout=8)
        
        if page_res.status_code != 200:
            return result
            
        soup = BeautifulSoup(page_res.text, 'html.parser')
        table = soup.find('table')
        
        if not table:
            return result
            
        rows = table.find_all('tr')
        
        # Skip header rows (typically first 2 rows are headers/consensus)
        # Limit to top 9 analyst targets
        for r in rows[2:11]:
            cells = r.find_all('td')
            if len(cells) > 8:
                date_str = cells[1].text.strip()
                broker = cells[3].text.replace('\n', '').replace('Target', '').strip()
                target_price_str = cells[5].text.strip()
                action_str = cells[8].text.strip()
                
                # Clean up target price (sometimes has "Target" text or commas)
                target_price_clean = target_price_str.replace('Target', '').replace(',', '').strip()
                
                # Standardize action
                action = 'HOLD'
                if 'buy' in action_str.lower() or 'accumulate' in action_str.lower() or 'add' in action_str.lower():
                    action = 'BUY'
                elif 'sell' in action_str.lower() or 'reduce' in action_str.lower():
                    action = 'SELL'
                    
                if date_str and broker and target_price_clean and target_price_clean != '-':
                    try:
                        # Validate it's a number
                        float(target_price_clean)
                        result.append({
                            'date': date_str,
                            'broker': broker,
                            'action': action,
                            'target_price': float(target_price_clean)
                        })
                    except ValueError:
                        continue
                        
        return result
        
    except Exception as e:
        print(f"Error fetching targets for {ticker}: {e}")
        pass
        
    return result
