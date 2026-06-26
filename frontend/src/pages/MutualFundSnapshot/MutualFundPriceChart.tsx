import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';

const TIMEFRAMES = ['1M', '6M', '1Y', '3Y', '5Y', 'ALL'];

export const MutualFundPriceChart = ({ fund }: { fund: any }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState('1Y');
  const [periodStats, setPeriodStats] = useState({ change: 0, percentChange: 0, cagr: 0, currentPrice: 0 });

  // Procedurally generate realistic NAV time-series data
  const parsedData = useMemo(() => {
    let targetReturn = parseFloat(fund?.return5y || fund?.return3y || '50');
    const days = 1260; // 5 years max history for this sim
    const currentNav = parseFloat(fund?.nav || 100);
    const startNav = currentNav / (1 + targetReturn / 100);
    
    const dataPoints = [];
    const now = new Date().getTime();
    const msPerDay = 24 * 60 * 60 * 1000;
    
    let runningNav = startNav;
    const dailyDrift = (currentNav - startNav) / days;
    const volatility = currentNav * 0.003;
    const seed = fund?.scheme_code ? parseInt(fund.scheme_code.replace(/\D/g, '')) : 123;

    for (let i = days; i >= 0; i--) {
      const timestamp = now - (i * msPerDay);
      const dateStr = new Date(timestamp).toISOString().split('T')[0];
      
      if (i === days) {
        dataPoints.push({ time: dateStr, value: startNav });
      } else if (i === 0) {
        dataPoints.push({ time: dateStr, value: currentNav });
      } else {
        const noise = (Math.sin(seed + i * 0.5) + Math.cos(seed * 2 + i * 0.3)) * volatility;
        runningNav += dailyDrift + noise;
        dataPoints.push({ time: dateStr, value: runningNav });
      }
    }
    return dataPoints;
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

    const areaSeries = chart.addAreaSeries({
      lineColor: '#6366f1',
      topColor: 'rgba(99, 102, 241, 0.4)',
      bottomColor: 'rgba(99, 102, 241, 0.0)',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    areaSeries.setData(parsedData);
    chartRef.current = chart;
    seriesRef.current = areaSeries;

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
        const priceData = param.seriesData.get(areaSeries) as any;
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
              <span class="text-indigo-400 font-bold text-right">₹${price.toFixed(2)}</span>
            </div>
          </div>
        `;
      }
    });

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [parsedData]);

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
    chartRef.current.timeScale().setVisibleRange({ from: startRange, to: endRange });
  }, [timeframe, parsedData]);

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex justify-between items-center p-4 border-b border-white/5 shrink-0">
        <div className="flex items-baseline gap-3">
          <h3 className="text-xl font-bold font-mono tracking-tight text-text-primary">
            ₹{periodStats.currentPrice.toFixed(2)}
          </h3>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${periodStats.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {periodStats.change >= 0 ? '+' : ''}{periodStats.change.toFixed(2)} ({periodStats.change >= 0 ? '+' : ''}{periodStats.percentChange.toFixed(2)}%)
            </span>
            {/* <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider bg-surface px-1.5 py-0.5 rounded border border-border">
              Past {timeframe}
            </span> */}
            {(timeframe === '1Y' || timeframe === '3Y' || timeframe === '5Y' || timeframe === 'ALL') && (
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 ml-2">
                {periodStats.cagr.toFixed(2)}% CAGR
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 bg-surface p-1 rounded-lg border border-border">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${timeframe === tf ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-text-secondary hover:text-text-primary'}`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 relative p-2">
        <div ref={chartContainerRef} className="absolute inset-0" />
        <div ref={tooltipRef} className="absolute z-50 pointer-events-none text-[11px] bg-[#111114]/95 backdrop-blur-md p-2 rounded-lg border border-white/10 opacity-0 shadow-xl transition-opacity duration-150 min-w-[120px]"></div>
      </div>
    </div>
  );
};
