import React, { useState, useMemo, useEffect } from 'react';
// BACKUP: Was using lightweight-charts, switched to ApexCharts to remove TradingView watermark
// import { createChart, ColorType, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks, fetchPairAnalysis } from '../api';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { Search, ArrowRightLeft, TrendingUp, AlertTriangle, BarChart2, CheckCircle2, Circle, ArrowUpRight, ArrowDownRight, PauseCircle, XCircle } from 'lucide-react';
import { StockLogo } from '../components/StockLogo';

const StockSelector = ({ value, onChange, stocks, label }: any) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedStock = stocks?.find((s: any) => s.slug === value);
  const displayValue = selectedStock ? selectedStock.ticker : query;

  const filtered = query.length > 0 && stocks 
    ? stocks.filter((s: any) => 
        (s.ticker && s.ticker.toLowerCase().includes(query.toLowerCase())) || 
        (s.name && s.name.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 8)
    : [];

  return (
    <div className="relative flex-1">
      <label className="block text-xs text-text-secondary mb-1">{label}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
        <input 
          type="text"
          value={isOpen ? query : displayValue}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => { setQuery(''); setIsOpen(true); }}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          placeholder="Search ticker..."
          className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-md text-text-primary focus:outline-none focus:border-alpha"
        />
      </div>
      {isOpen && filtered.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-surface border border-border rounded-md shadow-xl overflow-hidden z-50">
          {filtered.map((stock: any) => (
            <div 
              key={stock.slug}
              className="px-4 py-3 hover:bg-surface-hover cursor-pointer border-b border-border"
              onMouseDown={() => {
                onChange(stock.slug);
                setIsOpen(false);
              }}
            >
              <div className="flex items-center gap-2">
                <StockLogo ticker={stock.ticker} className="w-6 h-6" textClass="text-[8px]" fallbackClass="bg-surface-hover border border-border text-text-primary" />
                <div className="font-bold text-text-primary">{stock.ticker}</div>
              </div>
              <div className="text-xs text-text-secondary truncate">{stock.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Helper: Z-Score plain-English interpretation ---
const getZScoreExplanation = (z: number): React.ReactNode => {
  const absZ = Math.abs(z);
  if (absZ > 2) return <span className="flex items-center gap-1.5"><AlertTriangle size={14} className="text-beta" /> Extreme divergence — potential mean-reversion opportunity</span>;
  if (absZ > 1) return <span className="flex items-center gap-1.5"><BarChart2 size={14} className="text-alpha" /> Moderate spread — monitor closely</span>;
  return <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-400" /> Trading near historical average</span>;
};

// --- Helper: Correlation plain-English interpretation ---
const getCorrelationExplanation = (corr: number): React.ReactNode => {
  if (corr >= 0.80) return <span className="flex items-center gap-1.5"><Circle size={10} fill="currentColor" className="text-emerald-400" /> Strong pair — suitable for pair trading</span>;
  if (corr >= 0.60) return <span className="flex items-center gap-1.5"><Circle size={10} fill="currentColor" className="text-yellow-400" /> Moderate pair — use with caution</span>;
  return <span className="flex items-center gap-1.5"><Circle size={10} fill="currentColor" className="text-red-400" /> Weak pair — not recommended for pair trading</span>;
};

// --- Helper: Algorithmic signal plain-English interpretation ---
const getSignalExplanation = (correlation: number, recommendedAction: string): { text: React.ReactNode; style: string } => {
  if (correlation < 0.60) {
    return {
      text: <span className="flex items-center gap-1.5"><XCircle size={16} /> Not Recommended — These stocks don't move together reliably enough.</span>,
      style: 'bg-surface border-border text-text-secondary',
    };
  }
  if (correlation < 0.70) {
    return {
      text: <span className="flex items-center gap-1.5"><AlertTriangle size={16} /> Proceed with Caution — Correlation is below the ideal threshold of 0.70.</span>,
      style: 'bg-surface border-border text-text-secondary',
    };
  }
  // Correlation >= 0.70 — translate raw action to plain English
  const actionMap: Record<string, React.ReactNode> = {
    'LONG_SPREAD': <span className="flex items-center gap-1.5"><ArrowUpRight size={16} className="text-emerald-400" /> Go Long on the Spread — Asset A is undervalued relative to Asset B</span>,
    'SHORT_SPREAD': <span className="flex items-center gap-1.5"><ArrowDownRight size={16} className="text-red-400" /> Go Short on the Spread — Asset A is overvalued relative to Asset B</span>,
    'HOLD': <span className="flex items-center gap-1.5"><PauseCircle size={16} /> Hold — No actionable divergence detected right now</span>,
  };
  const friendly = actionMap[recommendedAction] ?? recommendedAction;
  const isHold = recommendedAction === 'HOLD';
  return {
    text: friendly,
    style: isHold ? 'bg-surface border-border text-text-secondary' : 'bg-alpha/10 border-alpha/30 text-alpha',
  };
};

import { Skeleton } from '../components/Skeleton';

export const PairTrading = ({ isPanel = false, initialAssetA }: { isPanel?: boolean, initialAssetA?: string }) => {
  const [assetA, setAssetA] = useState(initialAssetA || 'state-bank-of-india');
  const [assetB, setAssetB] = useState('hdfc-bank-ltd');
  const [lookback, setLookback] = useState(252);

  useEffect(() => {
    if (initialAssetA) {
      setAssetA(initialAssetA);
    }
  }, [initialAssetA]);

  // BACKUP: removed chartContainerRef — no longer needed with ApexCharts
  // const chartContainerRef = useRef<HTMLDivElement>(null);

  const { data: stocks } = useQuery({ queryKey: ['allStocks'], queryFn: fetchAllStocks });
  
  const { data: analysis, isLoading, error } = useQuery({
    queryKey: ['pairAnalysis', assetA, assetB, lookback],
    queryFn: () => fetchPairAnalysis(assetA, assetB, lookback),
    enabled: !!assetA && !!assetB,
  });

  // BACKUP: The entire useEffect block that created a lightweight-charts instance has been removed.
  // It manually created the chart, added 3 line series (assetA, assetB, zScore), added price lines
  // for +2 SD / -2 SD / Mean, and handled resize. All of that is now declarative via ApexCharts below.

  // --- Build ApexCharts series & options from analysis data ---
  const { chartSeries, chartOptions } = useMemo(() => {
    if (!analysis?.chart_data) return { chartSeries: [], chartOptions: {} as ApexOptions };

    const assetALabel = assetA.split('-')[0].toUpperCase() + ' (%)';
    const assetBLabel = assetB.split('-')[0].toUpperCase() + ' (%)';

    // Convert {time, value} arrays to [timestamp, value] arrays for ApexCharts
    const toApexData = (arr: { time: string; value: number }[]) =>
      arr.map((d) => [new Date(d.time).getTime(), d.value] as [number, number]);

    const seriesA = toApexData(analysis.price_series_a ?? []);
    const seriesB = toApexData(analysis.price_series_b ?? []);
    const seriesZ = toApexData(analysis.chart_data ?? []);

    const series = [
      { name: assetALabel, data: seriesA },
      { name: assetBLabel, data: seriesB },
      { name: 'Z-Score', data: seriesZ },
    ];

    const options: ApexOptions = {
      chart: {
        type: 'line',
        height: 400,
        background: 'transparent',
        toolbar: { show: true, tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
        zoom: { enabled: true },
        animations: { enabled: true, speed: 600 },
      },
      colors: ['#10b981', '#ef4444', '#f8fafc'],
      stroke: { curve: 'smooth', width: 2 },
      grid: {
        borderColor: '#27272a',
        strokeDashArray: 0,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
      },
      xaxis: {
        type: 'datetime',
        labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: [
        {
          seriesName: assetALabel,
          title: { text: 'Returns (%)', style: { color: '#94a3b8', fontSize: '12px' } },
          labels: { style: { colors: '#94a3b8' }, formatter: (v: number) => v.toFixed(1) },
        },
        {
          seriesName: assetBLabel,
          show: false, // shares the same axis as Asset A
        },
        {
          opposite: true,
          seriesName: 'Z-Score',
          title: { text: 'Z-Score', style: { color: '#94a3b8', fontSize: '12px' } },
          labels: { style: { colors: '#94a3b8' }, formatter: (v: number) => v.toFixed(2) },
        },
      ],
      annotations: {
        yaxis: [
          { y: 2, yAxisIndex: 2, borderColor: '#f59e0b', strokeDashArray: 4, label: { text: '+2 SD', position: 'left', style: { color: '#f59e0b', background: 'transparent', fontSize: '11px' } } },
          { y: -2, yAxisIndex: 2, borderColor: '#f59e0b', strokeDashArray: 4, label: { text: '-2 SD', position: 'left', style: { color: '#f59e0b', background: 'transparent', fontSize: '11px' } } },
          { y: 0, yAxisIndex: 2, borderColor: '#94a3b8', strokeDashArray: 6, label: { text: 'Mean', position: 'left', style: { color: '#94a3b8', background: 'transparent', fontSize: '11px' } } },
        ],
      },
      tooltip: {
        theme: 'dark',
        shared: true,
        intersect: false,
        x: { format: 'dd MMM yyyy' },
        style: { fontSize: '12px' },
        custom: undefined, // use default but style overrides below
      },
      legend: {
        labels: { colors: '#94a3b8' },
        position: 'top',
        horizontalAlign: 'left',
        fontSize: '13px',
      },
      theme: { mode: 'dark' },
    };

    return { chartSeries: series, chartOptions: options };
  }, [analysis, assetA, assetB]);

  return (
    <div className={`${isPanel ? 'p-2 flex flex-col h-full' : 'p-6 w-full flex flex-col h-full'}`}>
      {!isPanel && (
        <div className="flex justify-between items-end mb-6">
          <div>
            <h2 className="text-3xl font-bold text-text-primary">Statistical Pair Trading</h2>
            <p className="text-text-secondary mt-1">Mean-reversion engine using Cointegration & ADF Testing.</p>
          </div>
        </div>
      )}

      {/* Control Panel */}
      <div className={`bg-surface border border-border rounded-lg flex items-center justify-between mb-6 ${isPanel ? 'p-2' : 'p-6'}`}>
        <StockSelector value={assetA} onChange={setAssetA} stocks={stocks} label="Asset A (Numerator)" />
        <div className="mt-5 text-text-secondary"><ArrowRightLeft size={24} /></div>
        <StockSelector value={assetB} onChange={setAssetB} stocks={stocks} label="Asset B (Denominator)" />
        <div className="flex-1 max-w-[200px]">
          <label className="block text-xs text-text-secondary mb-1">Lookback Window (Days)</label>
          <select 
            value={lookback} 
            onChange={e => setLookback(Number(e.target.value))}
            className="w-full px-4 py-2 bg-surface border border-border rounded-md text-text-primary focus:outline-none focus:border-alpha"
          >
            <option value={63}>1 Quarter (63d)</option>
            <option value={126}>6 Months (126d)</option>
            <option value={252}>1 Year (252d)</option>
            <option value={504}>2 Years (504d)</option>
          </select>
        </div>
      </div>

      {isLoading || !analysis ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <Skeleton className="w-full h-[450px]" />
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="w-full h-[140px]" />
            <Skeleton className="w-full h-[140px]" />
            <Skeleton className="w-full h-[140px]" />
          </div>
        </div>
      ) : error ? (
        <div className="p-8 text-beta bg-surface rounded border border-border">Error calculating spread matrix. Make sure both assets have enough overlapping historical data.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* ---- Chart Panel ---- */}
          <div className="lg:col-span-3 bg-surface p-6 rounded-lg border border-border">
            <h3 className="text-lg font-medium text-text-primary mb-4">Correlation & Z-Score Analysis</h3>
            {/* BACKUP: Was <div ref={chartContainerRef} className="w-full h-[400px]" /> */}
            <Chart
              options={chartOptions}
              series={chartSeries}
              type="line"
              height={400}
            />
          </div>
          
          {/* ---- Stats Panel ---- */}
          <div className="flex flex-col gap-4">
             {/* Z-Score Card */}
             <div className="bg-surface p-6 rounded-lg border border-border flex-1">
                <h3 className="text-sm font-medium text-text-secondary mb-2">Current Z-Score</h3>
                <div className={`text-4xl font-bold tabular-nums ${analysis.current_z_score > 2 || analysis.current_z_score < -2 ? 'text-beta' : 'text-text-primary'}`}>
                  {analysis.current_z_score.toFixed(2)}
                </div>
                <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                  {getZScoreExplanation(analysis.current_z_score)}
                </p>
             </div>

             {/* Correlation Card */}
             <div className="bg-surface p-6 rounded-lg border border-border flex-1">
                <h3 className="text-sm font-medium text-text-secondary mb-2">Correlation (Returns)</h3>
                <div className={`text-4xl font-bold tabular-nums ${analysis.correlation < 0.70 ? 'text-warning' : 'text-text-primary'}`}>
                  {analysis.correlation.toFixed(2)}
                </div>
                <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                  {getCorrelationExplanation(analysis.correlation)}
                </p>
             </div>

             {/* Algorithmic Signal Card */}
             {(() => {
               const signal = getSignalExplanation(analysis.correlation, analysis.recommended_action);
               return (
                 <div className={`p-6 rounded-lg border flex-1 ${signal.style}`}>
                    <h3 className="text-sm font-medium mb-2 opacity-80">Algorithmic Signal</h3>
                    <div className="text-base font-bold leading-tight">
                      {signal.text}
                    </div>
                 </div>
               );
             })()}
          </div>
        </div>
      )}
    </div>
  );
};
