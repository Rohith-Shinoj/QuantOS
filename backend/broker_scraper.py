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
        # Trendlyne automatically handles routing /stocks/RELIANCE
        search_query = ticker.split('-')[0].split('_')[0]
        mc_link = f"https://trendlyne.com/research-reports/stocks/{search_query}"
        
        page_res = requests.get(mc_link, headers=headers, timeout=8)
        
        if page_res.status_code != 200:
            raise Exception(f"Trendlyne returned status {page_res.status_code}")
            
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
                # Parse Broker Name and Momentum Signals
                author_cell = cells[3]
                broker_a = author_cell.find('a')
                broker = broker_a.text.strip() if broker_a else author_cell.text.replace('\n', '').replace('Target', '').replace('Reco', '').strip()
                
                signals = []
                labels = author_cell.find_all('label')
                for label in labels:
                    txt = label.text.strip().lower()
                    i_tag = label.find('i')
                    if not i_tag: continue
                    alt_text = i_tag.get('alt', '').lower()
                    
                    signal_type = 'target' if 'target' in txt else 'reco' if 'reco' in txt else None
                    direction = 'up' if 'up' in alt_text else 'down' if 'down' in alt_text else None
                    if signal_type and direction:
                        signals.append({"type": signal_type, "direction": direction})

                target_price_str = cells[5].text.strip()
                price_at_reco_str = cells[6].text.strip().split('\n')[0].strip()
                upside_str = cells[7].text.strip().lower()
                is_target_met = 'target met' in upside_str
                action_str = cells[8].text.strip()
                
                # Clean up target price (sometimes has "Target" text or commas)
                target_price_clean = target_price_str.replace('Target', '').replace(',', '').strip()
                price_at_reco_clean = price_at_reco_str.replace(',', '').strip()
                
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
                        
                        price_at_reco = None
                        if price_at_reco_clean and price_at_reco_clean != '-':
                            try:
                                price_at_reco = float(price_at_reco_clean)
                            except ValueError:
                                pass
                                
                        result.append({
                            'date': date_str,
                            'broker': broker,
                            'action': action,
                            'target_price': float(target_price_clean),
                            'price_at_reco': price_at_reco,
                            'is_target_met': is_target_met,
                            'signals': signals
                        })
                    except ValueError:
                        continue
                        
        return result
        
    except Exception as e:
        print(f"Error fetching targets for {ticker}: {e}")
        pass
        
    return result
