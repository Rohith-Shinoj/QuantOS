import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ChevronRight, BarChart2, Info, TrendingUp, TrendingDown, ArrowRight, Activity, ArrowUpRight, BrainCircuit } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks, fetchStockData, fetchMacroData } from '../api';
import Chart from 'react-apexcharts';
import { StockLogo } from '../components/StockLogo';
import type { ApexOptions } from 'apexcharts';

const filterSeriesByTimeframe = (seriesData: {x: number, y: number}[], timeframe: string) => {
  if (seriesData.length === 0) return { filtered: [], min: 0, max: 0 };
  const now = seriesData[seriesData.length - 1].x;
  let msToSubtract = 0;
  switch (timeframe) {
    case '5D': msToSubtract = 5 * 24 * 60 * 60 * 1000; break;
    case '1M': msToSubtract = 30 * 24 * 60 * 60 * 1000; break;
    case '3M': msToSubtract = 90 * 24 * 60 * 60 * 1000; break;
    case '6M': msToSubtract = 180 * 24 * 60 * 60 * 1000; break;
    case '1Y': msToSubtract = 365 * 24 * 60 * 60 * 1000; break;
    case '5Y': default: msToSubtract = 5 * 365 * 24 * 60 * 60 * 1000; break;
  }
  const threshold = now - msToSubtract;
  const filtered = seriesData.filter(d => d.x >= threshold);
  
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

const TIMEFRAMES = ['5D', '1M', '3M', '6M', '1Y', '5Y'];

const TimeframeSelector = ({ selected, onSelect, minimal = false }: { selected: string, onSelect: (t: string) => void, minimal?: boolean }) => {
  return (
    <div className={`flex items-center z-20 ${minimal ? 'gap-1 bg-surface border border-border p-0.5 rounded shadow-sm' : 'gap-1 bg-canvas border border-border p-1 rounded-lg'}`}>
      {TIMEFRAMES.map(t => (
        <button
          key={t}
          onClick={(e) => { e.stopPropagation(); onSelect(t); }}
          className={`${minimal ? 'text-[9px] px-1.5 py-0.5 rounded transition-colors' : 'text-[10px] font-bold px-2 py-1 rounded transition-colors'} ${selected === t ? (minimal ? 'text-alpha font-bold bg-alpha/10' : 'bg-surface text-alpha border border-border/50 shadow-sm') : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
        >
          {t}
        </button>
      ))}
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

const computeFallbackChange = (seriesData: {x: number, y: number}[], existingChange: any) => {
  if (existingChange.abs === '0.00' && seriesData.length >= 2) {
    const latest = seriesData[seriesData.length - 1].y;
    const prev = seriesData[seriesData.length - 2].y;
    const absDiff = latest - prev;
    const pctDiff = (absDiff / prev) * 100;
    return {
      abs: Math.abs(absDiff).toFixed(2),
      pct: Math.abs(pctDiff).toFixed(2) + '%',
      isPositive: absDiff >= 0
    };
  }
  return existingChange;
};

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
            <Link key={s.slug} to={`/terminal/${s.slug}`} className="min-w-[240px] bg-surface border border-border rounded-xl p-4 hover:border-alpha/50 transition-colors flex flex-col justify-between group">
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
  const { data: stockData, isLoading } = useQuery({ 
    queryKey: ['stockData', slug], 
    queryFn: () => fetchStockData(slug),
    enabled: !!slug
  });

  const ohlcv = stockData?.absolute?.OHLCV || [];
  const seriesData = ohlcv
    .filter((d: any) => d && d.Date)
    .map((d: any) => {
      const parts = d.Date.split('-');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return { x: new Date(`${year}-${month}-${day}`).getTime(), y: d.Close };
      }
      return { x: 0, y: d.Close };
    });

  const { filtered: chartData, min: yMin, max: yMax } = filterSeriesByTimeframe(seriesData, timeframe);

  const isPositive = chartData.length > 1 ? chartData[chartData.length - 1].y >= chartData[0].y : true;
  const color = isPositive ? '#10b981' : '#ef4444'; 

  const rawChangeStr = stockData?.absolute?.day_change || '';
  const changeObj = computeFallbackChange(seriesData, parseDayChange(rawChangeStr));

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
      {isLoading && <div className="absolute inset-0 bg-surface/80 z-10 flex items-center justify-center font-bold text-text-secondary rounded-xl">Loading real-time data...</div>}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <StockLogo ticker={ticker || ''} className="w-12 h-12 shadow-lg" textClass="text-xl" fallbackClass="bg-canvas border border-border text-text-primary" />
          <div>
            <div className="text-sm font-bold text-text-primary flex items-center gap-2 uppercase">
              {ticker || 'Loading...'} <span className="px-1.5 py-0.5 bg-canvas border border-border rounded text-[10px] text-text-secondary">{ticker?.includes('NIFTY') || ticker?.includes('SENSEX') || ticker?.includes('VIX') ? 'INDEX' : 'STOCK'}</span>
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-3xl font-bold text-text-primary tracking-tight">{latestPrice ? latestPrice.toFixed(2) : '---'}</span>
              {!(ticker?.includes('NIFTY') || ticker?.includes('SENSEX') || ticker?.includes('VIX')) && <span className="text-sm font-bold text-text-secondary">INR</span>}
              
              {/* Added Nifty Day Change Display */}
              <div className={`flex items-center gap-1 text-sm font-bold px-2 py-0.5 rounded bg-surface border border-border ${changeObj.isPositive ? 'text-alpha' : 'text-beta'}`}>
                {changeObj.isPositive ? '+' : '-'}{changeObj.abs} ({changeObj.pct})
              </div>
            </div>
          </div>
        </div>
        <TimeframeSelector selected={timeframe} onSelect={setTimeframe} />
      </div>
      <div className="flex-1 w-full min-h-[200px] relative overflow-hidden mt-2">
        {/* NIFTY Trend Overlay if available */}
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
  const { data: stockData } = useQuery({ 
    queryKey: ['stockData', slug], 
    queryFn: () => fetchStockData(slug),
    enabled: !!slug
  });

  const ohlcv = stockData?.absolute?.OHLCV || [];
  const seriesData = ohlcv
    .filter((d: any) => d && d.Date)
    .map((d: any) => {
      const parts = d.Date.split('-');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return { x: new Date(`${year}-${month}-${day}`).getTime(), y: d.Close };
      }
      return { x: 0, y: d.Close };
    });

  const rawChange = parseDayChange(stock.day_change);
  const change = computeFallbackChange(seriesData, rawChange);
  const color = change.isPositive ? '#10b981' : '#ef4444';

  const options: ApexOptions = {
    chart: { type: 'area', toolbar: { show: false }, background: 'transparent', animations: { enabled: false }, sparkline: { enabled: true } },
    stroke: { curve: 'straight', width: 1.5 },
    colors: [color],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.2, opacityTo: 0.0, stops: [0, 100] } },
    xaxis: { type: 'datetime' },
    yaxis: { show: false },
    tooltip: { theme: 'dark' }
  };
  
  const latestPrice = seriesData.length > 0 ? seriesData[seriesData.length-1].y : 0;
  const displayColor = change.isPositive ? 'text-alpha' : 'text-beta';

  return (
    <Link to={`/terminal/${slug}`} className="bg-surface border border-border rounded-xl flex flex-col h-[380px] overflow-hidden group">
      {/* Top Half: Chart */}
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
          {seriesData.length > 0 ? (
            <Chart options={options} series={[{ name: 'Price', data: seriesData }]} type="area" height="100%" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-text-secondary">Loading...</div>
          )}
        </div>
      </div>
      
      {/* Bottom Half: True Quant Data from API */}
      <div className="p-4 h-[160px] bg-canvas/30">
        <div className="flex flex-col h-full justify-between">
          <div className="text-[10px] font-bold text-text-secondary mb-2 uppercase">{stock.industry || 'General'} Metrics</div>
          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-[10px] font-bold text-text-primary">AI Alpha Score</span>
            <span className={`text-[10px] font-bold ${stock.alpha_score > 0 ? 'text-alpha' : 'text-beta'}`}>{(stock.alpha_score * 100).toFixed(2)}%</span>
          </div>
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

const MiniSectorCard = ({ stock }: { stock: any }) => {
  const slug = stock.slug;
  const [timeframe, setTimeframe] = useState('1Y');
  const { data: stockData } = useQuery({ 
    queryKey: ['stockData', slug], 
    queryFn: () => fetchStockData(slug),
    enabled: !!slug
  });

  const ohlcv = stockData?.absolute?.OHLCV || [];
  const seriesData = ohlcv
    .filter((d: any) => d && d.Date)
    .map((d: any) => {
      const parts = d.Date.split('-');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return { x: new Date(`${year}-${month}-${day}`).getTime(), y: d.Close };
      }
      return { x: 0, y: d.Close };
    });

  const { filtered: chartData, min: yMin, max: yMax } = filterSeriesByTimeframe(seriesData, timeframe);

  const rawChange = parseDayChange(stock.day_change);
  const change = computeFallbackChange(seriesData, rawChange);
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
      <div className="flex justify-between items-center mb-2">
        <div className="flex flex-col gap-1">
          <div className="text-lg font-bold text-text-primary">
            {latestPrice ? latestPrice.toFixed(2) : '---'}
          </div>
          <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface border border-border self-start ${displayColor}`}>
            {change.isPositive ? '+' : '-'}{change.abs} ({change.pct})
          </div>
        </div>
      </div>
      <div className="flex justify-end mb-2">
        <TimeframeSelector selected={timeframe} onSelect={setTimeframe} minimal={true} />
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
  const { data: stockData } = useQuery({ 
    queryKey: ['stockData', slug], 
    queryFn: () => fetchStockData(slug),
    enabled: !!slug
  });

  const ohlcv = stockData?.absolute?.OHLCV || [];
  const seriesData = ohlcv
    .filter((d: any) => d && d.Date)
    .map((d: any) => {
      const parts = d.Date.split('-');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return { x: new Date(`${year}-${month}-${day}`).getTime(), y: d.Close };
      }
      return { x: 0, y: d.Close };
    });

  const { filtered: chartData, min: yMin, max: yMax } = filterSeriesByTimeframe(seriesData, timeframe);

  const rawChange = parseDayChange(stock.day_change);
  const change = computeFallbackChange(seriesData, rawChange);
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
        <TimeframeSelector selected={timeframe} onSelect={setTimeframe} />
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

const IndexMarketCard = ({ stock, isActive }: { stock: any, isActive: boolean }) => {
  const slug = stock.slug;
  const [timeframe, setTimeframe] = useState('1Y');
  const { data: stockData } = useQuery({ 
    queryKey: ['stockData', slug], 
    queryFn: () => fetchStockData(slug),
    enabled: !!slug
  });

  const ohlcv = stockData?.absolute?.OHLCV || [];
  const seriesData = ohlcv
    .filter((d: any) => d && d.Date)
    .map((d: any) => {
      const parts = d.Date.split('-');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return { x: new Date(`${year}-${month}-${day}`).getTime(), y: d.Close };
      }
      return { x: 0, y: d.Close };
    });

  const { filtered: chartData, min: yMin, max: yMax } = filterSeriesByTimeframe(seriesData, timeframe);

  const rawChange = parseDayChange(stock.day_change);
  const change = computeFallbackChange(seriesData, rawChange);
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
      {/* Top Half: Chart */}
      <div className="p-5 flex-1 flex flex-col transition-colors relative">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3 overflow-hidden pr-2">
            <StockLogo ticker={stock.ticker} className="w-8 h-8" textClass="text-[10px]" fallbackClass="bg-canvas border border-border text-text-primary" />
            <div className="text-base font-bold text-text-primary group-hover:text-alpha transition-colors truncate">{stock.name}</div>
          </div>
          <TimeframeSelector selected={timeframe} onSelect={setTimeframe} />
        </div>
        <div className="mt-2 flex justify-between items-end">
          <div>
            <div className="text-2xl font-bold text-text-primary tracking-tight">
              {latestPrice ? latestPrice.toFixed(2) : '---'}
            </div>
            <div className={`text-sm font-bold mt-1 ${displayColor}`}>
              {change.isPositive ? '+' : '-'}{change.abs} ({change.pct})
            </div>
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

const MarketSectors = ({ macro, stocks }: { macro: any, stocks: any[] }) => {
  const sectors = macro?.sectors || [];
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  if (!sectors.length) return null;

  const sectorStocks = expandedSector 
    ? stocks.filter(s => s.industry === expandedSector).sort((a,b) => b.marketCap - a.marketCap).slice(0, 6)
    : [];

  return (
    <div className="mb-16 relative">
      <h2 className="text-2xl font-bold text-text-primary flex items-center gap-1 mb-6 hover:text-alpha cursor-pointer transition-colors">
        Top market sectors <ChevronRight size={20} />
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar relative">
        {sectors.map((sec: any, i: number) => (
          <div 
            key={i} 
            onClick={() => setExpandedSector(expandedSector === sec.name ? null : sec.name)}
            className={`min-w-[220px] bg-surface border rounded-xl p-4 flex flex-col justify-between transition-colors cursor-pointer group ${expandedSector === sec.name ? 'border-alpha bg-surface-hover shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-border hover:border-alpha/50'}`}
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
                <div className={`text-[12px] font-bold ${sec.momentum > 0 ? 'text-alpha' : 'text-beta'}`}>{(sec.momentum * 100).toFixed(1)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Expanded Sector Panel */}
      {expandedSector && (
        <div className="mt-4 p-6 bg-surface border border-alpha/30 rounded-xl animate-in slide-in-from-top-2 fade-in duration-200">
           <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
             <div className="w-2 h-2 bg-alpha rounded-full"></div> {expandedSector} Constituents
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
             {sectorStocks.map(s => {
               const change = parseDayChange(s.day_change);
               return (
                 <Link key={s.slug} to={`/terminal/${s.slug}`} className="bg-canvas border border-border p-4 rounded-lg hover:border-alpha/50 group transition-colors flex justify-between items-center">
                   <div className="flex items-center gap-3 overflow-hidden">
                     <StockLogo ticker={s.ticker} className="w-8 h-8" textClass="text-[10px]" fallbackClass="bg-surface border border-border text-alpha" />
                     <div className="overflow-hidden">
                       <div className="font-bold text-sm text-text-primary group-hover:text-alpha truncate">{s.name}</div>
                       <div className="text-[10px] text-text-secondary uppercase">{s.ticker}</div>
                     </div>
                   </div>
                   <div className="text-right shrink-0">
                     <div className="text-xs font-bold text-text-primary mb-1">{formatMCap(s.marketCap)}</div>
                     <div className={`text-[10px] font-bold ${change.isPositive ? 'text-alpha' : 'text-beta'}`}>
                       {change.isPositive ? '+' : '-'}{change.pct}
                     </div>
                   </div>
                 </Link>
               );
             })}
           </div>
        </div>
      )}
    </div>
  );
};

const StockListGrid = ({ stocks }: { stocks: any[] }) => {
  // Calculate High-Conviction Lists (Only >5000 Cr Market Cap to avoid small-cap/penny anomalies)
  const validStocks = stocks?.filter((s: any) => s.ticker && s.day_change && (s.marketCap || 0) >= 5000) || [];
  const highestVolume = [...validStocks].sort((a, b) => (b.inst_accum || 0) - (a.inst_accum || 0)).slice(0, 5);
  const mostVolatile = [...validStocks].sort((a, b) => (b.rs_rating || 0) - (a.rs_rating || 0)).slice(0, 5);
  const topGainers = [...validStocks].sort((a, b) => (b.alpha_score || 0) - (a.alpha_score || 0)).slice(0, 5);
  const topLosers = [...stocks].sort((a, b) => (a.alpha_score || 0) - (b.alpha_score || 0)).slice(0, 5);

  const List = ({ title, tooltip, data, metricFormat, metricColor }: any) => (
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
            <Link key={s.slug} to={`/terminal/${s.slug}`} className="flex justify-between items-center p-3 hover:bg-surface border-b border-border/30 last:border-0 rounded-lg group transition-colors">
              <div className="flex items-center gap-4">
                <StockLogo ticker={s.ticker} className="w-8 h-8 group-hover:opacity-80 transition-opacity" textClass="text-[10px]" fallbackClass="bg-surface border border-border text-alpha group-hover:bg-alpha/10 transition-colors" />
                <div className="overflow-hidden">
                  <div className="font-bold text-sm text-text-primary group-hover:text-alpha transition-colors flex items-center gap-2">
                    <span className="truncate max-w-[120px] md:max-w-[180px]">{s.name}</span>
                    <span className="px-1 py-0.5 bg-canvas rounded text-[8px] text-text-secondary border border-border uppercase shrink-0">{s.ticker}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex flex-col items-end w-16">
                  <div className={`text-[10px] text-text-secondary`}>Today</div>
                  <div className={`text-xs font-bold ${change.isPositive ? 'text-alpha' : 'text-beta'}`}>
                    {change.isPositive ? '+' : '-'}{change.pct}
                  </div>
                </div>
                <div className={`text-sm font-bold px-3 py-1.5 rounded min-w-[80px] text-center border border-transparent group-hover:border-current transition-colors ${metricColor}`}>
                  {metricFormat(s)}
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
        title="Institutional favorites" 
        tooltip="Ranks stocks by net institutional accumulation over the last quarter. A stock may have high accumulation but still experience short-term daily volatility."
        data={highestVolume} 
        metricColor="bg-alpha/10 text-alpha"
        metricFormat={(s: any) => `Flow +${s.inst_accum?.toFixed(1)}`}
      />
      <List 
        title="Momentum leaders" 
        tooltip="Ranks stocks by Relative Score (RS) over a 52-week rolling basis. A stock scoring RS 99 is in the top 1% of structural momentum, regardless of today's price change."
        data={mostVolatile} 
        metricColor="bg-warning/10 text-warning"
        metricFormat={(s: any) => `RS ${s.rs_rating?.toFixed(0)}`}
      />
      <List 
        title="Top AI Alpha" 
        tooltip="The AI Engine predicts forward 1-year outperformance probability. Today's price movement is distinct from the 1-year expected trajectory."
        data={topGainers} 
        metricColor="bg-alpha/10 text-alpha"
        metricFormat={(s: any) => `+${(s.alpha_score * 100)?.toFixed(1)}%`}
      />
      <List 
        title="Lowest AI Alpha" 
        tooltip="The AI Engine predicts a high probability of underperformance over the next 1-year. Even if the stock is up today, the structural outlook is negative."
        data={topLosers} 
        metricColor="bg-beta/10 text-beta"
        metricFormat={(s: any) => `${(s.alpha_score * 100)?.toFixed(1)}%`}
      />
    </div>
  );
};

const TickerTapeItem = ({ asset }: { asset: any }) => {
  const navigate = useNavigate();
  // Fetch missing data if livePrice is empty or missing
  const needsFetch = !asset.livePrice || !asset.day_change;
  const { data: stockData } = useQuery({ 
    queryKey: ['stockData', asset.slug], 
    queryFn: () => fetchStockData(asset.slug),
    enabled: needsFetch,
    staleTime: 60000 // Cache for 1 min
  });

  let livePrice = asset.livePrice;
  let rawChange = parseDayChange(asset.day_change);

  let seriesData: any[] = [];
  if (needsFetch && stockData?.absolute?.OHLCV) {
    seriesData = stockData.absolute.OHLCV
      .filter((d: any) => d && d.Date)
      .map((d: any) => ({ y: d.Close }));

    if (seriesData.length > 0) {
       livePrice = String(seriesData[seriesData.length - 1].y);
    }
  }

  const change = computeFallbackChange(seriesData, rawChange);
  
  const isIndex = asset.slug.includes('nifty') || asset.slug.includes('sensex') || asset.slug.includes('vix');
  let cleanPrice = livePrice?.includes('₹') 
    ? livePrice.replace('₹', '') 
    : Number(livePrice || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  
  const priceDisplay = isIndex ? cleanPrice : `₹${cleanPrice}`;

  const displayName = asset.ticker === '1' ? 'SENSEX' : asset.ticker;

  return (
    <div 
      className="inline-flex items-center justify-between w-72 px-5 border-r border-white/10 cursor-pointer hover:bg-surface-hover transition-colors h-10 shrink-0"
      onClick={() => navigate(`/terminal/${asset.slug}`)}
    >
      <div className="flex items-center gap-2">
        <StockLogo ticker={asset.ticker} className="w-5 h-5 border-white/20" textClass="text-[9px]" />
        <span className="font-bold text-[11px] text-text-primary uppercase tracking-wider truncate w-28">{displayName}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-bold text-xs ${change.isPositive ? 'text-alpha' : 'text-beta'}`}>{priceDisplay}</span>
        <span className={`text-[10px] font-bold ${change.isPositive ? 'text-alpha' : 'text-beta'}`}>
          {change.isPositive ? '+' : '-'}{change.pct}
        </span>
      </div>
    </div>
  );
};

export const LandingPage = () => {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const navigate = useNavigate();

  const { data: stocks } = useQuery({ queryKey: ['allStocks'], queryFn: fetchAllStocks });
  const { data: macro } = useQuery({ queryKey: ['macroData'], queryFn: fetchMacroData });
  
  const safeStocks = (stocks || []).filter((s: any) => 
    s && s.ticker && s.ticker !== 'N/A' && s.name && s.marketCap
  );

  const searchResults = React.useMemo(() => {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    return safeStocks.filter((s: any) => 
      (s.name && s.name.toLowerCase().includes(lowerQuery)) || 
      (s.ticker && s.ticker.toLowerCase().includes(lowerQuery))
    ).slice(0, 8);
  }, [query, safeStocks]);

  // Fetch the natively scraped NIFTY index
  const fallbackSlug = (stocks || []).find((s: any) => s.slug === 'nifty')?.slug || safeStocks[0]?.slug;
  const [summarySlug, setSummarySlug] = useState<string | null>(null);

  const activeSlug = summarySlug || fallbackSlug;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      const match = safeStocks.find((s: any) => 
        s.ticker.toLowerCase() === query.toLowerCase() || 
        s.ticker.toLowerCase().includes(query.toLowerCase())
      );
      if (match) {
        navigate(`/terminal/${match.slug}`);
      }
    }
  };

  const majorStocks = [...safeStocks].sort((a, b) => b.marketCap - a.marketCap).slice(0, 15);
  
  const coreSlugs = ['sp-bse-sensex', 'india-vix', 'multi-commodity-exchange-of-india-ltd'];
  const sectorSlugs = ['nifty-bank', 'nifty-it', 'nifty-metal', 'nifty-smallcap-100', 'nifty-midcap', 'nifty-total-market-index'];
  const commoditySlugs = ['reliance-etf-gold-bees', 'nippon-life-india-asset-management-ltd-nippon-india-silver-etf'];

  const getAssets = (slugs: string[]) => slugs.map(s => (stocks || []).find((stock: any) => stock.slug === s)).filter(Boolean);
  
  const coreAssets = getAssets(coreSlugs);
  const sectorAssets = getAssets(sectorSlugs);
  const commodityAssets = getAssets(commoditySlugs);

  const [tickerMode, setTickerMode] = useState<'stocks' | 'indices'>('stocks');
  const indexSlugs = ['nifty', ...coreSlugs, ...sectorSlugs];
  const indexAssets = getAssets(indexSlugs);
  const activeTickerItems = tickerMode === 'stocks' ? majorStocks.slice(0, 20) : indexAssets;

  return (
    <div className="min-h-full bg-canvas flex flex-col overflow-y-auto">
      {/* Navbar */}
      <div className="w-full px-6 lg:px-12 py-4 flex justify-between items-center border-b border-border bg-surface z-50 sticky top-0">
        <div className="flex items-center gap-8">
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <BarChart2 className="text-alpha" /> QUANT<span className="text-alpha">OS</span>
          </h1>
          <div className="relative hidden md:block w-64" onBlur={(e) => {
             // Delay hiding to allow click event to fire on dropdown items
             if (!e.currentTarget.contains(e.relatedTarget)) {
               setTimeout(() => setShowDropdown(false), 200);
             }
          }}>
            <form onSubmit={handleSearch}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
              <input 
                type="text" 
                placeholder="Search stocks..." 
                className="w-full pl-9 pr-4 py-2 bg-canvas border border-border rounded-full text-sm text-text-primary focus:outline-none focus:border-alpha transition-colors"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
                onFocus={() => { if(query) setShowDropdown(true); }}
              />
            </form>
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.5)] overflow-hidden z-[100] max-h-[300px] overflow-y-auto">
                {searchResults.map((res: any) => (
                   <div 
                     key={res.slug}
                     className="px-4 py-3 hover:bg-surface-hover cursor-pointer border-b border-border/50 last:border-0 flex justify-between items-center group"
                     onMouseDown={(e) => {
                        e.preventDefault(); // Prevents input onBlur from firing before click
                        setQuery('');
                        setShowDropdown(false);
                        navigate(`/terminal/${res.slug}`);
                     }}
                   >
                     <div className="flex flex-col">
                       <span className="text-sm font-bold text-text-primary group-hover:text-alpha transition-colors truncate">{res.name}</span>
                       <span className="text-[10px] text-text-secondary uppercase tracking-widest">{res.ticker}</span>
                     </div>
                   </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-6 items-center">
          <Link to="/ai-research" className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-400 font-bold rounded-lg border border-indigo-500/30 hover:bg-indigo-500/20 transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            <BrainCircuit size={16} /> AI Research Desk
          </Link>
          <Link to="/overview" className="text-sm font-bold text-text-secondary hover:text-white transition-colors">Market Overview</Link>
          <Link to="/heatmap" className="text-sm font-bold text-text-secondary hover:text-white transition-colors">Heatmap</Link>
          <Link to="/pairs" className="text-sm font-bold text-text-secondary hover:text-white transition-colors">Pair Trading</Link>
          <Link to="/watchlists" className="text-sm font-bold text-text-secondary hover:text-white transition-colors">Watchlists</Link>
          <Link to="/portfolio" className="text-sm font-bold text-text-secondary hover:text-white transition-colors">Portfolio Analyzer</Link>
        </div>
      </div>

      {/* Ticker Tape Controls */}
      <div className="w-full flex justify-center bg-surface border-b border-border py-1.5 relative z-10">
        <div className="flex items-center gap-1 bg-canvas rounded-lg p-0.5 shadow-inner border border-border/50">
           <button 
             onClick={() => setTickerMode('stocks')}
             className={`text-[9px] font-bold px-5 py-1 rounded-md transition-all tracking-widest ${tickerMode === 'stocks' ? 'text-white bg-surface-hover shadow-sm border border-border' : 'text-text-secondary hover:text-white border border-transparent'}`}
           >
             STOCKS
           </button>
           <button 
             onClick={() => setTickerMode('indices')}
             className={`text-[9px] font-bold px-5 py-1 rounded-md transition-all tracking-widest ${tickerMode === 'indices' ? 'text-white bg-surface-hover shadow-sm border border-border' : 'text-text-secondary hover:text-white border border-transparent'}`}
           >
             INDICES
           </button>
        </div>
      </div>

      {/* Ticker Tape */}
      <div className="w-full overflow-hidden bg-surface border-b border-border flex items-center h-10 select-none">
        <div 
          className="flex whitespace-nowrap animate-ticker w-max"
          style={{ animationDuration: `${activeTickerItems.length * 4}s` }}
        >
          {[...activeTickerItems, ...activeTickerItems].map((s: any, idx: number) => (
            <TickerTapeItem key={`${s.slug}-${idx}`} asset={s} />
          ))}
        </div>
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
                      to={`/terminal/${s.slug}`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden pr-2">
                        <StockLogo 
                        ticker={s.ticker} 
                        className={`w-8 h-8 ${activeSlug === s.slug ? 'ring-2 ring-alpha ring-offset-2 ring-offset-surface' : ''}`}
                        fallbackClass={activeSlug === s.slug ? 'bg-alpha text-white' : 'bg-surface-hover text-text-primary'} 
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
          {coreAssets.map((asset: any) => (
            <Link key={asset.slug} to={`/terminal/${asset.slug}`} className="col-span-12 md:col-span-4 min-w-0 min-h-0 block cursor-pointer transition-transform hover:-translate-y-1">
              <IndexMarketCard stock={asset} isActive={false} />
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
                    <MiniSectorCard key={asset.slug} stock={asset} />
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
        <MarketSectors macro={macro} stocks={safeStocks} />

        {/* True Quant Data Grid replacing Community Ideas & Images */}
        <StockListGrid stocks={safeStocks} />

      </div>
    </div>
  );
};
