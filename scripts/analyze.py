import re
import json

def analyze(file_path):
    with open(file_path, "r") as f:
        html = f.read()
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not match:
        return "No NEXT_DATA found"
    
    data = json.loads(match.group(1))
    props = data.get("props", {}).get("pageProps", {})
    
    print(f"\n--- Analysis for {file_path} ---")
    
    # 1. Look for livePriceData
    lpd = props.get("livePriceData", {})
    print("livePriceData keys:", list(lpd.keys()))
    for key, val in lpd.items():
        if isinstance(val, dict):
            print(f"[{key}] ltp: {val.get('ltp')}, dayChange: {val.get('dayChange')}, dayChangePerc: {val.get('dayChangePerc')}")
            
    # 2. Look for indexData or stockData
    if "indexData" in props:
        print("Has indexData!")
        stats = props["indexData"].get("stats", {})
        print("indexData.stats:", stats)
        header = props['indexData'].get('header', {})
        print('indexData.header:', {k: v for k, v in header.items() if k in ['dayChange', 'dayChangePerc', 'close', 'ltp', 'nseScriptCode', 'bseScriptCode']})
        script_code = header.get("nseScriptCode") or header.get("bseScriptCode")
        print("Script Code:", script_code)
        print("Matching LivePrice:", lpd.get(str(script_code)))
        livePrice = props["indexData"].get("livePrice", {})
        print("indexData.livePrice:", livePrice)
    elif "stockData" in props:
        print("Has stockData!")
        header = props["stockData"].get("header", {})
        print("stockData.header:", {k: v for k, v in header.items() if k in ['dayChange', 'dayChangePerc', 'close', 'ltp']})
        stats = props["stockData"].get("stats", {})
        print("stockData.stats:", stats)

analyze("scripts/sensex.html")
analyze("scripts/mcx.html")
