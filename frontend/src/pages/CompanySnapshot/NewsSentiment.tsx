import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { InfoTooltip } from '../../components/InfoTooltip';

export const NewsSentiment = ({ data }: { data: any }) => {
  const rel = data.relative || {};
  const aggregatedNews = rel.aggregated_news_signals || {};
  
  const chartData = aggregatedNews.sentiment_timeline && aggregatedNews.sentiment_timeline.length > 0
    ? aggregatedNews.sentiment_timeline
    : [];
    
  const slug = data.slug;
  const [liveFeed, setLiveFeed] = useState<any[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let isMounted = true;
    const fetchNews = async () => {
      setIsLoadingNews(true);
      try {
        const res = await fetch(`http://localhost:8000/api/news/${slug}`);
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

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Filter feed based on selectedDate
  const displayedFeed = selectedDate 
    ? rawFeed.filter((item: any) => item.date === selectedDate)
    : rawFeed;

  const handleChartClick = (e: any) => {
    if (e && e.activeLabel) {
      if (selectedDate === e.activeLabel) setSelectedDate(null); // Toggle off
      else setSelectedDate(e.activeLabel);
    }
  };

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
    <div className="bg-[#121214] p-5 rounded-xl border border-white/5 h-full flex flex-col col-span-1 md:col-span-2">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-medium text-text-primary flex items-center tracking-tight">
            News Sentiment Split Engine
            <InfoTooltip text="Interactive timeline of news intensity. Click on a spike to filter the live headline feed." />
          </h3>
          <p className="text-sm text-text-secondary mt-1">Quantifying narrative velocity and catalyst tags (Last 14 days)</p>
        </div>
        <div className="flex gap-4">
             <div>
                <p className="text-[10px] text-text-secondary uppercase font-bold tracking-widest">Aggregate Sentiment</p>
                <p className="text-lg font-bold text-text-primary">{rel.aggregated_news_signals?.ewma_sentiment_all?.toFixed(2) || 'Neutral'}</p>
             </div>
             <div>
                <p className="text-[10px] text-text-secondary uppercase font-bold tracking-widest">News Intensity</p>
                <p className="text-lg font-bold text-text-primary">{rel.aggregated_news_signals?.news_intensity_velocity?.toFixed(2) || 'Low'}</p>
             </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-[250px] gap-6">
        {/* Left Side: 60% Interactive Chart */}
        <div className="w-[60%] flex flex-col relative">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} onClick={handleChartClick}>
              <defs>
                <linearGradient id="colorVel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickMargin={10} />
              <YAxis stroke="#94a3b8" fontSize={10} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#141417', borderColor: '#27272a', color: '#f8fafc', borderRadius: '8px' }}
                cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 4' }}
                formatter={(value: any, name: any) => [Number(value).toFixed(2), name]}
                labelStyle={{ color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}
              />
              <Area 
                type="monotone" 
                dataKey="Velocity" 
                stroke="#3b82f6" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorVel)" 
                activeDot={{ r: 6, fill: '#3b82f6', stroke: '#121214', strokeWidth: 2, cursor: 'pointer' }}
              />
            </AreaChart>
          </ResponsiveContainer>
          {selectedDate && (
             <div className="absolute top-2 right-4 bg-surface p-2 rounded-md border border-border flex items-center gap-2 shadow-lg">
                <span className="text-xs text-text-secondary">Filtered: </span>
                <span className="text-xs font-bold text-alpha">{selectedDate}</span>
                <button onClick={() => setSelectedDate(null)} className="text-text-secondary hover:text-text-primary ml-2">×</button>
             </div>
          )}
        </div>

        {/* Right Side: 40% Micro-Feed */}
        <div className="w-[40%] bg-[#0a0a0b] rounded-lg border border-white/5 p-3 flex flex-col overflow-hidden">
          <div className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-3 pb-2 border-b border-white/10 flex justify-between items-center">
            <span>Live Headline Feed</span>
            {isLoadingNews ? (
               <span className="text-blue-400 animate-pulse text-[10px]">Fetching...</span>
            ) : (
               <span>{displayedFeed.length} Events</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
            {displayedFeed.length > 0 ? (
              displayedFeed.map((item: any, idx: number) => (
                <a 
                  key={idx} 
                  href={item.url || '#'}
                  target={item.url ? "_blank" : "_self"}
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-1.5 p-2.5 hover:bg-white/5 rounded-md transition-colors border border-transparent hover:border-white/5 block"
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
    </div>
  );
};
