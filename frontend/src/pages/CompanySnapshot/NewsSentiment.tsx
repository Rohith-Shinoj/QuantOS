import React, { useState, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

export const NewsSentiment = ({ data }: { data: any }) => {
  const rel = data.relative || {};
  const aggregatedNews = rel.aggregated_news_signals || {};
  const slug = data.slug;
  const [liveFeed, setLiveFeed] = useState<any[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let isMounted = true;
    const fetchNews = async () => {
      setIsLoadingNews(true);
      try {
        const VITE_API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
        const res = await fetch(`${VITE_API_BASE}/api/news/${slug}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const result = await res.json();
        if (isMounted && result.raw_feed) {
          setLiveFeed(result.raw_feed);
        }
      } catch (err) {
        console.error("Failed to fetch live news:", err);
      } finally {
        if (isMounted) setIsLoadingNews(false);
      }
    };
    fetchNews();
    return () => { isMounted = false; };
  }, [slug]);

  const rawFeed = liveFeed.length > 0 ? liveFeed : (aggregatedNews.raw_feed || []);

  const getTagColor = (tag: string) => {
    switch (tag) {
      case 'Earnings': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'Regulatory': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      case 'Credit Risk': return 'bg-red-500/20 text-red-500 border-red-500/30';
      case 'Order Win': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'M&A': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className="bg-surface p-5 rounded-xl border border-border h-full flex flex-col col-span-1">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 shrink-0 group relative w-fit cursor-help">
            News Catalyst Feed
            <HelpCircle size={14} className="text-text-secondary hover:text-text-primary transition-colors" />
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 bg-surface-hover text-text-primary text-[10px] p-2 rounded shadow-xl z-50 normal-case tracking-normal border border-border font-normal leading-relaxed">
              Live feed of major catalysts and their NLP sentiment scoring (VADER).
            </div>
          </h3>
          <p className="text-[10px] text-text-secondary mt-1 uppercase tracking-wider font-bold">Latest Headlines & Sentiment</p>
        </div>
        <div className="text-right flex flex-col items-end">
            <p className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">Aggregate Sentiment</p>
            <p className="text-sm font-bold text-text-primary">{aggregatedNews.ewma_sentiment_all !== undefined ? aggregatedNews.ewma_sentiment_all.toFixed(2) : 'Neutral'}</p>
        </div>
      </div>

      <div className="flex-1 bg-canvas rounded-lg border border-border p-3 flex flex-col overflow-hidden">
        <div className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-3 pb-2 border-b border-border flex justify-between items-center">
          <span>Live Headline Feed</span>
          {isLoadingNews ? (
             <span className="text-blue-400 animate-pulse text-[10px]">Fetching...</span>
          ) : (
             <span>{rawFeed.length} Events</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
          {rawFeed.length > 0 ? (
            rawFeed.map((item: any, idx: number) => (
              <a 
                key={idx} 
                href={item.url || '#'}
                target={item.url ? "_blank" : "_self"}
                rel="noopener noreferrer"
                className="group flex flex-col gap-1.5 p-2.5 hover:bg-white/5 rounded-md transition-colors border border-transparent hover:border-border block"
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] text-text-secondary font-medium shrink-0">{item.date}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase ${getTagColor(item.tag)}`}>
                      {item.tag}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${item.score > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : item.score < 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                      {item.score > 0 ? '+' : ''}{item.score?.toFixed(2)}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-text-primary leading-snug line-clamp-2" title={item.title}>
                  {item.title}
                </p>
                {item.summary && (
                   <p className="text-xs text-text-secondary leading-snug hidden group-hover:block mt-1 opacity-80">
                      {item.summary}
                   </p>
                )}
              </a>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-text-secondary text-xs italic opacity-50">
              <span>No major catalysts detected.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
