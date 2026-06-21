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
      .sort((a: { x: number }, b: { x: number }) => a.x - b.x);

    let filteredData = fullData;
    if (fullData.length > 0 && timeframe !== 'ALL') {
      const now = fullData[fullData.length - 1].x;
      let msToSubtract = 0;
      switch (timeframe) {
        case '5D': msToSubtract = 5 * 24 * 60 * 60 * 1000; break;
        case '1M': msToSubtract = 30 * 24 * 60 * 60 * 1000; break;
        case '3M': msToSubtract = 90 * 24 * 60 * 60 * 1000; break;
        case '6M': msToSubtract = 180 * 24 * 60 * 60 * 1000; break;
        case '1Y': msToSubtract = 365 * 24 * 60 * 60 * 1000; break;
        case '5Y': msToSubtract = 5 * 365 * 24 * 60 * 60 * 1000; break;
      }
      const threshold = now - msToSubtract;
      filteredData = fullData.filter((d: any) => d.x >= threshold);
    }

    if (filteredData.length === 0) filteredData = fullData;

    let minVal = undefined;
    let maxVal = undefined;
    if (filteredData.length > 0) {
      const lows = filteredData.map((d: any) => d.y[2]);
      const highs = filteredData.map((d: any) => d.y[1]);
      const minRaw = Math.min(...lows);
      const maxRaw = Math.max(...highs);
      const padding = (maxRaw - minRaw) * 0.05;
      minVal = minRaw - padding;
      maxVal = maxRaw + padding;
    }

    return { 
      series: [{ name: 'Candle', data: filteredData }],
      yMin: minVal,
      yMax: maxVal
    };
  }, [data, timeframe]);

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
      <div className="flex justify-between items-center p-4 border-b border-border bg-surface shrink-0">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Price Action Engine</h2>
          <p className="text-sm text-text-secondary mt-1">OHLCV Candlestick Data</p>
        </div>
        <div className="flex bg-canvas border border-border p-1 rounded-md gap-1">
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
