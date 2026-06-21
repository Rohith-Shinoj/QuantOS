import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import { InfoTooltip } from '../../components/InfoTooltip';

export const NewsSentiment = ({ data }: { data: any }) => {
  const rel = data.relative || {};
  const aggregatedNews = rel.aggregated_news_signals || {};
  
  const chartData = aggregatedNews.sentiment_timeline && aggregatedNews.sentiment_timeline.length > 0
    ? aggregatedNews.sentiment_timeline
    : [];

  return (
    <div className="bg-surface p-6 rounded-lg border border-border h-full flex flex-col">
      <h3 className="text-lg font-medium text-text-primary mb-2 flex items-center">
        News Sentiment
        <InfoTooltip text="Aggregates recent news articles to gauge the current media narrative. Spikes in intensity often precede large price moves." />
      </h3>
      <p className="text-sm text-text-secondary mb-6">Tracking intensity of the news cycle (Last 10 days)</p>

      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorVel" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#141417', borderColor: '#27272a', color: '#f8fafc' }}
            />
            <Area type="monotone" dataKey="Velocity" stroke="#3b82f6" fillOpacity={1} fill="url(#colorVel)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
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
  );
};
