import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ChevronRight, BarChart2, Info, TrendingUp, TrendingDown, ArrowRight, Activity, ArrowUpRight, BrainCircuit, RefreshCw, Calendar } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLandingWidgets, fetchStockData, fetchMacroData, fetchBatchLiveQuotes, fetchBatchStockData } from '../api';
import Chart from 'react-apexcharts';
import { StockLogo } from '../components/StockLogo';
import { GlobalSearch } from '../components/GlobalSearch';
import { Skeleton } from '../components/Skeleton';
import type { ApexOptions } from 'apexcharts';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const filterSeriesByTimeframe = (seriesData: {x: number, y: number}[], timeframe: string, customRange?: {start: string, end: string}) => {
  if (seriesData.length === 0) return { filtered: [], min: 0, max: 0 };
  const now = seriesData[seriesData.length - 1].x;
  let threshold = 0;
  let endThreshold = Infinity;

  if (timeframe === 'CUSTOM' && customRange?.start && customRange?.end) {
    threshold = new Date(customRange.start).getTime();
    endThreshold = new Date(customRange.end).getTime();
  } else {
    let msToSubtract = 0;
    switch (timeframe) {
      case '5D': msToSubtract = 5 * 24 * 60 * 60 * 1000; break;
      case '1M': msToSubtract = 30 * 24 * 60 * 60 * 1000; break;
      case '3M': msToSubtract = 90 * 24 * 60 * 60 * 1000; break;
      case '6M': msToSubtract = 180 * 24 * 60 * 60 * 1000; break;
      case '1Y': msToSubtract = 365 * 24 * 60 * 60 * 1000; break;
      case '5Y': default: msToSubtract = 5 * 365 * 24 * 60 * 60 * 1000; break;
    }
    threshold = now - msToSubtract;
  }
  
  const filtered = seriesData.filter(d => d.x >= threshold && d.x <= endThreshold);
  
  if (filtered.length === 0) return { filtered: seriesData, min: 0, max: 0 };
  
  const minVal = Math.min(...filtered.map(d => d.y));
  const maxVal = Math.max(...filtered.map(d => d.y));
  const padding = (maxVal - minVal) * 0.05;
  
  return {
    filtered,
    min: minVal - padding,
    max: maxVal + padding
  };
};

const TIMEFRAMES = ['5D', '1M', '3M', '6M', '1Y', '5Y', 'CUSTOM'];

const TimeframeSelector = ({ 
  selected, 
  onSelect, 
  minimal = false,
  customRange,
  setCustomRange
}: { 
  selected: string, 
  onSelect: (t: string) => void, 
  minimal?: boolean,
  customRange?: { start: string, end: string },
  setCustomRange?: React.Dispatch<React.SetStateAction<{ start: string, end: string }>>
}) => {
  return (
    <div className="flex items-center gap-2 z-20">
      {selected === 'CUSTOM' && customRange && setCustomRange && (
        <div className={`flex items-center gap-1 ${minimal ? 'mr-1' : 'mr-2'}`}>
          <input 
            type="date" 
            value={customRange.start}
            onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
            className={`bg-surface border border-border text-text-primary rounded outline-none focus:border-alpha ${minimal ? 'text-[9px] px-1 py-0.5' : 'text-xs px-2 py-1'}`}
          />
          <span className={`text-text-secondary ${minimal ? 'text-[9px]' : 'text-xs'}`}>to</span>
          <input 
            type="date" 
            value={customRange.end}
            onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
            className={`bg-surface border border-border text-text-primary rounded outline-none focus:border-alpha ${minimal ? 'text-[9px] px-1 py-0.5' : 'text-xs px-2 py-1'}`}
          />
        </div>
      )}
      <div className={`flex items-center ${minimal ? 'gap-1 bg-surface border border-border p-0.5 rounded shadow-sm' : 'gap-1 bg-canvas border border-border p-1 rounded-lg'}`}>
        {TIMEFRAMES.map(t => (
          <button
            key={t}
            onClick={(e) => { e.stopPropagation(); onSelect(t); }}
            className={`${minimal ? 'text-[9px] px-1.5 py-0.5 rounded transition-colors flex items-center justify-center' : 'text-[10px] font-bold px-2 py-1 rounded transition-colors flex items-center justify-center'} ${selected === t ? (minimal ? 'text-alpha font-bold bg-alpha/10' : 'bg-surface text-alpha border border-border/50 shadow-sm') : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
          >
            {t === 'CUSTOM' ? <Calendar size={minimal ? 10 : 12} /> : t}
          </button>
        ))}
      </div>
    </div>
  );
};

// --- Helpers ---
const parseDayChange = (str: string) => {
  if (!str) return { abs: '0.00', pct: '0.00%', isPositive: true };
  const parts = str.match(/([+-]?\d+\.?\d*)/g);
  if (!parts) return { abs: '0.00', pct: '0.00%', isPositive: true };
  
  const abs = parseFloat(parts[0]);
  const pct = parts.length > 1 ? parseFloat(parts[1]) : 0.00;
  
  return {
    abs: Math.abs(abs).toFixed(2),
    pct: Math.abs(pct).toFixed(2) + '%',
    isPositive: abs >= 0
  };
};

// Fallback removed per strict data integrity rules

const formatMCap = (mcap: number) => {
  if (!mcap) return '---';
  if (mcap >= 1000) return `₹${(mcap / 1000).toFixed(1)}k Cr`;
  return `₹${mcap.toFixed(0)} Cr`;
};

// --- Components ---

const HorizontalStockCards = ({ title, stocks }: { title: string, stocks: any[] }) => {
  if (!stocks || stocks.length === 0) return null;
  return (
    <div className="mb-12">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-6 h-6 rounded-full overflow-hidden bg-white flex items-center justify-center p-1">
          <svg viewBox="0 0 512 512"><path fill="#FF9933" d="M0 0h512v170.6H0z"/><path fill="#FFF" d="M0 170.6h512v170.6H0z"/><path fill="#138808" d="M0 341.3h512V512H0z"/><circle fill="#000080" cx="256" cy="256" r="70"/></svg>
        </div>
        <h2 className="text-2xl font-bold text-text-primary hover:text-alpha cursor-pointer transition-colors flex items-center">
          {title} <ChevronRight size={20} />
        </h2>
      </div>
      
      <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
        {stocks.map(s => {
          const change = parseDayChange(s.day_change);
          return (
            <Link key={s.slug} to={`/stocks/${s.slug}`} className="min-w-[240px] bg-surface border border-border rounded-xl p-4 hover:border-alpha/50 transition-colors flex flex-col justify-between group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <StockLogo ticker={s.ticker} className="w-8 h-8" textClass="text-xs" fallbackClass="bg-canvas border border-border text-alpha" />
                  <div className="overflow-hidden pr-2">
                    <div className="font-bold text-sm text-text-primary group-hover:text-alpha transition-colors truncate">{s.ticker}</div>
                    <div className="text-[10px] text-text-secondary truncate">{s.name}</div>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-end mt-2">
                <div>
                  <div className="text-sm font-bold text-text-primary">{formatMCap(s.marketCap)}</div>
                  <div className="text-[10px] text-text-secondary">Market Cap</div>
                </div>
                <div className={`text-sm font-bold ${change.isPositive ? 'text-alpha' : 'text-beta'}`}>
                  {change.isPositive ? '+' : '-'}{change.pct}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

const MarketSummaryChart = ({ slug }: { slug: string }) => {
  const [timeframe, setTimeframe] = useState('1Y');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const { data: stockData, isLoading } = useQuery({ 
    queryKey: ['stockData', slug], 
    queryFn: () => fetchStockData(slug),
    enabled: !!slug,
    staleTime: Infinity
  });

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col bg-surface border border-border rounded-xl p-6 relative min-h-[300px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded" />
            <div>
              <Skeleton className="w-20 h-4 mb-2" />
              <div className="flex items-baseline gap-3 mt-1">
                <Skeleton className="w-32 h-8" />
                <Skeleton className="w-20 h-5" />
              </div>
            </div>
          </div>
          <Skeleton className="w-40 h-10 rounded-lg hidden md:block" />
        </div>
        <div className="flex-1 w-full mt-6">
          <Skeleton className="w-full h-full rounded bg-gradient-to-t from-surface-hover/20 to-transparent" />
        </div>
      </div>
    );
  }

  const ohlcv = stockData?.absolute?.OHLCV || [];
  const seriesData = ohlcv
    .filter((d: any) => d && d.Date)
    .map((d: any) => {
      return { x: new Date(d.Date).getTime(), y: d.Close };
    });

  const { filtered: chartData, min: yMin, max: yMax } = filterSeriesByTimeframe(seriesData, timeframe, customRange);

  const isPositive = chartData.length > 1 ? chartData[chartData.length - 1].y >= chartData[0].y : true;
  const color = isPositive ? '#10b981' : '#ef4444'; 

  let changeObj = { abs: '0.00', pct: '0.00%', isPositive: true };
  if (chartData.length > 1) {
    const firstPrice = chartData[0].y;
    const lastPrice = chartData[chartData.length - 1].y;
    const diff = lastPrice - firstPrice;
    const pct = firstPrice > 0 ? (diff / firstPrice) * 100 : 0;
    changeObj = {
      abs: Math.abs(diff).toFixed(2),
      pct: Math.abs(pct).toFixed(2) + '%',
      isPositive: diff >= 0
    };
  } else {
    const rawChangeStr = stockData?.absolute?.day_change || stockData?.absolute?.['day change'] || '';
    changeObj = parseDayChange(rawChangeStr);
  }

  const options: ApexOptions = {
    chart: { type: 'area', toolbar: { show: false }, background: 'transparent', animations: { enabled: false }, sparkline: { enabled: true } },
    stroke: { curve: 'straight', width: 2 },
    colors: [color],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.0, stops: [0, 100] } },
    xaxis: { type: 'datetime' },
    yaxis: { show: false, min: yMin, max: yMax },
    tooltip: { theme: 'dark', x: { format: 'dd MMM yyyy' }, y: { formatter: (val) => val.toFixed(2) } }
  };

  const latestPrice = seriesData.length > 0 ? seriesData[seriesData.length-1].y : 0;
  const ticker = stockData?.absolute?.ticker;
  
  return (
    <div className="w-full h-full flex flex-col bg-surface border border-border rounded-xl p-6 relative">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-4">
          <StockLogo ticker={ticker || ''} className="w-12 h-12 shadow-lg" textClass="text-xl" fallbackClass="bg-canvas border border-border text-text-primary" />
          <div>
            <div className="text-sm font-bold text-text-primary flex items-center gap-2 uppercase">
              {ticker || 'Loading...'} <span className="px-1.5 py-0.5 bg-canvas border border-border rounded text-[10px] text-text-secondary">{ticker?.includes('NIFTY') || ticker?.includes('SENSEX') || ticker?.includes('VIX') ? 'INDEX' : 'STOCK'}</span>
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-3xl font-bold text-text-primary tracking-tight">{latestPrice ? latestPrice.toFixed(2) : '---'}</span>
              {!(ticker?.includes('NIFTY') || ticker?.includes('SENSEX') || ticker?.includes('VIX')) && <span className="text-sm font-bold text-text-secondary">INR</span>}
              
              <div className={`flex items-center gap-1 text-sm font-bold px-2 py-0.5 rounded bg-surface border border-border ${changeObj.isPositive ? 'text-alpha' : 'text-beta'}`}>
                {changeObj.isPositive ? '+' : '-'}{changeObj.abs} ({changeObj.pct})
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <TimeframeSelector selected={timeframe} onSelect={setTimeframe} customRange={customRange} setCustomRange={setCustomRange} />
        </div>
      </div>
      <div className="flex-1 w-full min-h-[200px] relative overflow-hidden mt-2">
        {ticker && ticker.toLowerCase().includes('nifty') && (
          <div className="absolute top-4 left-4 z-20 bg-canvas/80 backdrop-blur border border-border px-3 py-2 rounded-lg">
            <div className="text-[10px] font-bold text-text-secondary uppercase">Market Trend</div>
            <div className="text-lg font-bold text-alpha">{isPositive ? 'Bullish' : 'Bearish'}</div>
          </div>
        )}
        <div className="absolute inset-0">
          {chartData.length > 0 ? (
            <Chart options={options} series={[{ name: ' ', data: chartData }]} type="area" height="100%" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-secondary text-sm">
              {!isLoading && "No historical charting data available for this asset."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ComplexMarketCard = ({ stock }: { stock: any }) => {
  const slug = stock.slug;
  const [timeframe, setTimeframe] = useState('1Y');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const { data: stockData } = useQuery({ 
    queryKey: ['stockData', slug], 
    queryFn: () => fetchStockData(slug),
    enabled: !!slug
  });

  const ohlcv = stockData?.absolute?.OHLCV || [];
  const seriesData = ohlcv
    .filter((d: any) => d && d.Date)
    .map((d: any) => {
      return { x: new Date(d.Date).getTime(), y: d.Close };
    });

  const { filtered: chartData, min: yMin, max: yMax } = filterSeriesByTimeframe(seriesData, timeframe, customRange);

  const rawChange = parseDayChange(stock.day_change);
  const change = rawChange;
  const color = change.isPositive ? '#10b981' : '#ef4444';

  const options: ApexOptions = {
    chart: { type: 'area', toolbar: { show: false }, background: 'transparent', animations: { enabled: false }, sparkline: { enabled: true } },
    stroke: { curve: 'straight', width: 1.5 },
    colors: [color],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.2, opacityTo: 0.0, stops: [0, 100] } },
    xaxis: { type: 'datetime' },
    yaxis: { show: false, min: yMin, max: yMax },
    tooltip: { theme: 'dark' }
  };
  
  const latestPrice = seriesData.length > 0 ? seriesData[seriesData.length-1].y : 0;
  const displayColor = change.isPositive ? 'text-alpha' : 'text-beta';

  return (
    <Link to={`/stocks/${slug}`} className="bg-surface border border-border rounded-xl flex flex-col h-[380px] overflow-hidden group">
      <div className="p-4 flex-1 flex flex-col border-b border-border cursor-pointer hover:bg-surface-hover transition-colors">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2 overflow-hidden pr-2">
            <StockLogo ticker={stock.ticker} className="w-6 h-6" textClass="text-[8px]" fallbackClass="bg-canvas border border-border text-text-primary" />
            <div className="text-sm font-bold text-text-primary group-hover:text-alpha transition-colors truncate">{stock.name}</div>
          </div>
        </div>
        <div className="mt-2">
          <div className="font-bold text-text-primary">{latestPrice ? latestPrice.toFixed(2) : '---'} <span className="text-xs text-text-secondary font-normal">INR</span></div>
          <div className={`text-[10px] font-bold ${displayColor}`}>{change.isPositive ? '+' : '-'}{change.pct}</div>
        </div>
        <div className="flex-1 w-full mt-2 min-h-[60px]">
          {chartData.length > 0 ? (
            <Chart options={options} series={[{ name: 'Price', data: chartData }]} type="area" height="100%" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-text-secondary">Loading...</div>
          )}
        </div>
      </div>
      
      <div className="p-4 h-[160px] bg-canvas/30">
        <div className="flex flex-col h-full justify-between">
          <div className="text-[10px] font-bold text-text-secondary mb-2 uppercase">{stock.industry || 'General'} Metrics</div>

          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-[10px] font-bold text-text-primary">Inst. Flow Rate</span>
            <span className={`text-[10px] font-bold ${stock.inst_accum > 0 ? 'text-alpha' : 'text-beta'}`}>{stock.inst_accum?.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-[10px] font-bold text-text-primary">Momentum (RS)</span>
            <span className="text-[10px] font-bold text-warning">{stock.rs_rating?.toFixed(1)}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-[10px] font-bold text-text-primary">Volatility Squeeze</span>
            <span className="text-[10px] font-bold text-text-secondary">{stock.v_squeeze ? stock.v_squeeze.toFixed(0) : '---'}</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

const MiniSectorCard = ({ stock, stockData, isLoading }: { stock: any, stockData?: any, isLoading?: boolean }) => {
  const slug = stock.slug;
  const [timeframe, setTimeframe] = useState('1Y');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });

  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-xl flex flex-col h-[200px] w-[220px] shrink-0 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="w-6 h-6 rounded" />
          <Skeleton className="w-24 h-4" />
        </div>
        <div className="mb-4">
          <Skeleton className="w-16 h-6 mb-2" />
          <Skeleton className="w-12 h-4" />
        </div>
        <div className="flex-1 w-full mt-2">
          <Skeleton className="w-full h-full rounded" />
        </div>
      </div>
    );
  }

  const ohlcv = stockData?.absolute?.OHLCV || [];
  const seriesData = ohlcv
    .filter((d: any) => d && d.Date)
    .map((d: any) => {
      return { x: new Date(d.Date).getTime(), y: d.Close };
    });

  const { filtered: chartData, min: yMin, max: yMax } = filterSeriesByTimeframe(seriesData, timeframe, customRange);

  const rawChange = parseDayChange(stock.day_change);
  const change = rawChange;
  const color = change.isPositive ? '#10b981' : '#ef4444';
  const displayColor = change.isPositive ? 'text-alpha' : 'text-beta';

  const fallbackName = slug.split('-').map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  const displayName = stock.name || fallbackName;

  const options: ApexOptions = {
    chart: { type: 'area', toolbar: { show: false }, background: 'transparent', animations: { enabled: false }, sparkline: { enabled: true } },
    stroke: { curve: 'straight', width: 1 },
    colors: [color],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.1, opacityTo: 0.0, stops: [0, 100] } },
    xaxis: { type: 'datetime', tooltip: { enabled: false } },
    yaxis: { show: false, min: yMin, max: yMax },
    tooltip: { 
      theme: 'dark', 
      x: { show: true, format: 'dd MMM yyyy' }, 
      y: { formatter: (val) => val.toFixed(2), title: { formatter: () => '' } },
      fixed: { enabled: false, position: 'topRight' }
    }
  };
  
  const latestPrice = seriesData.length > 0 ? seriesData[seriesData.length-1].y : 0;

  return (
    <div className="bg-surface border border-border rounded-xl flex flex-col h-[200px] w-[220px] shrink-0 p-4 hover:border-alpha/50 hover:scale-105 transition-all cursor-default overflow-visible group z-10 relative">
      <div className="flex items-center gap-2 mb-2">
        <StockLogo ticker={stock.ticker} className="w-6 h-6" textClass="text-[8px]" fallbackClass="bg-canvas border border-border text-alpha" />
        <div className="text-sm font-bold text-text-primary group-hover:text-alpha transition-colors truncate">{displayName}</div>
      </div>
      <div className="flex justify-between items-end mb-2">
        <div className="flex flex-col gap-1">
          <div className="text-lg font-bold text-text-primary">
            {latestPrice ? latestPrice.toFixed(2) : '---'}
          </div>
          <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface border border-border self-start ${displayColor}`}>
            {change.isPositive ? '+' : '-'}{change.abs} ({change.pct})
          </div>
        </div>
      </div>
      <div className="flex justify-start mb-2 overflow-x-auto hide-scrollbar -mx-1 px-1">
        <TimeframeSelector selected={timeframe} onSelect={setTimeframe} customRange={customRange} setCustomRange={setCustomRange} minimal={true} />
      </div>
      <div className="flex-1 w-full min-h-0 relative">
        <div className="absolute inset-0">
          {chartData.length > 0 && (
            <Chart options={options} series={[{ name: 'Value', data: chartData }]} type="area" height="100%" />
          )}
        </div>
      </div>
    </div>
  );
};

const CommodityRowCard = ({ stock }: { stock: any }) => {
  const slug = stock.slug;
  const [timeframe, setTimeframe] = useState('1Y');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const { data: stockData } = useQuery({ 
    queryKey: ['stockData', slug], 
    queryFn: () => fetchStockData(slug),
    enabled: !!slug
  });

  const ohlcv = stockData?.absolute?.OHLCV || [];
  const seriesData = ohlcv
    .filter((d: any) => d && d.Date)
    .map((d: any) => {
      return { x: new Date(d.Date).getTime(), y: d.Close };
    });

  const { filtered: chartData, min: yMin, max: yMax } = filterSeriesByTimeframe(seriesData, timeframe, customRange);

  const rawChange = parseDayChange(stock.day_change);
  const change = rawChange;
  const color = change.isPositive ? '#10b981' : '#ef4444';
  const displayColor = change.isPositive ? 'text-alpha' : 'text-beta';

  const options: ApexOptions = {
    chart: { type: 'area', toolbar: { show: false }, background: 'transparent', animations: { enabled: false }, sparkline: { enabled: true } },
    stroke: { curve: 'straight', width: 1.5 },
    colors: [color],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.15, opacityTo: 0.0, stops: [0, 100] } },
    xaxis: { type: 'datetime' },
    yaxis: { show: false, min: yMin, max: yMax },
    tooltip: { enabled: false }
  };
  
  const displayName = slug.includes('gold-bees') ? 'Gold' : slug.includes('silver-etf') ? 'Silver' : stock.name;

  return (
    <div className="bg-surface border border-border hover:border-alpha/50 rounded-xl p-5 flex flex-col h-[220px] transition-colors cursor-default group overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <StockLogo 
            ticker={slug.includes('gold') ? 'gold-metal' : slug.includes('silver') ? 'silver-metal' : stock.slug} 
            name={displayName} 
            className="w-10 h-10" 
            textClass="text-[12px]" 
            fallbackClass="bg-canvas border border-border text-text-primary" 
          />
          <div>
            <div className="text-base font-bold text-text-primary group-hover:text-alpha transition-colors">{displayName}</div>
            <div className={`text-xs font-bold mt-0.5 ${displayColor}`}>{change.pct}</div>
          </div>
        </div>
        <TimeframeSelector selected={timeframe} onSelect={setTimeframe} customRange={customRange} setCustomRange={setCustomRange} />
      </div>
      <div className="flex-1 w-full min-h-0 mt-2 relative">
        <div className="absolute inset-0">
          {chartData.length > 0 && (
            <Chart options={options} series={[{ name: ' ', data: chartData }]} type="area" height="100%" />
          )}
        </div>
      </div>
    </div>
  );
};

const IndexMarketCard = ({ stock, isActive, stockData, isLoading }: { stock: any, isActive: boolean, stockData?: any, isLoading?: boolean }) => {
  const slug = stock.slug;
  const [timeframe, setTimeframe] = useState('1Y');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });

  if (isLoading) {
    return (
      <div className={`bg-surface border border-border rounded-xl flex flex-col h-[280px] overflow-hidden`}>
        <div className="p-5 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded" />
              <Skeleton className="w-24 h-5" />
            </div>
            <Skeleton className="w-32 h-8 rounded-lg" />
          </div>
          <div className="mt-2">
            <Skeleton className="w-24 h-8 mb-2" />
            <Skeleton className="w-16 h-4" />
          </div>
          <div className="flex-1 w-full mt-6 relative">
            <Skeleton className="absolute inset-0 rounded-none bg-gradient-to-t from-surface-hover/20 to-transparent" />
          </div>
        </div>
      </div>
    );
  }

  const ohlcv = stockData?.absolute?.OHLCV || [];
  const seriesData = ohlcv
    .filter((d: any) => d && d.Date)
    .map((d: any) => {
      return { x: new Date(d.Date).getTime(), y: d.Close };
    });

  const { filtered: chartData, min: yMin, max: yMax } = filterSeriesByTimeframe(seriesData, timeframe, customRange);

  const rawChange = parseDayChange(stock.day_change);
  const change = rawChange;
  const color = change.isPositive ? '#10b981' : '#ef4444';

  const options: ApexOptions = {
    chart: { type: 'area', toolbar: { show: false }, background: 'transparent', animations: { enabled: false }, sparkline: { enabled: true } },
    stroke: { curve: 'straight', width: 1.5 },
    colors: [color],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.2, opacityTo: 0.0, stops: [0, 100] } },
    xaxis: { type: 'datetime' },
    yaxis: { show: false, min: yMin, max: yMax },
    tooltip: { theme: 'dark', x: { format: 'dd MMM yyyy' }, y: { formatter: (val) => val.toFixed(2) } }
  };
  
  const latestPrice = seriesData.length > 0 ? seriesData[seriesData.length-1].y : 0;
  const displayColor = change.isPositive ? 'text-alpha' : 'text-beta';

  return (
    <div className={`bg-surface border ${isActive ? 'border-alpha ring-1 ring-alpha shadow-lg shadow-alpha/10' : 'border-border'} rounded-xl flex flex-col h-[280px] overflow-hidden group cursor-pointer hover:border-alpha/50 transition-all`}>
      <div className="p-5 flex-1 flex flex-col transition-colors relative">
        <div className="flex flex-col gap-3 mb-2 relative z-10">
          <div className="flex justify-between items-start gap-4">
            <div className="flex items-center gap-3 overflow-hidden">
              <StockLogo ticker={stock.ticker} className="w-8 h-8 shrink-0" textClass="text-[10px]" fallbackClass="bg-canvas border border-border text-text-primary" />
              <div className="text-base font-bold text-text-primary group-hover:text-alpha transition-colors truncate">{stock.name}</div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <div className="text-xl font-bold text-text-primary tracking-tight">
                {latestPrice ? latestPrice.toFixed(2) : '---'}
              </div>
              <div className={`text-xs font-bold mt-0.5 ${displayColor}`}>
                {change.isPositive ? '+' : '-'}{change.abs} ({change.pct})
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <TimeframeSelector selected={timeframe} onSelect={setTimeframe} customRange={customRange} setCustomRange={setCustomRange} />
          </div>
        </div>
        <div className="flex-1 w-full mt-4 min-h-0 relative">
          <div className="absolute inset-0">
            {chartData.length > 0 ? (
              <Chart options={options} series={[{ name: ' ', data: chartData }]} type="area" height="100%" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-secondary text-[10px]">No Data</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MarketSectors = ({ macro }: { macro: any }) => {
  const sectors = macro?.sectors || [];

  if (!sectors.length) return null;

  return (
    <div className="mb-16 relative">
      <h2 className="text-2xl font-bold text-text-primary flex items-center gap-1 mb-6 hover:text-alpha cursor-pointer transition-colors">
        Top market sectors <ChevronRight size={20} />
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar relative">
        {sectors.map((sec: any, i: number) => (
          <div 
            key={i} 
            className={`min-w-[220px] bg-surface border rounded-xl p-4 flex flex-col justify-between transition-colors border-border hover:border-alpha/50`}
          >
            <div className="text-[10px] font-bold text-text-secondary mb-3">SECTOR MOMENTUM</div>
            <div className="flex items-center gap-3 mb-4">
              <img 
                src={`/logos/sector-logos/${sec.name.toLowerCase().replace(/ /g, '-')}.webp`} 
                alt={sec.name}
                className="w-8 h-8 rounded shrink-0 object-cover bg-canvas border border-border"
                onError={(e) => {
                   e.currentTarget.style.display = 'none';
                   if (e.currentTarget.nextElementSibling) {
                     (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                   }
                }}
              />
              <div className="hidden w-8 h-8 rounded bg-canvas border border-border items-center justify-center font-bold text-alpha text-xs uppercase shrink-0">
                {sec.name.substring(0,2)}
              </div>
              <div className="overflow-hidden pr-2">
                <div className="font-bold text-sm text-text-primary group-hover:text-alpha transition-colors truncate">{sec.name}</div>
                <div className="text-[10px] text-text-secondary truncate">{sec.count} Indexed Assets</div>
              </div>
            </div>
            <div className="flex justify-between items-end mt-2">
              <div>
                <div className="text-[8px] text-text-secondary">Avg RS Rating</div>
                <div className={`text-[12px] font-bold ${sec.rs_rating > 50 ? 'text-alpha' : 'text-beta'}`}>
                  {sec.rs_rating ? sec.rs_rating.toFixed(1) : '---'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[8px] text-text-secondary">Inst. Accum. QoQ</div>
                <div className={`text-[12px] font-bold ${sec.inst_accum > 0 ? 'text-alpha' : 'text-beta'}`}>
                  {sec.inst_accum > 0 ? '+' : ''}{(sec.inst_accum).toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

const StockListGrid = ({ stocks }: { stocks: any[] }) => {
  const validStocks = stocks?.filter((s: any) => s.ticker && s.day_change && (s.marketCap || 0) >= 5000) || [];
  
  const highestVolume = [...validStocks].sort((a, b) => (b.inst_accum || 0) - (a.inst_accum || 0)).slice(0, 5);
  const mostVolatile = [...validStocks].sort((a, b) => (b.rs_rating || 0) - (a.rs_rating || 0)).slice(0, 5);
  

  const List = ({ title, tooltip, data, metricFormat, metricColor, subtextFormat, stockTooltip }: any) => (
    <div>
      <div className="flex items-center gap-2 mb-6 group/header relative">
        <h2 className="text-2xl font-bold text-text-primary flex items-center gap-1 hover:text-alpha cursor-pointer transition-colors">
          {title} <ChevronRight size={20} />
        </h2>
        <div className="relative flex items-center justify-center">
          <Info size={16} className="text-text-secondary hover:text-text-primary cursor-help" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-surface border border-border rounded-lg shadow-xl text-xs text-text-secondary opacity-0 invisible group-hover/header:opacity-100 group-hover/header:visible transition-all z-50 pointer-events-none">
            {tooltip}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {data.map((s: any) => {
          const change = parseDayChange(s.day_change);
          return (
            <Link key={s.slug} to={`/stocks/${s.slug}`} className="flex justify-between items-center p-3 hover:bg-surface border-b border-border/30 last:border-0 rounded-lg group transition-colors">
              <div className="flex items-center gap-4">
                <StockLogo ticker={s.ticker} className="w-8 h-8 group-hover:opacity-80 transition-opacity" textClass="text-[10px]" fallbackClass="bg-surface border border-border text-alpha group-hover:bg-alpha/10 transition-colors" />
                <div className="overflow-hidden">
                  <div className="font-bold text-sm text-text-primary group-hover:text-alpha transition-colors flex items-center gap-2">
                    <span className="truncate max-w-[120px] md:max-w-[180px]">{s.name}</span>
                    <span className="px-1 py-0.5 bg-canvas rounded text-[8px] text-text-secondary border border-border uppercase shrink-0">{s.ticker}</span>
                  </div>
                  {subtextFormat && (
                    <div className="text-[10px] text-text-secondary mt-0.5 truncate">
                      {subtextFormat(s)}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex flex-col items-end w-16">
                  <div className={`text-[10px] text-text-secondary`}>Today</div>
                  <div className={`text-xs font-bold ${change.isPositive ? 'text-alpha' : 'text-beta'}`}>
                    {change.isPositive ? '+' : '-'}{change.pct}
                  </div>
                </div>
                <div className="relative group/pill flex items-center justify-center">
                  <div className={`text-sm font-bold px-3 py-1.5 rounded min-w-[80px] text-center border border-transparent group-hover:border-current transition-colors ${metricColor}`}>
                    {metricFormat(s)}
                  </div>
                  {stockTooltip && (
                    <div className="absolute top-1/2 -translate-y-1/2 right-[calc(100%+10px)] w-72 p-4 bg-surface border border-border rounded-lg shadow-2xl text-xs text-text-primary opacity-0 invisible group-hover/pill:opacity-100 group-hover/pill:visible transition-all z-[100] pointer-events-none">
                      {stockTooltip(s)}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <button className="mt-4 text-alpha text-sm font-bold hover:text-alpha-hover transition-colors">See all &gt;</button>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-16 mb-16">
      <List 
        title="Highest Institutional Accumulation" 
        tooltip="Ranks stocks by net institutional accumulation over the last quarter. A stock may have high accumulation but still experience short-term daily volatility."
        data={highestVolume} 
        metricColor="bg-alpha/10 text-alpha"
        metricFormat={(s: any) => `+${s.inst_accum?.toFixed(1)}% Inst. Holding`}
        stockTooltip={(s: any) => (
          <div className="flex flex-col gap-2">
            <div className="font-bold text-sm text-alpha border-b border-border/50 pb-2 mb-1">Institutional Flow</div>
            <div className="text-text-secondary">Institutions increased their net ownership in this company by <span className="text-alpha font-bold">{s.inst_accum?.toFixed(1)}%</span> over the last recorded quarter.</div>
          </div>
        )}
      />
      <List 
        title="Highest CANSLIM Momentum" 
        tooltip="Ranks stocks by Relative Score (RS) over a 52-week rolling basis. A stock scoring RS 99 is in the top 1% of structural momentum, regardless of today's price change."
        data={mostVolatile} 
        metricColor="bg-warning/10 text-warning"
        metricFormat={(s: any) => `Relative Score ${s.rs_rating?.toFixed(0)}`}
        stockTooltip={(s: any) => (
          <div className="flex flex-col gap-2">
            <div className="font-bold text-sm text-warning border-b border-border/50 pb-2 mb-1">Relative Strength Rating</div>
            <div className="text-text-secondary">This stock is outperforming <span className="text-warning font-bold">{s.rs_rating?.toFixed(0)}%</span> of the entire Indian stock market over a 1-year window.</div>
          </div>
        )}
      />

    </div>
  );
};

const TickerTapeItem = ({ asset }: { asset: any }) => {
  const navigate = useNavigate();
  const needsFetch = !asset.is_mf && (!asset.livePrice || !asset.day_change);
  const { data: stockData } = useQuery({ 
    queryKey: ['stockData', asset.slug], 
    queryFn: () => fetchStockData(asset.slug),
    enabled: needsFetch,
    staleTime: 60000 
  });

  let livePrice = asset.livePrice;
  let rawChange = asset.is_mf ? { isPositive: true, pct: asset.day_change, val: 0 } : parseDayChange(asset.day_change);

  let seriesData: any[] = [];
  if (needsFetch && stockData?.absolute?.OHLCV) {
    seriesData = stockData.absolute.OHLCV
      .filter((d: any) => d && d.Date)
      .map((d: any) => ({ y: d.Close }));

    if (seriesData.length > 0) {
       livePrice = String(seriesData[seriesData.length - 1].y);
    }
  }

  const change = rawChange;
  
  const isIndex = asset.slug.includes('nifty') || asset.slug.includes('sensex') || asset.slug.includes('vix');
  let cleanPrice = livePrice?.includes('₹') 
    ? livePrice.replace('₹', '') 
    : Number(livePrice || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  
  const priceDisplay = asset.is_mf ? `₹${cleanPrice}` : (isIndex ? cleanPrice : `₹${cleanPrice}`);

  const displayName = asset.ticker === '1' ? 'SENSEX' : asset.ticker;

  return (
    <div 
      className="inline-flex items-center justify-between w-[18rem] px-6 border-r border-border cursor-pointer hover:bg-surface-hover transition-colors h-8 shrink-0"
      onClick={() => navigate(asset.is_mf ? `/mutual-funds/${asset.slug}` : `/stocks/${asset.slug}`)}
    >
      <div className="flex items-center gap-3">
        {asset.is_mf && asset.logo_url ? (
           <img src={asset.logo_url} className="w-5 h-5 rounded-full bg-white object-contain shrink-0" alt="" />
        ) : (
           <StockLogo ticker={asset.ticker} className="w-5 h-5 border-white/20" textClass="text-[9px]" />
        )}
        <span className="font-bold text-[11px] text-text-primary uppercase tracking-wider truncate max-w-[130px]">{displayName}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-bold text-xs ${asset.is_mf ? 'text-text-primary' : (change.isPositive ? 'text-alpha' : 'text-beta')}`}>{priceDisplay}</span>
        <span className={`text-[10px] font-bold ${asset.is_mf || change.isPositive ? 'text-alpha' : 'text-beta'}`}>
          {change.isPositive && !asset.is_mf ? '+' : ''}{change.pct}
        </span>
      </div>
    </div>
  );
};

const KNOWN_INDICES = ['nifty', 'sp-bse-sensex', 'india-vix', 'nifty-bank', 'nifty-it', 'nifty-metal', 'nifty-smallcap-100', 'nifty-midcap', 'nifty-total-market-index'];

export const LandingPage = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: landingWidgets } = useQuery({ queryKey: ['landingWidgets'], queryFn: fetchLandingWidgets });
  const { data: macro } = useQuery({ queryKey: ['macroData'], queryFn: fetchMacroData });
  
  const majorStocks = landingWidgets?.market_caps || [];
  const instAccumStocks = landingWidgets?.inst_accum || [];
  const highMomentumStocks = landingWidgets?.rs_rating || [];
  const topFunds = (landingWidgets?.top_mfs || []).map((mf: any) => ({
    slug: mf.slug,
    ticker: mf.name,
    livePrice: '0',
    day_change: `${mf.return3y || 0}%`,
    logo_url: null,
    is_mf: true
  }));
  const topETFs = (landingWidgets?.top_etfs || []).map((etf: any) => ({
    slug: etf.slug,
    ticker: etf.ticker,
    name: etf.name,
    livePrice: '0',
    day_change: etf.day_change || '0.00 (0.00%)',
    logo_url: null
  }));
  
  const safeStocks = landingWidgets?.indices || [];

  const fallbackSlug = landingWidgets?.indices?.find((s: any) => s.slug === 'nifty')?.slug || safeStocks[0]?.slug;
  const [summarySlug, setSummarySlug] = useState<string | null>(null);

  const activeSlug = summarySlug || fallbackSlug;
  
  const indexAssets = landingWidgets?.indices || [];

  const coreSlugs = ['india-vix', 'sp-bse-sensex', 'multi-commodity-exchange-of-india-ltd'];
  const coreAssets = coreSlugs.map(s => (landingWidgets?.indices || []).find((stock: any) => stock.slug === s)).filter(Boolean);

  const sectorAssets = indexAssets.filter((a: any) => !['nifty', 'sp-bse-sensex', 'india-vix'].includes(a.slug));
  
  const commoditySlugs = ['reliance-etf-gold-bees', 'nippon-life-india-asset-management-ltd-nippon-india-silver-etf'];
  const commodityAssets = commoditySlugs.map(s => (landingWidgets?.indices || []).find((stock: any) => stock.slug === s)).filter(Boolean);

  const indicesToFetch = useMemo(() => {
    return Array.from(new Set([
      summarySlug,
      ...coreAssets.map((a: any) => a.slug),
      ...sectorAssets.map((a: any) => a.slug),
      ...commodityAssets.map((a: any) => a.slug)
    ])).filter(Boolean) as string[];
  }, [coreAssets, sectorAssets, commodityAssets, summarySlug]);

  const { data: batchStockData, isLoading: isBatchLoading } = useQuery({
    queryKey: ['batchStockData', indicesToFetch.join(',')],
    queryFn: async () => {
      if (indicesToFetch.length === 0) return null;
      const data = await fetchBatchStockData(indicesToFetch);
      Object.keys(data).forEach(slug => {
        queryClient.setQueryData(['stockData', slug], data[slug]);
      });
      return data;
    },
    enabled: indicesToFetch.length > 0,
    staleTime: Infinity
  });

  const [tickerMode, setTickerMode] = useState<'stocks' | 'etfs' | 'indices' | 'funds'>('stocks');
  const activeTickerItems = tickerMode === 'stocks' ? majorStocks.slice(0, 10) : (tickerMode === 'etfs' ? topETFs : (tickerMode === 'indices' ? indexAssets : topFunds));

  const handleSyncMarket = async () => {
    setIsSyncing(true);
    const trace: string[] = [];
    const tStart = performance.now();
    try {
        const slugsToSync = Array.from(new Set([
          ...(tickerMode === 'stocks' || tickerMode === 'indices' ? activeTickerItems.map((s: any) => s.slug) : []),
          ...majorStocks.map((s: any) => s.slug),
          ...indexAssets.map((s: any) => s.slug)
        ]));
      trace.push(`[${(performance.now() - tStart).toFixed(1)}ms] Extracted ${slugsToSync.length} slugs`);
      
      const tFetch = performance.now();
      const quotes = await fetchBatchLiveQuotes(slugsToSync);
      trace.push(`[${(performance.now() - tFetch).toFixed(1)}ms] fetchBatchLiveQuotes network call completed`);
      
      const tCache1 = performance.now();
      queryClient.setQueryData(['landingWidgets'], (old: any) => {
        if (!old) return old;
        const updateArray = (arr: any[]) => arr.map((stock: any) => {
          const q = quotes[stock.slug];
          if (q) {
            const isZero = q.dayChange === 0 && q.dayChangePerc === 0;
            return {
              ...stock,
              livePrice: String(q.currentPrice),
              day_change: isZero ? stock.day_change : `${q.dayChange > 0 ? '+' : ''}${q.dayChange} (${q.dayChangePerc?.toFixed(2)}%)`
            };
          }
          return stock;
        });
        
        return {
          ...old,
          market_caps: updateArray(old.market_caps || []),
          inst_accum: updateArray(old.inst_accum || []),
          rs_rating: updateArray(old.rs_rating || []),
          indices: updateArray(old.indices || [])
        };
      });
      trace.push(`[${(performance.now() - tCache1).toFixed(1)}ms] landingWidgets cache update completed`);
      
      const tCache2 = performance.now();
      slugsToSync.forEach(slug => {
        const q = quotes[slug];
        if (q) {
          queryClient.setQueryData(['stockData', slug], (old: any) => {
            if (!old) return old;
            const isZero = q.dayChange === 0 && q.dayChangePerc === 0;
            return {
              ...old,
              absolute: {
                ...old.absolute,
                'live price': String(q.currentPrice),
                'day change': isZero ? old.absolute['day change'] : `${q.dayChange > 0 ? '+' : ''}${q.dayChange} (${q.dayChangePerc?.toFixed(2)}%)`
              }
            };
          });
        }
      });
      trace.push(`[${(performance.now() - tCache2).toFixed(1)}ms] Individual stockData cache updates completed`);
      trace.push(`[${(performance.now() - tStart).toFixed(1)}ms] Total frontend handleSyncMarket execution time`);
      
      fetch(`${API_BASE_URL}/api/admin/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trace.join('\n') })
      }).catch(e => console.error("Log failed", e));
      
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  const hasSynced = React.useRef(false);
  React.useEffect(() => {
    if ((tickerMode === 'stocks' || tickerMode === 'indices') && activeTickerItems.length > 0 && !hasSynced.current) {
      hasSynced.current = true;
      handleSyncMarket();
    }
  }, [activeTickerItems, tickerMode]);

  return (
    <div className="bg-canvas flex flex-col">
      {/* Ticker Tape Controls */}
      <div className="w-full flex justify-center bg-surface border-b border-border py-1 relative z-10">
        <div className="flex items-center gap-1 bg-canvas rounded-md p-0.5 shadow-inner border border-border/50">
           <button 
             onClick={() => setTickerMode('stocks')}
             className={`text-[8px] font-bold px-4 py-0.5 rounded transition-all tracking-widest ${tickerMode === 'stocks' ? 'text-text-primary bg-surface-hover shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary border border-transparent'}`}
           >
             STOCKS
           </button>
           <button 
             onClick={() => setTickerMode('etfs')}
             className={`text-[8px] font-bold px-4 py-0.5 rounded transition-all tracking-widest ${tickerMode === 'etfs' ? 'text-text-primary bg-surface-hover shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary border border-transparent'}`}
           >
             ETFS
           </button>
           <button 
             onClick={() => setTickerMode('funds')}
             className={`text-[8px] font-bold px-4 py-0.5 rounded transition-all tracking-widest ${tickerMode === 'funds' ? 'text-text-primary bg-surface-hover shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary border border-transparent'}`}
           >
             MUTUAL FUNDS
           </button>
           <button 
             onClick={() => setTickerMode('indices')}
             className={`text-[8px] font-bold px-4 py-0.5 rounded transition-all tracking-widest ${tickerMode === 'indices' ? 'text-text-primary bg-surface-hover shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary border border-transparent'}`}
           >
             INDICES
           </button>
        </div>
      </div>

      {/* Ticker Tape */}
      <div className="w-full overflow-hidden bg-surface border-b border-border flex items-center h-8 select-none">
        {!activeTickerItems || activeTickerItems.length === 0 ? (
          <div className="w-full text-center text-xs text-text-secondary">Loading market data...</div>
        ) : (
          <div 
            className="flex whitespace-nowrap animate-ticker w-max"
            style={{ animationDuration: `${activeTickerItems.length * 4}s` }}
          >
            {[...activeTickerItems, ...activeTickerItems].map((s: any, idx: number) => (
              <TickerTapeItem key={`${s.slug}-${idx}`} asset={s} />
            ))}
          </div>
        )}
      </div>

      <div className="max-w-[1400px] mx-auto w-full px-6 lg:px-12 py-8">

        {/* Market Summary Layout */}
        <div className="mb-16 grid grid-cols-12 gap-6 items-stretch">
          <div className="col-span-12">
            <h2 className="text-2xl font-bold text-text-primary flex items-center gap-1 mb-6 hover:text-alpha cursor-pointer transition-colors">
              Market summary <ChevronRight size={20} />
            </h2>
          </div>
          
          {/* Left: Huge Chart */}
          <div className="col-span-12 lg:col-span-8 h-[500px] min-w-0 min-h-0">
            {activeSlug && <MarketSummaryChart slug={activeSlug} />}
          </div>
          
          {/* Major Market Caps Card */}
          <div className="col-span-12 lg:col-span-4 min-w-0 min-h-0 h-[500px]">
            <div className="bg-surface rounded-xl border border-border flex flex-col h-full w-full overflow-hidden">
              <div className="p-4 border-b border-border/50">
                <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider">Major market caps</h2>
              </div>
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {majorStocks.map((s: any) => {
                  const change = parseDayChange(s.day_change);
                  return (
                    <Link 
                      key={s.slug} 
                      className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition-colors mb-1 hover:bg-canvas border border-transparent`}
                      to={`/stocks/${s.slug}`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden pr-2">
                        <StockLogo 
                        ticker={s.ticker} 
                        className={`w-8 h-8 ${activeSlug === s.slug ? 'ring-2 ring-alpha ring-offset-2 ring-offset-surface' : ''}`}
                        fallbackClass={activeSlug === s.slug ? 'bg-alpha text-text-primary' : 'bg-surface-hover text-text-primary'} 
                      />
                        <div className="overflow-hidden flex-1 min-w-0">
                          <div className="font-bold text-sm text-text-primary truncate">{s.name}</div>
                          <div className="text-[10px] text-text-secondary uppercase">{s.ticker}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-text-primary">{formatMCap(s.marketCap)}</div>
                        <div className={`text-[10px] font-bold ${change.isPositive ? 'text-alpha' : 'text-beta'}`}>
                          {change.isPositive ? '+' : '-'}{change.pct}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <button className="m-4 py-2 bg-alpha/10 text-alpha font-bold text-sm rounded hover:bg-alpha/20 transition-colors">
                See all major stocks &gt;
              </button>
            </div>
          </div>

          {/* Row 2: Secondary Indicators */}
          {coreAssets.slice(0, 3).map((asset: any) => (
            <Link key={asset.slug} to={`/stocks/${asset.slug}`} className="col-span-12 md:col-span-4 min-w-0 min-h-0 block cursor-pointer transition-transform hover:-translate-y-1">
              <IndexMarketCard stock={asset} isActive={false} stockData={batchStockData?.[asset.slug]} isLoading={isBatchLoading} />
            </Link>
          ))}

          {/* Row 3: Sectoral & Market Breadth */}
          {sectorAssets.length > 0 && (
            <>
              <div className="col-span-12 min-w-0 min-h-0 mt-2">
                <h2 className="text-sm font-bold text-text-primary mb-2 uppercase tracking-wider">Sectoral & Market Breadth</h2>
              </div>
              <div className="col-span-12 min-w-0 min-h-0">
                <div className="flex gap-5 overflow-x-auto pb-6 pt-2 px-2 -mx-2 hide-scrollbar">
                  {sectorAssets.map((asset: any) => (
                    <MiniSectorCard key={asset.slug} stock={asset} stockData={batchStockData?.[asset.slug]} isLoading={isBatchLoading} />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Row 4: Precious Metals */}
          {commodityAssets.length > 0 && (
            <>
              <div className="col-span-12 min-w-0 min-h-0 mt-2">
                <h2 className="text-sm font-bold text-text-primary mb-2 uppercase tracking-wider">Precious Metals</h2>
              </div>
              {commodityAssets.map((asset: any) => (
                <div key={asset.slug} className="col-span-12 md:col-span-6 min-w-0 min-h-0">
                  <CommodityRowCard stock={asset} />
                </div>
              ))}
            </>
          )}

        </div> {/* End of Main 12-Column Grid Wrapper */}

        {/* Sectors Horizontal List with Expandable Interaction */}
        <MarketSectors macro={macro} />

        {/* True Quant Data Grid replacing Community Ideas & Images */}
        <StockListGrid stocks={safeStocks} />

      </div>
    </div>
  );
};
