import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';

export const AdvancedCharting = ({ data }: { data: any }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const ohlcv = data?.absolute?.OHLCV || [];
    if (!ohlcv.length) return;

    // Convert dates from DD-MM-YYYY to YYYY-MM-DD or timestamp
    const sortedData = [...ohlcv].reverse().map((d: any) => {
      const [day, month, year] = d.Date.split('-');
      return {
        time: `${year}-${month}-${day}`, // YYYY-MM-DD
        open: d.Open,
        high: d.High,
        low: d.Low,
        close: d.Close,
        value: d.Volume, // for volume series
      };
    }).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // Filter out invalid times just in case
    const validData = sortedData.filter(d => !isNaN(new Date(d.time).getTime()));
    
    // De-duplicate times (lightweight-charts requires strictly ascending time)
    const uniqueData: any[] = [];
    const seenTimes = new Set();
    for (const d of validData) {
      if (!seenTimes.has(d.time)) {
        seenTimes.add(d.time);
        uniqueData.push(d);
      }
    }

    if (!uniqueData.length) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#42bd7f',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#42bd7f',
      wickDownColor: '#f23645',
    });

    candlestickSeries.setData(uniqueData);

    // SMA 50
    const smaData = [];
    for (let i = 0; i < uniqueData.length; i++) {
      if (i < 49) continue;
      let sum = 0;
      for (let j = 0; j < 50; j++) {
        sum += uniqueData[i - j].close;
      }
      smaData.push({ time: uniqueData[i].time, value: sum / 50 });
    }

    const smaSeries = chart.addLineSeries({
      color: '#2962FF',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    
    if (smaData.length > 0) {
      smaSeries.setData(smaData);
    }

    // Volume Series
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // set as an overlay
    });

    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.8, // highest point of the series will be at 80% of the chart
        bottom: 0,
      },
    });

    const volumeData = uniqueData.map((d: any) => ({
      time: d.time,
      value: d.value,
      color: d.close >= d.open ? 'rgba(66, 189, 127, 0.5)' : 'rgba(242, 54, 69, 0.5)'
    }));

    volumeSeries.setData(volumeData);

    chart.timeScale().fitContent();

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
    <div className="bg-[#131722] p-6 rounded-lg border border-border flex flex-col min-h-[600px]">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          Advanced Charting
        </h2>
        <p className="text-sm text-gray-400 mt-1">Interactive OHLCV with 50-DMA Overlay</p>
      </div>
      <div ref={chartContainerRef} className="flex-1 w-full relative" />
    </div>
  );
};
