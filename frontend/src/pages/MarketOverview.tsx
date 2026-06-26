import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMacroData } from '../api';
import { ShieldAlert, TrendingUp, AlertOctagon, Activity } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AbsorptionHeatmap } from './AbsorptionHeatmap';
import { InfoTooltip } from '../components/InfoTooltip';

// Mock 52-week data for MVP visualization
const generateMockMacroHistory = () => {
  const data = [];
  const now = new Date();
  let nifty = 18000;
  let breadth = 60;
  for (let i = 52; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    nifty += (Math.random() - 0.45) * 500;
    breadth += (Math.random() - 0.5) * 15;
    breadth = Math.max(10, Math.min(90, breadth)); // bound between 10 and 90
    data.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      nifty: Math.round(nifty),
      breadth: Math.round(breadth),
    });
  }
  return data;
};
const mockMacroHistory = generateMockMacroHistory();

const GaugeCard = ({ title, value, status, icon: Icon, description, tooltipText }: any) => {
  const isPositive = status === 'positive';
  const isWarning = status === 'warning';
  const isNegative = status === 'negative';
  
  let colorClass = "text-text-primary bg-surface border-border";
  if (isPositive) colorClass = "text-alpha bg-alpha/10 border-alpha/30";
  if (isWarning) colorClass = "text-warning bg-warning/10 border-warning/30";
  if (isNegative) colorClass = "text-beta bg-beta/10 border-beta/30";

  return (
    <div className={`p-6 rounded-lg border ${colorClass} flex flex-col justify-between`}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="font-medium opacity-80">
          {title}
          {tooltipText && <InfoTooltip text={tooltipText} />}
        </h3>
        <Icon size={20} className="opacity-80" />
      </div>
      <div>
        <div className="text-3xl font-bold tabular-nums mb-1">{value}</div>
        <p className="text-sm opacity-60">{description}</p>
      </div>
    </div>
  );
};

import { Skeleton } from '../components/Skeleton';

export const MarketOverview = () => {
  const { data: macro, isLoading, error } = useQuery({
    queryKey: ['macro'],
    queryFn: fetchMacroData,
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto flex flex-col flex-1 gap-6 w-full">
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[500px]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
          <Skeleton className="col-span-1 lg:col-span-2 h-96 w-full" />
        </div>
      </div>
    );
  }
  if (error || !macro) return <div className="p-8 text-beta">Error loading macro data.</div>;

  const { regime, sectors, absorption } = macro;
  
  const breadthPct = (regime.breadth_pct * 100).toFixed(1);
  const breadthStatus = regime.breadth_pct < 0.3 ? 'negative' : regime.breadth_pct > 0.7 ? 'positive' : 'neutral';
  const vixStatus = regime.is_fear ? 'warning' : 'neutral';
  const trendStatus = regime.is_bull ? 'positive' : 'negative';

  return (
    <div className="p-8 max-w-[1600px] mx-auto flex flex-col flex-1 gap-6 w-full">
      <div>
        <h2 className="text-3xl font-bold text-text-primary">Market Overview</h2>
        <p className="text-text-secondary mt-1">System-wide indicators and market breadth summary.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GaugeCard 
          title="Market Breadth (50-DMA)" 
          value={`${breadthPct}%`}
          status={breadthStatus}
          icon={Activity}
          description="Percentage of stocks trading above their 50-day moving average."
          tooltipText="Measures the percentage of stocks in the market trading above their 50-day moving average. A value above 70% suggests a strong, healthy market, while below 30% suggests extreme weakness."
        />
        <GaugeCard 
          title="NIFTY Trend Ratio" 
          value={regime.nifty_trend.toFixed(3)}
          status={trendStatus}
          icon={TrendingUp}
          description={regime.is_bull ? "Primary Benchmark is in a Bull Regime." : "Primary Benchmark is in a Bear Regime."}
          tooltipText="A proprietary ratio comparing the NIFTY benchmark's short-term momentum against its long-term baseline. Used to determine the overall market stance."
        />
        <GaugeCard 
          title="Volatility (VIX) Status" 
          value={regime.vix_intensity.toFixed(2)}
          status={vixStatus}
          icon={regime.is_fear ? AlertOctagon : ShieldAlert}
          description={regime.is_fear ? "High Fear Regime active. Extreme volatility expected." : "Volatility is within normal baseline parameters."}
          tooltipText="Monitors the India VIX to gauge market fear. High fear signifies panic, which often aligns with contrarian buying opportunities."
        />
      </div>

      {regime.is_fear && (
        <div className="bg-beta/10 border border-beta p-4 rounded-lg flex items-center gap-4 text-beta">
          <AlertOctagon size={24} />
          <div>
            <h4 className="font-bold uppercase tracking-wider text-sm mb-1">Market Regime Alert: Defensive Stance</h4>
            <p className="text-sm opacity-90">High Fear Regime detected. The system is actively penalizing the AI Scores of stocks with high debt or high valuations to protect capital.</p>
          </div>
        </div>
      )}
      
      {!regime.is_fear && regime.is_bull && (
        <div className="bg-alpha/10 border border-alpha/30 p-4 rounded-lg flex items-center gap-4 text-alpha">
          <TrendingUp size={24} />
          <div>
            <h4 className="font-bold uppercase tracking-wider text-sm mb-1">Market Regime Alert: Bull Stance</h4>
            <p className="text-sm opacity-90">Constructive macro regime detected. The system is fully weighting the momentum indicators to capture outperformance.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[500px]">
        <div className="bg-surface p-6 rounded-lg border border-border flex flex-col">
          <h3 className="text-lg font-medium text-text-primary mb-6">
            Sector Performance
            <InfoTooltip text="Tracks which sectors are experiencing the heaviest institutional buying (accumulation) versus selling over the recent period." />
          </h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectors} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tick={{ width: 80 }} interval={0} angle={-25} textAnchor="end" height={80} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `${val.toFixed(1)}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#141417', borderColor: '#27272a', color: '#f8fafc' }}
                  itemStyle={{ color: '#10b981' }}
                  formatter={(val: any) => [`${Number(val).toFixed(2)}%`, 'Inst. Accumulation QoQ']}
                />
                <Bar dataKey="momentum" radius={[4, 4, 0, 0]}>
                  {sectors.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.momentum > 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <AbsorptionHeatmap data={absorption} />

        <div className="bg-surface p-6 rounded-lg border border-border flex flex-col col-span-1 lg:col-span-2">
          <h3 className="text-lg font-medium text-text-primary mb-6">
            Macro Divergence: NIFTY vs Market Breadth
            <InfoTooltip text="Plots the primary benchmark (NIFTY 50) against the underlying market breadth (percentage of stocks above 50-DMA). Divergences often signal trend reversals." />
          </h3>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockMacroHistory} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tick={{ fill: '#94a3b8' }} minTickGap={30} />
                <YAxis yAxisId="left" stroke="#3b82f6" fontSize={12} tickFormatter={(val) => val} domain={['auto', 'auto']} />
                <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={12} tickFormatter={(val) => `${val}%`} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#141417', borderColor: '#27272a', color: '#f8fafc' }}
                />
                <Line yAxisId="left" type="monotone" dataKey="nifty" name="NIFTY 50" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="breadth" name="Market Breadth %" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
