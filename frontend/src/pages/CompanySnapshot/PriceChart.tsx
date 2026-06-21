/* === LIGHTWEIGHT-CHARTS BACKUP (TradingView) === */
/*
import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, type IChartApi, type ISeriesApi } from 'lightweight-charts';

export const PriceChart = ({ data }: { data: any }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });
    
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444'
    });
    
    const ohlcv = data?.absolute?.OHLCV || [];
    
    const parsedData = ohlcv
      .map((d: any) => {
        const parts = d.Date.split('-');
        return {
          time: `${parts[2]}-${parts[1]}-${parts[0]}`,
          open: d.Open,
          high: d.High,
          low: d.Low,
          close: d.Close,
        };
      })
      .sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    if (parsedData.length > 0) {
      candleSeries.setData(parsedData);
    }
    
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data]);
  
  return (
    <div className="bg-surface p-4 rounded-lg border border-border w-full">
      <h3 className="text-lg font-medium text-text-primary mb-4">Price Action Engine</h3>
      <div ref={chartContainerRef} className="w-full h-[400px]" />
    </div>
  );
};
*/
/* === END BACKUP === */

import React, { useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { StockLogo } from '../../components/StockLogo';

const TIMEFRAMES = ['5D', '1M', '3M', '6M', '1Y', '5Y', 'ALL'];

export const PriceChart = ({ data }: { data: any }) => {
  const [timeframe, setTimeframe] = useState('ALL');

  const { series, yMin, yMax } = useMemo(() => {
    const ohlcv = data?.absolute?.OHLCV || [];

    const fullData = ohlcv
      .map((d: any) => {
        const [day, month, year] = d.Date.split('-');
        const timestamp = new Date(`${year}-${month}-${day}`).getTime();
        return {
          x: timestamp,
          y: [d.Open, d.High, d.Low, d.Close] as [number, number, number, number],
        };
      })
      .sort((a: any, b: any) => a.x - b.x);

    let filteredData = fullData;
    const now = new Date().getTime();

    if (timeframe !== 'ALL') {
      let cutoff = 0;
      switch (timeframe) {
        case '5D': cutoff = now - 5 * 24 * 60 * 60 * 1000; break;
        case '1M': cutoff = now - 30 * 24 * 60 * 60 * 1000; break;
        case '3M': cutoff = now - 90 * 24 * 60 * 60 * 1000; break;
        case '6M': cutoff = now - 180 * 24 * 60 * 60 * 1000; break;
        case '1Y': cutoff = now - 365 * 24 * 60 * 60 * 1000; break;
        case '5Y': cutoff = now - 5 * 365 * 24 * 60 * 60 * 1000; break;
      }
      filteredData = fullData.filter((d: any) => d.x >= cutoff);
    }
    
    // Fallback if filter is too restrictive
    if (filteredData.length === 0 && fullData.length > 0) {
      filteredData = fullData.slice(-20);
    }

    const allPrices = filteredData.flatMap((d: any) => d.y);
    const min = allPrices.length > 0 ? Math.min(...allPrices) : 0;
    const max = allPrices.length > 0 ? Math.max(...allPrices) : 100;

    return { 
      series: [{ data: filteredData }],
      yMin: min * 0.95,
      yMax: max * 1.05
    };
  }, [data, timeframe]);

  let pctChange = 0;
  let priceDiff = 0;
  let rawLivePrice = data?.absolute?.absolute_data?.["live price"];
  let currentPrice = 0;
  let startPrice = 0;
  
  if (series[0]?.data && series[0].data.length > 0) {
    const d = series[0].data;
    const lastClose = d[d.length - 1].y[3];
    
    if (typeof rawLivePrice === 'number') {
      currentPrice = rawLivePrice;
    } else if (typeof rawLivePrice === 'string') {
      const parsed = parseFloat(rawLivePrice.replace(/[^0-9.-]+/g,""));
      currentPrice = isNaN(parsed) ? lastClose : parsed;
    } else {
      currentPrice = lastClose;
    }
    
    startPrice = d[0].y[0];
    priceDiff = currentPrice - startPrice;
    pctChange = (priceDiff / startPrice) * 100;
  }
  
  const isPositive = priceDiff >= 0;

  const options: ApexOptions = {
    chart: {
      type: 'candlestick',
      height: '100%',
      background: 'transparent',
      toolbar: {
        show: true,
        tools: {
          download: false,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true,
        },
      },
      zoom: {
        enabled: true,
      },
      selection: {
        enabled: true,
      },
    },
    plotOptions: {
      candlestick: {
        colors: {
          upward: '#10b981',
          downward: '#ef4444',
        },
        wick: {
          useFillColor: true,
        },
      },
    },
    grid: {
      borderColor: '#27272a',
      strokeDashArray: 0,
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: {
          colors: '#94a3b8',
          fontSize: '12px',
        },
      },
      axisBorder: { color: '#27272a' },
      axisTicks: { color: '#27272a' },
      crosshairs: {
        show: true,
        stroke: { color: '#94a3b8', width: 1, dashArray: 4 },
      },
    },
    yaxis: {
      min: yMin,
      max: yMax,
      tooltip: {
        enabled: true,
      },
      labels: {
        style: {
          colors: '#94a3b8',
          fontSize: '12px',
        },
        formatter: (val: number) => val.toFixed(2),
      },
      crosshairs: {
        show: true,
        stroke: { color: '#94a3b8', width: 1, dashArray: 4 },
      },
    },
    tooltip: {
      enabled: true,
      theme: 'dark',
    },
    theme: {
      mode: 'dark',
    },
  };

  return (
    <div className="bg-canvas border-b border-border h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border-b border-border gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <StockLogo ticker={data?.absolute?.ticker || ''} className="w-14 h-14 shadow-md" textClass="text-sm" fallbackClass="bg-surface border border-border text-text-primary" />
          <div className="flex flex-col justify-center gap-0.5">
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-extrabold text-white tracking-tight leading-none">{data?.absolute?.ticker}</h3>
              <span className="text-sm text-text-secondary leading-none">{data?.absolute?.name}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-white leading-none">₹{currentPrice.toFixed(2)}</span>
              <span className={`text-sm font-semibold leading-none ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPositive ? '+' : ''}{priceDiff.toFixed(2)} ({isPositive ? '+' : ''}{pctChange.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
        <div className="flex bg-surface-hover p-1 rounded-md border border-border gap-1">
          {TIMEFRAMES.map(t => (
            <button 
              key={t}
              onClick={() => setTimeframe(t)}
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${timeframe === t ? 'bg-alpha text-canvas shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 w-full min-h-0">
        <Chart 
          options={options} 
          series={series} 
          type="candlestick" 
          height="100%" 
        />
      </div>
    </div>
  );
};
