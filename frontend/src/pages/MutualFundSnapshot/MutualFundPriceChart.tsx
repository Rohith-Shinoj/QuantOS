import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import { BrainCircuit, RefreshCw, HelpCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchStockData } from '../../api';

const TIMEFRAMES = ['1M', '6M', '1Y', '3Y', '5Y', 'ALL'];

export const MutualFundPriceChart = ({ fund }: { fund: any }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const baseLineRef = useRef<any>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState('1Y');
  const [viewMode, setViewMode] = useState<'baseline' | 'line'>('baseline');
  const [showNifty, setShowNifty] = useState(false);
  const [showSector, setShowSector] = useState(false);
  const [periodStats, setPeriodStats] = useState({ change: 0, percentChange: 0, cagr: 0, currentPrice: 0 });

  // Fetch Overlays
  const { data: niftyRaw } = useQuery({
    queryKey: ['stock', 'nifty'],
    queryFn: () => fetchStockData('nifty'),
    enabled: showNifty,
  });

  const getSectorSlug = (fund: any) => {
    const sub = (fund?.sub_category || '').toLowerCase();
    const cat = (fund?.category || '').toLowerCase();
    
    if (sub.includes('mid cap')) return 'nifty-midcap';
    if (sub.includes('small cap')) return 'nifty-smallcap-100';
    if (sub.includes('bank') || sub.includes('financial') || cat.includes('bank')) return 'nifty-bank';
    if (sub.includes('it') || sub.includes('tech') || cat.includes('it')) return 'nifty-it';
    if (sub.includes('pharma') || sub.includes('health') || cat.includes('health')) return 'nippon-india-nifty-pharma-etf-netfpharma'; // closest index proxy
    if (sub.includes('metal') || cat.includes('metal')) return 'nifty-metal';
    
    return 'nifty-total-market-index';
  };

  const sectorSlug = getSectorSlug(fund);
  const { data: sectorRaw } = useQuery({
    queryKey: ['stock', sectorSlug],
    queryFn: () => fetchStockData(sectorSlug),
    enabled: showSector,
  });

  const niftyData = useMemo(() => {
    const ohlcv = niftyRaw?.absolute?.OHLCV || [];
    return ([...ohlcv].reverse().map((d: any) => {
      if (!d || !d.Date) return null;
      const [day, month, year] = d.Date.split('-');
      return { time: `${year}-${month}-${day}`, value: d.Close };
    }).filter(Boolean) as any[]).sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [niftyRaw]);

  const sectorData = useMemo(() => {
    const ohlcv = sectorRaw?.absolute?.OHLCV || [];
    return ([...ohlcv].reverse().map((d: any) => {
      if (!d || !d.Date) return null;
      const [day, month, year] = d.Date.split('-');
      return { time: `${year}-${month}-${day}`, value: d.Close };
    }).filter(Boolean) as any[]).sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [sectorRaw]);

  // Parse real historical NAV time-series data
  const parsedData = useMemo(() => {
    if (!fund?.historical_navs || !Array.isArray(fund.historical_navs)) return [];
    
    const data = fund.historical_navs.map((point: any) => {
      // The Groww API returns [timestamp, nav]
      const timestamp = point.date || point[0];
      const nav = point.nav || point[1] || point.value;
      
      const dateStr = new Date(timestamp).toISOString().split('T')[0];
      return { time: dateStr, value: parseFloat(nav) };
    }).sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // Inject current NAV as the final point to ensure alignment with the header
    if (data.length > 0 && fund?.nav) {
       const latestNav = parseFloat(fund.nav);
       const todayStr = new Date().toISOString().split('T')[0];
       // If the last point is today, update it, otherwise push a new point
       if (data[data.length - 1].time === todayStr) {
         data[data.length - 1].value = latestNav;
       } else {
         data.push({ time: todayStr, value: latestNav });
       }
    }

    return data;
  }, [fund]);

  useEffect(() => {
    if (!chartContainerRef.current || parsedData.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: 'rgba(255, 255, 255, 0.2)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#3b82f6' },
        horzLine: { color: 'rgba(255, 255, 255, 0.2)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#3b82f6' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        autoScale: true,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: false,
      },
    });

    const baselineSeries = chart.addBaselineSeries({
      baseValue: { type: 'price', price: parsedData[0]?.value || 0 },
      topLineColor: '#10b981',
      topFillColor1: 'rgba(16, 185, 129, 0.28)',
      topFillColor2: 'rgba(16, 185, 129, 0.05)',
      bottomLineColor: '#ef4444',
      bottomFillColor1: 'rgba(239, 68, 68, 0.05)',
      bottomFillColor2: 'rgba(239, 68, 68, 0.28)',
      baseLineColor: 'rgba(255, 255, 255, 0.4)',
      baseLineStyle: LineStyle.Dotted,
      baseLineWidth: 1,
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    baselineSeries.setData(parsedData.map((d: any) => ({ time: d.time, value: d.value })));

    const lineSeries = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      visible: false,
    });
    lineSeries.setData(parsedData.map((d: any) => ({ time: d.time, value: d.value })));

    baseLineRef.current = baselineSeries.createPriceLine({
      price: parsedData[0]?.value || 0,
      color: 'rgba(255, 255, 255, 0.4)',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
    });

    chartRef.current = chart;

    const niftySeries = chart.addLineSeries({
      color: 'rgba(234, 179, 8, 0.6)',
      lineWidth: 1,
      crosshairMarkerVisible: false,
      visible: showNifty,
      priceScaleId: 'overlay',
    });
    niftySeries.setData(niftyData.filter((d: any) => parsedData.some((p: any) => p.time === d.time)));

    const sectorSeries = chart.addLineSeries({
      color: 'rgba(168, 85, 247, 0.6)',
      lineWidth: 1,
      crosshairMarkerVisible: false,
      visible: showSector,
      priceScaleId: 'overlay',
    });
    sectorSeries.setData(sectorData.filter((d: any) => parsedData.some((p: any) => p.time === d.time)));

    chart.priceScale('overlay').applyOptions({
      visible: false,
      autoScale: true,
    });

    seriesRef.current = { baseline: baselineSeries, line: lineSeries, nifty: niftySeries, sector: sectorSeries };

    // Tooltip Sync
    chart.subscribeCrosshairMove((param) => {
      const toolTip = tooltipRef.current;
      if (!toolTip) return;

      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > chartContainerRef.current!.clientWidth ||
        param.point.y < 0 ||
        param.point.y > chartContainerRef.current!.clientHeight
      ) {
        toolTip.style.opacity = '0';
      } else {
        toolTip.style.opacity = '1';
        const dateStr = param.time as string;
        const priceData = param.seriesData.get(viewMode === 'baseline' ? seriesRef.current.baseline : seriesRef.current.line) as any;
        const price = priceData?.value || 0;

        let left = param.point.x + 15;
        let top = param.point.y + 15;
        
        if (left + 120 > chartContainerRef.current!.clientWidth) {
           left = param.point.x - 120 - 15;
        }

        toolTip.style.left = left + 'px';
        toolTip.style.top = top + 'px';

        toolTip.innerHTML = `
          <div class="flex flex-col gap-1">
            <span class="text-text-secondary font-semibold border-b border-border pb-1 mb-1 text-center">${dateStr}</span>
            <div class="flex justify-between gap-4">
              <span class="text-text-secondary">NAV</span> 
              <span class="text-white font-bold text-right">₹${price.toFixed(2)}</span>
            </div>
          </div>
        `;
      }
    });

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [parsedData, niftyData, sectorData]);

  // Handle View Mode Toggles & Overlays
  useEffect(() => {
    if (!seriesRef.current?.baseline || !seriesRef.current?.line) return;
    
    if (viewMode === 'baseline') {
      seriesRef.current.baseline.applyOptions({ visible: true });
      seriesRef.current.line.applyOptions({ visible: false });
    } else {
      seriesRef.current.baseline.applyOptions({ visible: false });
      seriesRef.current.line.applyOptions({ visible: true });
    }

    if (seriesRef.current.nifty) {
      seriesRef.current.nifty.applyOptions({ visible: showNifty });
    }
    if (seriesRef.current.sector) {
      seriesRef.current.sector.applyOptions({ visible: showSector });
    }
  }, [viewMode, showNifty, showSector]);

  // Sync Overlay Data when Fetched
  useEffect(() => {
    if (seriesRef.current?.nifty && niftyData.length > 0) {
      seriesRef.current.nifty.setData(niftyData.filter((d: any) => parsedData.some((p: any) => p.time === d.time)));
    }
  }, [niftyData, parsedData]);

  useEffect(() => {
    if (seriesRef.current?.sector && sectorData.length > 0) {
      seriesRef.current.sector.setData(sectorData.filter((d: any) => parsedData.some((p: any) => p.time === d.time)));
    }
  }, [sectorData, parsedData]);

  // Handle Timeframe changes
  useEffect(() => {
    if (!chartRef.current || parsedData.length === 0) return;
    
    if (timeframe === 'ALL') {
      chartRef.current.timeScale().fitContent();
      const startPrice = parsedData[0].value;
      const endPrice = parsedData[parsedData.length - 1].value;
      const years = (new Date(parsedData[parsedData.length - 1].time).getTime() - new Date(parsedData[0].time).getTime()) / (365 * 24 * 60 * 60 * 1000);
      const cagr = years > 0 ? (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100 : 0;
      setPeriodStats({ change: endPrice - startPrice, percentChange: ((endPrice - startPrice) / startPrice) * 100, cagr, currentPrice: endPrice });
      if (seriesRef.current?.baseline) {
        seriesRef.current.baseline.applyOptions({ baseValue: { type: 'price', price: startPrice } });
        if (baseLineRef.current) seriesRef.current.baseline.removePriceLine(baseLineRef.current);
        baseLineRef.current = seriesRef.current.baseline.createPriceLine({
          price: startPrice,
          color: 'rgba(255, 255, 255, 0.4)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
        });
      }
      return;
    }

    const now = new Date(parsedData[parsedData.length - 1].time).getTime();
    let cutoff = 0;
    
    switch (timeframe) {
      case '1M': cutoff = now - 30 * 24 * 60 * 60 * 1000; break;
      case '3M': cutoff = now - 90 * 24 * 60 * 60 * 1000; break;
      case '6M': cutoff = now - 180 * 24 * 60 * 60 * 1000; break;
      case '1Y': cutoff = now - 365 * 24 * 60 * 60 * 1000; break;
      case '3Y': cutoff = now - 3 * 365 * 24 * 60 * 60 * 1000; break;
      case '5Y': cutoff = now - 5 * 365 * 24 * 60 * 60 * 1000; break;
    }

    let startIndex = 0;
    for (let i = parsedData.length - 1; i >= 0; i--) {
      if (new Date(parsedData[i].time).getTime() < cutoff) {
        startIndex = i + 1;
        break;
      }
    }
    
    if (startIndex >= parsedData.length) startIndex = parsedData.length - 1;
    
    const startRange = parsedData[startIndex].time;
    const endRange = parsedData[parsedData.length - 1].time;
    
    const startPrice = parsedData[startIndex].value;
    const endPrice = parsedData[parsedData.length - 1].value;

    const years = (new Date(endRange).getTime() - new Date(startRange).getTime()) / (365 * 24 * 60 * 60 * 1000);
    const cagr = years > 0 ? (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100 : 0;

    setPeriodStats({ change: endPrice - startPrice, percentChange: ((endPrice - startPrice) / startPrice) * 100, cagr, currentPrice: endPrice });
    
    // Update baseline value to start of visible range for ALL synced series
    const baseValueConfig = { type: 'price' as const, price: startPrice };
    if (seriesRef.current?.baseline) {
      seriesRef.current.baseline.applyOptions({ baseValue: baseValueConfig });
      if (baseLineRef.current) seriesRef.current.baseline.removePriceLine(baseLineRef.current);
      baseLineRef.current = seriesRef.current.baseline.createPriceLine({
        price: startPrice,
        color: 'rgba(255, 255, 255, 0.4)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
      });
    }

    chartRef.current.timeScale().setVisibleRange({ from: startRange, to: endRange });
  }, [timeframe, parsedData]);

  // Top header metrics strictly 1D
  const return1d = parseFloat(fund?.return1d || '0');
  const currentNav = fund?.nav || 0;
  const navChange = (currentNav * return1d) / 100;
  const isPositive = return1d >= 0;

  return (
    <div className="bg-canvas border-b border-border h-full flex flex-col">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border-b border-border gap-4 shrink-0">
        <div className="flex items-center gap-4">
          {fund.logo_url ? (
            <img src={fund.logo_url} alt="Logo" className="w-14 h-14 rounded bg-white object-contain p-1 shadow-md" />
          ) : (
            <div className="w-14 h-14 rounded bg-surface border border-border text-text-primary flex items-center justify-center font-bold text-lg shadow-md">
              {fund.amc?.substring(0, 2) || 'MF'}
            </div>
          )}
          <div className="flex flex-col justify-center gap-0.5">
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-extrabold text-white tracking-tight leading-none truncate max-w-[400px]">{fund.fund_name || fund.scheme_name}</h3>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-white leading-none">₹{currentNav.toFixed(2)}</span>
              <span className={`text-sm font-semibold leading-none ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPositive ? '+' : ''}{navChange.toFixed(2)} ({isPositive ? '+' : ''}{return1d.toFixed(2)}%) <span className="text-[10px] font-bold text-text-secondary ml-0.5">1D</span>
              </span>
              <button 
                className="ml-2 flex items-center gap-1.5 px-2 py-1 bg-surface-hover hover:bg-border border border-border rounded text-[10px] font-semibold text-text-primary transition-all"
              >
                <RefreshCw size={10} />
                Sync
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">

          {/* Toggles */}
          <div className="flex items-center gap-2 text-[10px] font-bold relative">
            <span className="text-text-secondary mr-1 group flex items-center gap-1 cursor-help relative z-50">
              <HelpCircle size={12} className="text-text-secondary hover:text-white transition-colors" />
              VIEW:
            </span>
              <button 
              onClick={() => setViewMode('line')}
              className={`px-3 py-1.5 rounded transition-all border ${viewMode === 'line' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-surface text-text-secondary border-border hover:bg-surface-hover hover:text-text-primary'}`}
            >
              NAV 
            </button>
            <button 
              onClick={() => setViewMode('baseline')}
              className={`px-3 py-1.5 rounded transition-all border ${viewMode === 'baseline' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-surface text-text-secondary border-border hover:bg-surface-hover hover:text-text-primary'}`}
            >
              Baseline Area
            </button>
            <span className="text-text-secondary mx-2">|</span>
            <span className="text-text-secondary mr-1">OVERLAYS:</span>
            <button 
              onClick={() => { setShowNifty(!showNifty); setShowSector(false); }}
              className={`px-3 py-1.5 rounded transition-all border ${showNifty ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-surface text-text-secondary border-border hover:bg-surface-hover hover:text-text-primary'}`}
            >
              vs Nifty 50
            </button>
            <button 
              onClick={() => { setShowSector(!showSector); setShowNifty(false); }}
              className={`px-3 py-1.5 rounded transition-all border ${showSector ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-surface text-text-secondary border-border hover:bg-surface-hover hover:text-text-primary'}`}
            >
              Sector
            </button>
          </div>

          {/* Timeframes & Stats */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${periodStats.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {periodStats.change >= 0 ? '+' : ''}{periodStats.change.toFixed(2)} ({periodStats.change >= 0 ? '+' : ''}{periodStats.percentChange.toFixed(2)}%)
              </span>
              {(timeframe === '1Y' || timeframe === '3Y' || timeframe === '5Y' || timeframe === 'ALL') && (
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                  {periodStats.cagr.toFixed(2)}% CAGR
                </span>
              )}
            </div>
            <div className="h-4 w-px bg-border mx-1"></div>
            <div className="flex gap-1 bg-surface p-1 rounded-lg border border-border">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${timeframe === tf ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Chart Area */}
      <div className="flex-1 min-h-0 relative">
        <div ref={chartContainerRef} className="absolute inset-0" />
        <div ref={tooltipRef} className="absolute z-50 pointer-events-none text-[11px] bg-[#111114]/95 backdrop-blur-md p-2 rounded-lg border border-white/10 opacity-0 shadow-xl transition-opacity duration-150 min-w-[120px]"></div>
      </div>
    </div>
  );
};
