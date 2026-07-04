import duckdb
import json
from scripts.generate_datasets import TrendlyneFetcher
from datetime import datetime, timedelta
from nltk.sentiment.vader import SentimentIntensityAnalyzer

sia = SentimentIntensityAnalyzer()
sia.lexicon.update({
    'crushed': 0.7, 'beat': 0.8, 'missed': -0.8, 'liability': 0.0,
    'surged': 0.6, 'plunged': -0.8, 'bankruptcy': -0.9, 'default': -0.9,
    'growth': 0.4, 'profitable': 0.5, 'slashed': -0.4, 'downgraded': -0.6, 'upgraded': 0.6,
    'outperform': 0.6, 'underperform': -0.6, 'dividend': 0.4, 'buyback': 0.6,
    'debt': -0.4, 'lawsuit': -0.7, 'scandal': -0.8
})

con = duckdb.connect()
con.execute("CREATE TABLE stocks AS SELECT * FROM 'datasets/active/market_data.parquet'")

slug = "hcl-technologies-ltd"
ticker = "HCLTECH"

news = TrendlyneFetcher().get_news(ticker)

# Emulate ML pipeline
timeline = {}
now_time = datetime.now()
for i in range(13, -1, -1):
    d = (now_time - timedelta(days=i)).strftime('%b %d')
    timeline[d] = {"count": 0, "sum_sentiment": 0.0}

total_compound = 0.0
news_count = 0
raw_feed = []

for n in news:
    try:
        pub_date = datetime.fromisoformat(n["pubDate"].replace('Z', ''))
        diff_days = (now_time.date() - pub_date.date()).days
        if 0 <= diff_days <= 13:
            title = n["title"]
            score = sia.polarity_scores(title)['compound']
            d_str = pub_date.strftime('%b %d')
            if d_str in timeline:
                timeline[d_str]["count"] += 1
                timeline[d_str]["sum_sentiment"] += score
            total_compound += score
            news_count += 1
            raw_feed.append({
                "date": d_str,
                "title": title,
                "score": score,
                "tag": "General",
                "timestamp": pub_date.isoformat()
            })
    except: pass

sentiment_timeline = []
for d, stats in timeline.items():
    avg_sent = stats["sum_sentiment"] / stats["count"] if stats["count"] > 0 else 0
    velocity = (stats["count"] * 10) + (abs(avg_sent) * 20)
    sentiment_timeline.append({
        "name": d,
        "Sentiment": avg_sent,
        "Volume": stats["count"],
        "Velocity": velocity
    })

ewma = total_compound / news_count if news_count > 0 else 0
intensity = news_count / 14.0

row = con.execute("SELECT relative_data FROM stocks WHERE slug = ?", (slug,)).fetchone()
if row:
    rel_data = json.loads(row[0])
    rel_data["aggregated_news_signals"]["raw_feed"] = raw_feed
    rel_data["aggregated_news_signals"]["sentiment_timeline"] = sentiment_timeline
    rel_data["aggregated_news_signals"]["ewma_sentiment_all"] = ewma
    rel_data["aggregated_news_signals"]["news_intensity_velocity"] = intensity
    con.execute("UPDATE stocks SET relative_data = ? WHERE slug = ?", (json.dumps(rel_data), slug))

con.execute("COPY stocks TO 'datasets/active/market_data.parquet' (FORMAT PARQUET)")
con.close()
print("ML features patched successfully!")
