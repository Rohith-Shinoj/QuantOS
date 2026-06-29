import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { HelpCircle, RefreshCw, Calendar } from 'lucide-react';
import { StockLogo } from '../../components/StockLogo';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { fetchLiveQuote, fetchStockData } from '../../api';

const TIMEFRAMES = ['1M', '3M', '6M', '1Y', '5Y', 'ALL', 'CUSTOM'];

function calculatePivots(data: any[], timeframe: '1D' | '1W' | '1M' | '1Y') {
  if (!data || data.length < 2) return null;

  const latestDate = new Date(data[data.length - 1].time);
  let targetData = [];

  if (timeframe === '1M') {
    const latestMonth = latestDate.getMonth();
    const latestYear = latestDate.getFullYear();
    for (let i = data.length - 1; i >= 0; i--) {
      const d = new Date(data[i].time);
      if (d.getMonth() !== latestMonth || d.getFullYear() !== latestYear) {
        const prevMonth = d.getMonth();
        const prevYear = d.getFullYear();
        for (let j = i; j >= 0; j--) {
          const pd = new Date(data[j].time);
          if (pd.getMonth() === prevMonth && pd.getFullYear() === prevYear) {
            targetData.push(data[j]);
          } else {
            break;
          }
        }
        break;
      }
    }
  } else if (timeframe === '1Y') {
    const latestYear = latestDate.getFullYear();
    for (let i = data.length - 1; i >= 0; i--) {
      const d = new Date(data[i].time);
      if (d.getFullYear() !== latestYear) {
        const prevYear = d.getFullYear();
        for (let j = i; j >= 0; j--) {
          const pd = new Date(data[j].time);
          if (pd.getFullYear() === prevYear) {
            targetData.push(data[j]);
          } else {
            break;
          }
        }
        break;
      }
    }
  } else if (timeframe === '1W') {
    const day = latestDate.getDay();
    const diff = latestDate.getDate() - day + (day === 0 ? -6 : 1);
    const currentMonday = new Date(latestDate.getFullYear(), latestDate.getMonth(), diff);
    
    const prevMonday = new Date(currentMonday);
    prevMonday.setDate(prevMonday.getDate() - 7);

    for (let i = data.length - 1; i >= 0; i--) {
      const d = new Date(data[i].time);
      if (d < currentMonday && d >= prevMonday) {
        targetData.push(data[i]);
      } else if (d < prevMonday) {
        break;
      }
    }
  }

  if (targetData.length === 0) return null;

  let high = -Infinity;
  let low = Infinity;
  let close = targetData[0].close; 

  targetData.forEach(d => {
    if (d.high > high) high = d.high;
    if (d.low < low) low = d.low;
  });

  const p = (high + low + close) / 3;
  return {
    pivotPoint: p,
    r1: (p * 2) - low,
    s1: (p * 2) - high,
    r2: p + (high - low),
    s2: p - (high - low),
    r3: high + 2 * (p - low),
    s3: low - 2 * (high - p)
  };
}

// Simple SMA calculator
function calculateSMA(data: any[], period: number) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push({ time: data[i].time, value: NaN });
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

// Bollinger Bands calculator
function calculateBollingerBands(data: any[], period: number, multiplier: number) {
  const sma = calculateSMA(data, period);
  const upper = [];
  const lower = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push({ time: data[i].time, value: NaN });
      lower.push({ time: data[i].time, value: NaN });
      continue;
    }
    let sumVariance = 0;
    const currentSMA = sma[i].value;
    for (let j = 0; j < period; j++) {
      sumVariance += Math.pow(data[i - j].close - currentSMA, 2);
    }
    const stdDev = Math.sqrt(sumVariance / period);
    upper.push({ time: data[i].time, value: currentSMA + stdDev * multiplier });
    lower.push({ time: data[i].time, value: currentSMA - stdDev * multiplier });
  }
  return { sma, upper, lower };
}

export const MultidimensionalChart = ({ data }: { data: any }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    const slug = data?.absolute?.slug;
    if (!slug) return;
    setIsRefreshing(true);
    try {
      const quote = await fetchLiveQuote(slug);
      
      queryClient.setQueryData(['stockData', slug], (old: any) => {
        if (!old) return old;
        const isZero = quote.dayChange === 0 && quote.dayChangePerc === 0;
        return {
          ...old,
          absolute: {
            ...old.absolute,
            'live price': String(quote.currentPrice),
            'day change': isZero ? old.absolute['day change'] : `${quote.dayChange > 0 ? '+' : ''}${quote.dayChange} (${quote.dayChangePerc?.toFixed(2)}%)`
          }
        };
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const hasFetched = useRef(false);
  useEffect(() => {
    const slug = data?.absolute?.slug;
    if (slug && !hasFetched.current) {
      hasFetched.current = true;
      handleRefresh();
    }
  }, [data?.absolute?.slug]);
  
  const [viewMode, setViewMode] = useState<'candles' | 'baseline'>('candles');
  const [showNifty, setShowNifty] = useState(false);
  const [showSector, setShowSector] = useState(false);
  const [showBands, setShowBands] = useState(false);
  const [showTechnicalLevels, setShowTechnicalLevels] = useState(false);
  const [pivotTimeframe, setPivotTimeframe] = useState<'1D' | '1W' | '1M' | '1Y'>('1D');
  const priceLinesRef = useRef<any[]>([]);
  const [timeframe, setTimeframe] = useState('ALL');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [periodStats, setPeriodStats] = useState({ change: 0, percentChange: 0, cagr: 0 });

  const getSectorSlug = (industry: string) => {
    const ind = industry.toLowerCase();
    if (ind.includes('bank') || ind.includes('finance')) return 'nifty-financial-services';
    if (ind.includes('it ') || ind.includes('software')) return 'nifty-it';
    if (ind.includes('pharma') || ind.includes('healthcare')) return 'nifty-pharma';
    if (ind.includes('metal')) return 'nifty-metal';
    if (ind.includes('auto')) return 'nifty-auto';
    if (ind.includes('realty') || ind.includes('construction')) return 'nifty-realty';
    if (ind.includes('fmcg') || ind.includes('consumer')) return 'nifty-fmcg';
    return 'nifty-total-market-index';
  };

  const getSectorName = (slug: string) => {
    switch (slug) {
      case 'nifty-financial-services': return 'NIFTY Fin Service';
      case 'nifty-bank': return 'Nifty Bank';
      case 'nifty-it': return 'Nifty IT';
      case 'nifty-pharma': return 'NIFTY Pharma';
      case 'nifty-metal': return 'Nifty Metal';
      case 'nifty-auto': return 'NIFTY Auto';
      case 'nifty-realty': return 'NIFTY Realty';
      case 'nifty-fmcg': return 'NIFTY FMCG';
      case 'nifty-total-market-index': return 'Total Market';
      default: return 'Index';
    }
  };

  const sectorSlug = getSectorSlug(data?.absolute?.header_raw?.industryName || '');
  const { data: sectorRaw } = useQuery({
    queryKey: ['stock', sectorSlug],
    queryFn: () => fetchStockData(sectorSlug),
    enabled: showSector,
  });

  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<any>({});
  const baseLineRef = useRef<any>(null);

  const { parsedData, niftyData, sectorData, baseValue } = useMemo(() => {
    const ohlcv = data?.absolute?.OHLCV || [];
    const rawNifty = data?.benchmark_ohlcv || [];

    const sortedData = ([...ohlcv].reverse().map((d: any) => {
      if (!d || !d.Date) return null;
      const [day, month, year] = d.Date.split('-');
      return {
        time: `${year}-${month}-${day}`,
        open: d.Open,
        high: d.High,
        low: d.Low,
        close: d.Close,
        value: d.Volume,
      };
    }).filter(Boolean) as any[]).sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // Deduplicate
    const uniqueData: any[] = [];
    const seenTimes = new Set();
    for (const d of sortedData) {
      if (!seenTimes.has(d.time) && !isNaN(new Date(d.time).getTime())) {
        seenTimes.add(d.time);
        uniqueData.push(d);
      }
    }

    // Process Nifty
    const nData = ([...rawNifty].reverse().map((d: any) => {
      if (!d || !d.Date) return null;
      const [day, month, year] = d.Date.split('-');
      return {
        time: `${year}-${month}-${day}`,
        value: d.Close,
      };
    }).filter(Boolean) as any[]).sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const nUnique: any[] = [];
    const nSeen = new Set();
    for (const d of nData) {
      if (!nSeen.has(d.time) && !isNaN(new Date(d.time).getTime()) && seenTimes.has(d.time)) {
        nSeen.add(d.time);
        nUnique.push(d);
      }
    }

    // Process Sector
    const sData = ([...(sectorRaw?.absolute?.OHLCV || [])].reverse().map((d: any) => {
      if (!d || !d.Date) return null;
      const [day, month, year] = d.Date.split('-');
      return {
        time: `${year}-${month}-${day}`,
        value: d.Close,
      };
    }).filter(Boolean) as any[]).sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const sUnique: any[] = [];
    const sSeen = new Set();
    for (const d of sData) {
      if (!sSeen.has(d.time) && !isNaN(new Date(d.time).getTime()) && seenTimes.has(d.time)) {
        sSeen.add(d.time);
        sUnique.push(d);
      }
    }

    // Default base value for the Baseline chart (start of visible range ideally, but we use first point for now)
    const baseVal = uniqueData.length > 0 ? uniqueData[0].close : 0;

    return { parsedData: uniqueData, niftyData: nUnique, sectorData: sUnique, baseValue: baseVal };
  }, [data, sectorRaw]);

  // Main Chart Initialization
  useEffect(() => {
    if (!chartContainerRef.current || parsedData.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(39, 39, 42, 0.5)' },
        horzLines: { color: 'rgba(39, 39, 42, 0.5)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(39, 39, 42, 0.8)',
      },
      timeScale: {
        borderColor: 'rgba(39, 39, 42, 0.8)',
      },
    });

    chartRef.current = chart;

    // 1. Candles Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candleSeries.setData(parsedData);
    seriesRefs.current.candle = candleSeries;

    // 2. Baseline Series
    const baselineSeries = chart.addBaselineSeries({
      baseValue: { type: 'price', price: baseValue },
      topLineColor: '#10b981',
      topFillColor1: 'rgba(16, 185, 129, 0.28)',
      topFillColor2: 'rgba(16, 185, 129, 0.05)',
      bottomLineColor: '#ef4444',
      bottomFillColor1: 'rgba(239, 68, 68, 0.05)',
      bottomFillColor2: 'rgba(239, 68, 68, 0.28)',
      baseLineColor: 'rgba(255, 255, 255, 0.4)',
      baseLineStyle: LineStyle.Dotted,
      baseLineWidth: 1,
    });
    baselineSeries.setData(parsedData.map(d => ({ time: d.time, value: d.close })));
    seriesRefs.current.baseline = baselineSeries;

    // 3. Volume Histogram
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Overlay
    });
    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeries.setData(parsedData.map(d => ({
      time: d.time,
      value: d.value,
      color: d.close >= d.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'
    })));
    seriesRefs.current.volume = volumeSeries;

    // 4. Bollinger Bands (Decluttered but visible)
    const { sma, upper, lower } = calculateBollingerBands(parsedData, 20, 2);
    
    // Store last values for labels
    const validUpper = upper.filter(d => !isNaN(d.value));
    const validLower = lower.filter(d => !isNaN(d.value));
    const validSma = sma.filter(d => !isNaN(d.value));
    
    if (validUpper.length > 0) bandValuesRef.current.upper = validUpper[validUpper.length - 1].value;
    if (validLower.length > 0) bandValuesRef.current.lower = validLower[validLower.length - 1].value;
    if (validSma.length > 0) bandValuesRef.current.sma = validSma[validSma.length - 1].value;
    
    const upperBand = chart.addBaselineSeries({ 
      topLineColor: 'rgba(167, 139, 250, 0.7)',
      bottomLineColor: 'rgba(167, 139, 250, 0.7)',
      topFillColor1: 'transparent',
      topFillColor2: 'transparent',
      bottomFillColor1: 'transparent',
      bottomFillColor2: 'transparent',
      lineWidth: 2, 
      lineStyle: LineStyle.Dashed,
      crosshairMarkerVisible: false,
    });
    upperBand.setData(upper.filter(d => !isNaN(d.value)));
    seriesRefs.current.upperBand = upperBand;

    const lowerBand = chart.addBaselineSeries({ 
      topLineColor: 'rgba(167, 139, 250, 0.7)',
      bottomLineColor: 'rgba(167, 139, 250, 0.7)',
      topFillColor1: 'transparent',
      topFillColor2: 'transparent',
      bottomFillColor1: 'transparent',
      bottomFillColor2: 'transparent',
      lineWidth: 2, 
      lineStyle: LineStyle.Dashed,
      crosshairMarkerVisible: false,
    });
    lowerBand.setData(lower.filter(d => !isNaN(d.value)));
    seriesRefs.current.lowerBand = lowerBand;

    const smaLine = chart.addBaselineSeries({ 
      topLineColor: 'rgba(167, 139, 250, 0.4)',
      bottomLineColor: 'rgba(167, 139, 250, 0.4)',
      topFillColor1: 'transparent',
      topFillColor2: 'transparent',
      bottomFillColor1: 'transparent',
      bottomFillColor2: 'transparent',
      lineWidth: 1, 
      lineStyle: LineStyle.Solid, 
      crosshairMarkerVisible: false,
    });
    smaLine.setData(sma.filter(d => !isNaN(d.value)));
    seriesRefs.current.sma = smaLine;

    // 5. Nifty 50 Overlay
    const niftySeries = chart.addLineSeries({
      color: 'rgba(234, 179, 8, 0.6)', // Less opaque
      lineWidth: 1, // Thinner line
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: true,
    });
    niftySeries.setData(niftyData);
    seriesRefs.current.nifty = niftySeries;

    // 6. Sector Overlay
    const sectorSeries = chart.addLineSeries({
      color: 'rgba(168, 85, 247, 0.6)', // Purple for sector
      lineWidth: 1,
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: true,
    });
    // @ts-ignore
    sectorSeries.setData(sectorData || []);
    seriesRefs.current.sector = sectorSeries;

    // Add Axis Labels via Price Lines
    if (parsedData.length > 0) {
      const lastPrice = parsedData[parsedData.length - 1].close;
      candleSeries.createPriceLine({
        price: lastPrice,
        color: 'transparent',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
      });
      baselineSeries.createPriceLine({
        price: lastPrice,
        color: 'transparent',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
      });
      baseLineRef.current = baselineSeries.createPriceLine({
        price: baseValue,
        color: 'rgba(255, 255, 255, 0.4)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
      });
    }

    if (niftyData.length > 0) {
      niftySeries.createPriceLine({
        price: niftyData[niftyData.length - 1].value,
        color: 'transparent',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
      });
    }

    // Initial visibility state
    candleSeries.applyOptions({ visible: true });
    baselineSeries.applyOptions({ visible: false });
    niftySeries.applyOptions({ visible: false });
    upperBand.applyOptions({ visible: false });
    lowerBand.applyOptions({ visible: false });
    smaLine.applyOptions({ visible: false });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    const toolTip = tooltipRef.current;
    chart.subscribeCrosshairMove(param => {
      if (
        !param.time ||
        param.point === undefined ||
        param.point.x < 0 ||
        param.point.x > chartContainerRef.current!.clientWidth ||
        param.point.y < 0 ||
        param.point.y > chartContainerRef.current!.clientHeight
      ) {
        if (toolTip) toolTip.style.opacity = '0';
        return;
      }

      const candleData: any = param.seriesData.get(candleSeries);
      const volData: any = param.seriesData.get(volumeSeries);

      if (candleData && toolTip && param.point) {
        toolTip.style.opacity = '1';
        const dateStr = param.time as string;
        
        let colorClass = 'text-text-primary';
        if (candleData.close > candleData.open) colorClass = 'text-emerald-400';
        else if (candleData.close < candleData.open) colorClass = 'text-red-400';

        let volStr = 'N/A';
        if (volData) {
           if (volData.value >= 10000000) volStr = (volData.value / 10000000).toFixed(2) + 'Cr';
           else if (volData.value >= 100000) volStr = (volData.value / 100000).toFixed(2) + 'L';
           else volStr = volData.value.toString();
        }

        // Floating positioning
        const toolTipWidth = 140; // Approx
        const toolTipHeight = 110; // Approx
        let left = param.point.x + 15;
        let top = param.point.y + 15;
        
        if (left + toolTipWidth > chartContainerRef.current!.clientWidth) {
           left = param.point.x - toolTipWidth - 15;
        }
        if (top + toolTipHeight > chartContainerRef.current!.clientHeight) {
           top = param.point.y - toolTipHeight - 15;
        }

        toolTip.style.left = left + 'px';
        toolTip.style.top = top + 'px';

        toolTip.innerHTML = `
          <div class="flex flex-col gap-1 w-full">
            <span class="text-text-secondary font-semibold border-b border-border pb-1 mb-1 text-center">${dateStr}</span>
            <div class="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span class="text-text-secondary">Open</span> <span class="text-text-primary text-right">${candleData.open.toFixed(2)}</span>
              <span class="text-text-secondary">High</span> <span class="text-text-primary text-right">${candleData.high.toFixed(2)}</span>
              <span class="text-text-secondary">Low</span> <span class="text-text-primary text-right">${candleData.low.toFixed(2)}</span>
              <span class="text-text-secondary">Close</span> <span class="${colorClass} font-bold text-right">${candleData.close.toFixed(2)}</span>
              <span class="text-text-secondary">Vol</span> <span class="text-text-primary text-right">${volStr}</span>
            </div>
          </div>
        `;
      } else if (toolTip) {
        toolTip.style.opacity = '0';
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [parsedData, niftyData, baseValue]);

  // Sync external HTML labels with canvas price positions
  const bandValuesRef = useRef({ upper: 0, lower: 0, sma: 0 });
  const labelRef = useRef<HTMLDivElement>(null);
  const niftyLabelRef = useRef<HTMLDivElement>(null);
  const sectorLabelRef = useRef<HTMLDivElement>(null);
  const upperLabelRef = useRef<HTMLDivElement>(null);
  const lowerLabelRef = useRef<HTMLDivElement>(null);
  const smaLabelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let reqId: number;
    const syncPositions = () => {
      if (!seriesRefs.current.candle || !seriesRefs.current.nifty) return;
      
      if (labelRef.current && parsedData.length > 0) {
        const y = seriesRefs.current.candle.priceToCoordinate(parsedData[parsedData.length - 1].close);
        if (y !== null && !isNaN(y)) {
          labelRef.current.style.top = `${y}px`;
          labelRef.current.style.display = 'block';
        } else {
          labelRef.current.style.display = 'none';
        }
      }
      
      if (niftyLabelRef.current && niftyData.length > 0) {
        const y = seriesRefs.current.nifty.priceToCoordinate(niftyData[niftyData.length - 1].value);
        if (y !== null && !isNaN(y) && showNifty) {
          niftyLabelRef.current.style.top = `${y}px`;
          niftyLabelRef.current.style.display = 'block';
        } else {
          niftyLabelRef.current.style.display = 'none';
        }
      }

      if (sectorLabelRef.current && (sectorData as any)?.length > 0) {
        const sData = sectorData as any;
        const y = seriesRefs.current.sector.priceToCoordinate(sData[sData.length - 1].value);
        if (y !== null && !isNaN(y) && showSector) {
          sectorLabelRef.current.style.top = `${y}px`;
          sectorLabelRef.current.style.display = 'block';
        } else {
          sectorLabelRef.current.style.display = 'none';
        }
      }
      
      if (upperLabelRef.current && seriesRefs.current.upperBand) {
        const y = seriesRefs.current.upperBand.priceToCoordinate(bandValuesRef.current.upper);
        if (y !== null && !isNaN(y) && showBands) {
          upperLabelRef.current.style.top = `${y}px`;
          upperLabelRef.current.style.display = 'block';
        } else {
          upperLabelRef.current.style.display = 'none';
        }
      }

      if (lowerLabelRef.current && seriesRefs.current.lowerBand) {
        const y = seriesRefs.current.lowerBand.priceToCoordinate(bandValuesRef.current.lower);
        if (y !== null && !isNaN(y) && showBands) {
          lowerLabelRef.current.style.top = `${y}px`;
          lowerLabelRef.current.style.display = 'block';
        } else {
          lowerLabelRef.current.style.display = 'none';
        }
      }

      if (smaLabelRef.current && seriesRefs.current.sma) {
        const y = seriesRefs.current.sma.priceToCoordinate(bandValuesRef.current.sma);
        if (y !== null && !isNaN(y) && showBands) {
          smaLabelRef.current.style.top = `${y}px`;
          smaLabelRef.current.style.display = 'block';
        } else {
          smaLabelRef.current.style.display = 'none';
        }
      }
      
      reqId = requestAnimationFrame(syncPositions);
    };
    reqId = requestAnimationFrame(syncPositions);
    return () => cancelAnimationFrame(reqId);
  }, [parsedData, niftyData, sectorData, showNifty, showSector, showBands]);

  // Update Sector Data when fetched
  useEffect(() => {
    if (seriesRefs.current.sector && sectorData) {
      seriesRefs.current.sector.setData(sectorData);
    }
  }, [sectorData]);

  // Handle Toggles & Timeframes
  useEffect(() => {
    const refs = seriesRefs.current;
    if (!chartRef.current || !refs.candle) return;

    // View Mode
    if (viewMode === 'candles') {
      refs.candle.applyOptions({ visible: true });
      refs.baseline.applyOptions({ visible: false });
    } else {
      refs.candle.applyOptions({ visible: false });
      refs.baseline.applyOptions({ visible: true });
    }

    // Volatility Bands
    refs.upperBand.applyOptions({ visible: showBands });
    refs.lowerBand.applyOptions({ visible: showBands });
    refs.sma.applyOptions({ visible: showBands });

    // Sector Overlay
    refs.sector?.applyOptions({ visible: showSector });
    
    // Nifty Overlay
    refs.nifty?.applyOptions({ visible: showNifty });
    
    if (showNifty || showSector) {
      chartRef.current.applyOptions({
        rightPriceScale: { mode: 2 } // Percentage mode
      });
    } else {
      chartRef.current.applyOptions({
        rightPriceScale: { mode: 0 } // Normal mode
      });
    }

  }, [viewMode, showNifty, showSector, showBands]);

  // Technical Overlays Update
  useEffect(() => {
    const refs = seriesRefs.current;
    if (!refs.candle || !refs.baseline) return;

    // Clear existing
    priceLinesRef.current.forEach(line => {
      try { refs.candle.removePriceLine(line); } catch(e){}
      try { refs.baseline.removePriceLine(line); } catch(e){}
    });
    priceLinesRef.current = [];

    let tech: any = {};
    if (pivotTimeframe === '1D') {
      tech = data?.absolute?.technicals || {};
    } else {
      const computed = calculatePivots(parsedData, pivotTimeframe);
      if (computed) tech = computed;
    }

    const availableOverlays = [
      { id: 'R3', label: 'R3', value: tech.r3, color: '#ef4444' },
      { id: 'R2', label: 'R2', value: tech.r2, color: '#ef4444' },
      { id: 'R1', label: 'R1', value: tech.r1, color: '#ef4444' },
      { id: 'Pivot', label: 'Pivot', value: tech.pivotPoint, color: '#eab308' },
      { id: 'S1', label: 'S1', value: tech.s1, color: '#10b981' },
      { id: 'S2', label: 'S2', value: tech.s2, color: '#10b981' },
      { id: 'S3', label: 'S3', value: tech.s3, color: '#10b981' }
    ].filter(o => o.value !== undefined && o.value !== null && !isNaN(o.value) && o.value !== 0);

    if (showTechnicalLevels) {
      availableOverlays.forEach(overlay => {
        const pl = {
          price: overlay.value,
          color: overlay.color,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          axisLabelColor: overlay.color,
          axisLabelTextColor: '#000',
          title: overlay.label,
        };
        const activeSeries = viewMode === 'candles' ? refs.candle : refs.baseline;
        if (activeSeries) {
          const line = activeSeries.createPriceLine(pl);
          priceLinesRef.current.push(line);
        }
      });
    }
  }, [viewMode, showTechnicalLevels, pivotTimeframe, data, parsedData]);

  // Handle Timeframe changes
  useEffect(() => {
    if (!chartRef.current || parsedData.length === 0) return;
    
    if (timeframe === 'ALL') {
      chartRef.current.timeScale().fitContent();
      const startPrice = parsedData[0].close;
      const endPrice = parsedData[parsedData.length - 1].close;
      const years = (new Date(parsedData[parsedData.length - 1].time).getTime() - new Date(parsedData[0].time).getTime()) / (365 * 24 * 60 * 60 * 1000);
      const cagr = years > 0 ? (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100 : 0;
      setPeriodStats({ change: endPrice - startPrice, percentChange: ((endPrice - startPrice) / startPrice) * 100, cagr });
      if (seriesRefs.current.baseline) {
        if (baseLineRef.current) seriesRefs.current.baseline.removePriceLine(baseLineRef.current);
        baseLineRef.current = seriesRefs.current.baseline.createPriceLine({
          price: startPrice,
          color: 'rgba(255, 255, 255, 0.4)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
        });
      }
      return;
    }

    let startRange = parsedData[0].time;
    let endRange = parsedData[parsedData.length - 1].time;
    let startIndex = 0;

    if (timeframe === 'CUSTOM' && customRange.start && customRange.end) {
      const startCutoff = new Date(customRange.start).getTime();
      const endCutoff = new Date(customRange.end).getTime();
      
      for (let i = 0; i < parsedData.length; i++) {
        if (new Date(parsedData[i].time).getTime() >= startCutoff) {
          startIndex = i;
          break;
        }
      }
      
      let endIndex = parsedData.length - 1;
      for (let i = parsedData.length - 1; i >= 0; i--) {
        if (new Date(parsedData[i].time).getTime() <= endCutoff) {
          endIndex = i;
          break;
        }
      }
      
      if (startIndex <= endIndex) {
        startRange = parsedData[startIndex].time;
        endRange = parsedData[endIndex].time;
      }
    } else {
      const now = new Date(parsedData[parsedData.length - 1].time).getTime();
      let cutoff = 0;
      
      switch (timeframe) {
        case '1M': cutoff = now - 30 * 24 * 60 * 60 * 1000; break;
        case '3M': cutoff = now - 90 * 24 * 60 * 60 * 1000; break;
        case '6M': cutoff = now - 180 * 24 * 60 * 60 * 1000; break;
        case '1Y': cutoff = now - 365 * 24 * 60 * 60 * 1000; break;
        case '5Y': cutoff = now - 5 * 365 * 24 * 60 * 60 * 1000; break;
      }
  
      for (let i = parsedData.length - 1; i >= 0; i--) {
        if (new Date(parsedData[i].time).getTime() < cutoff) {
          startIndex = i + 1;
          break;
        }
      }
      if (startIndex >= parsedData.length) startIndex = parsedData.length - 1;
      startRange = parsedData[startIndex].time;
      endRange = parsedData[parsedData.length - 1].time;
    }

    // Update baseline value to start of visible range for ALL synced series
    const baseValueConfig = { type: 'price' as const, price: parsedData[startIndex].close };
    if (seriesRefs.current.baseline) {
      seriesRefs.current.baseline.applyOptions({ baseValue: baseValueConfig });
      if (baseLineRef.current) seriesRefs.current.baseline.removePriceLine(baseLineRef.current);
      baseLineRef.current = seriesRefs.current.baseline.createPriceLine({
        price: parsedData[startIndex].close,
        color: 'rgba(255, 255, 255, 0.4)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
      });
    }
    if (seriesRefs.current.upperBand) seriesRefs.current.upperBand.applyOptions({ baseValue: baseValueConfig });
    if (seriesRefs.current.lowerBand) seriesRefs.current.lowerBand.applyOptions({ baseValue: baseValueConfig });
    if (seriesRefs.current.sma) seriesRefs.current.sma.applyOptions({ baseValue: baseValueConfig });

    const startPrice = parsedData[startIndex].close;
    const endPrice = parsedData[parsedData.length - 1].close;
    const years = (new Date(endRange).getTime() - new Date(startRange).getTime()) / (365 * 24 * 60 * 60 * 1000);
    const cagr = years > 0 ? (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100 : 0;
    setPeriodStats({ change: endPrice - startPrice, percentChange: ((endPrice - startPrice) / startPrice) * 100, cagr });

    chartRef.current.timeScale().setVisibleRange({ from: startRange, to: endRange });

  }, [timeframe, customRange, parsedData]);

  // Top header metrics strictly 1D
  let pctChange = 0;
  let priceDiff = 0;
  let rawLivePrice = data?.absolute?.absolute_data?.["live price"];
  let currentPrice = 0;
  
  if (parsedData.length > 0) {
    const lastClose = parsedData[parsedData.length - 1].close;
    if (typeof rawLivePrice === 'number') {
      currentPrice = rawLivePrice;
    } else if (typeof rawLivePrice === 'string') {
      const parsed = parseFloat(rawLivePrice.replace(/[^0-9.-]+/g,""));
      currentPrice = isNaN(parsed) ? lastClose : parsed;
    } else {
      currentPrice = lastClose;
    }
    const prevClose = parsedData.length > 1 ? parsedData[parsedData.length - 2].close : currentPrice;
    priceDiff = currentPrice - prevClose;
    pctChange = prevClose !== 0 ? (priceDiff / prevClose) * 100 : 0;
  }
  const isPositive = priceDiff >= 0;

  return (
    <div className="bg-canvas border-b border-border h-full flex flex-col">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border-b border-border gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <StockLogo ticker={data?.absolute?.ticker || ''} className="w-14 h-14 shadow-md" textClass="text-sm" fallbackClass="bg-surface border border-border text-text-primary" />
          <div className="flex flex-col justify-center gap-0.5">
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-extrabold text-white tracking-tight leading-none">{data?.absolute?.ticker}</h3>
              <span className="text-sm text-text-secondary leading-none">{data?.absolute?.name}</span>
              {data?.absolute?.header_raw?.industryName && (
                <span className="px-2 py-0.5 rounded-full bg-surface border border-border text-[10px] text-text-secondary font-medium tracking-wide shadow-sm">
                  {data.absolute.header_raw.industryName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-white leading-none">₹{currentPrice.toFixed(2)}</span>
              <span className={`text-sm font-semibold leading-none ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPositive ? '+' : ''}{priceDiff.toFixed(2)} ({isPositive ? '+' : ''}{pctChange.toFixed(2)}%) <span className="text-[10px] font-bold text-text-secondary ml-0.5">1D</span>
              </span>
              <button 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="ml-2 flex items-center gap-1.5 px-2 py-1 bg-surface-hover hover:bg-border border border-border rounded text-[10px] font-semibold text-text-primary transition-all disabled:opacity-50"
              >
                <RefreshCw size={10} className={isRefreshing ? "animate-spin" : ""} />
                Sync
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Toggles */}
          <div className="flex items-center gap-2 text-xs font-medium relative">
            <span className="text-text-secondary mr-1 group flex items-center gap-1 cursor-help relative z-50">
              VIEW:
              <HelpCircle size={12} className="text-text-secondary opacity-50 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-surface/95 backdrop-blur-md border border-border rounded-lg p-2 text-[10px] text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl whitespace-normal text-left">
                <div className="font-bold text-text-primary mb-1 text-[11px]">View Modes</div>
                <div className="mb-0.5 leading-tight"><strong className="text-indigo-400">Candles:</strong> Micro-psychology (intraday).</div>
                <div className="leading-tight"><strong className="text-emerald-400">Baseline Area:</strong> Macro-trend (anchors to 0).</div>
              </div>
            </span>
            <button 
              onClick={() => setViewMode('candles')}
              className={`px-3 py-1.5 rounded transition-all border ${viewMode === 'candles' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-surface text-text-secondary border-border hover:text-text-primary hover:bg-surface-hover'}`}
            >
              Candles
            </button>
            <button 
              onClick={() => setViewMode('baseline')}
              className={`px-3 py-1.5 rounded transition-all border ${viewMode === 'baseline' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-surface text-text-secondary border-border hover:text-text-primary hover:bg-surface-hover'}`}
            >
              Baseline Area
            </button>
            
            <div className="w-px h-4 bg-border mx-1"></div>
            
            <span className="text-text-secondary mx-1 group flex items-center gap-1 cursor-help relative z-50">
              OVERLAYS:
              <HelpCircle size={12} className="text-text-secondary opacity-50 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 bg-surface/95 backdrop-blur-md border border-border rounded-lg p-2 text-[10px] text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl whitespace-normal text-left">
                <div className="font-bold text-text-primary mb-1 text-[11px]">Overlays</div>
                <div className="mb-0.5 leading-tight"><strong className="text-yellow-400">vs Nifty 50:</strong> Market context (relative strength).</div>
                <div className="mb-0.5 leading-tight"><strong className="text-purple-400">vs Sector:</strong> Industry-specific benchmark.</div>
                <div className="mb-0.5 leading-tight"><strong className="text-purple-400">Volatility Bands:</strong> Risk/Entry (Top=Overbought).</div>
                <div className="mb-0.5 leading-tight"><strong className="text-blue-400">Technical Levels:</strong> Pivot points and Current Price.</div>
              </div>
            </span>
            <button 
              onClick={() => {
                const nextState = !showNifty;
                setShowNifty(nextState);
                if (nextState) setShowBands(false);
              }}
              className={`px-3 py-1.5 rounded transition-all border ${showNifty ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-surface text-text-secondary border-border hover:text-text-primary hover:bg-surface-hover'}`}
            >
              vs Nifty 50
            </button>
            <button 
              onClick={() => {
                const nextState = !showSector;
                setShowSector(nextState);
                if (nextState) setShowBands(false);
              }}
              className={`px-3 py-1.5 rounded transition-all border ${showSector ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-surface text-text-secondary border-border hover:text-text-primary hover:bg-surface-hover'}`}
            >
              Sector ({getSectorName(sectorSlug)})
            </button>
            <button 
              onClick={() => {
                const nextState = !showBands;
                setShowBands(nextState);
                if (nextState) { setShowNifty(false); setShowSector(false); }
              }}
              className={`px-3 py-1.5 rounded transition-all border ${showBands ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-surface text-text-secondary border-border hover:text-text-primary hover:bg-surface-hover'}`}
            >
              Volatility Bands
            </button>
            
            <div className="w-px h-4 bg-border mx-1"></div>

            {/* Technical Overlays Toggle */}
            <div className="flex items-center">
              <button
                onClick={() => setShowTechnicalLevels(prev => !prev)}
                className={`px-3 py-1.5 rounded transition-all border ${
                  showTechnicalLevels 
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 rounded-r-none border-r-0' 
                    : 'bg-surface text-text-secondary border-border hover:text-text-primary hover:bg-surface-hover'
                }`}
              >
                Technical Levels
              </button>
              {showTechnicalLevels && (
                <select
                  value={pivotTimeframe}
                  onChange={(e) => setPivotTimeframe(e.target.value as '1D'|'1W'|'1M'|'1Y')}
                  className="px-2 py-1.5 rounded rounded-l-none bg-blue-500/10 text-blue-400 border border-blue-500/30 focus:outline-none cursor-pointer text-sm"
                >
                  <option value="1D" className="bg-surface text-text-primary">1D</option>
                  <option value="1W" className="bg-surface text-text-primary">1W</option>
                  <option value="1M" className="bg-surface text-text-primary">1M</option>
                  <option value="1Y" className="bg-surface text-text-primary">1Y</option>
                </select>
              )}
            </div>
          </div>

          {/* Timeframes & Stats */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${periodStats.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {periodStats.change >= 0 ? '+' : ''}{periodStats.change.toFixed(2)} ({periodStats.change >= 0 ? '+' : ''}{periodStats.percentChange.toFixed(2)}%)
              </span>
              {(timeframe === '1Y' || timeframe === '5Y' || timeframe === 'ALL' || timeframe === 'CUSTOM') && (
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                  {periodStats.cagr.toFixed(2)}% CAGR
                </span>
              )}
            </div>
            
            {timeframe === 'CUSTOM' && (
              <div className="flex items-center gap-2 mr-2">
                <input 
                  type="date" 
                  value={customRange.start}
                  onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-surface border border-border text-xs text-text-primary px-2 py-1 rounded outline-none focus:border-alpha"
                />
                <span className="text-text-secondary text-xs">to</span>
                <input 
                  type="date" 
                  value={customRange.end}
                  onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-surface border border-border text-xs text-text-primary px-2 py-1 rounded outline-none focus:border-alpha"
                />
              </div>
            )}

            <div className="flex bg-surface-hover p-1 rounded-md border border-border gap-1">
              {TIMEFRAMES.map(t => (
                <button 
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center justify-center min-w-[32px] ${timeframe === t ? 'bg-alpha text-canvas shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
                >
                  {t === 'CUSTOM' ? <Calendar size={14} /> : t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Chart Area */}
      <div className="flex-1 min-h-0 relative flex">
        <div className="flex-1 relative">
          <div ref={chartContainerRef} className="absolute inset-0" />
          
          <div 
            ref={tooltipRef} 
            className="absolute z-50 pointer-events-none text-[11px] bg-surface/95 backdrop-blur-md p-2.5 rounded-lg border border-border opacity-0 shadow-xl transition-opacity duration-150 min-w-[140px]"
          ></div>
        </div>
        
        {/* Right-side External Labels */}
        <div className="w-20 relative bg-canvas shrink-0" style={{ borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
          <div ref={labelRef} className="absolute left-1 hidden transform -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-canvas border border-border text-text-primary text-[10px] px-1.5 py-0.5 rounded font-medium shadow-lg whitespace-nowrap">
              {data?.absolute?.ticker || 'Current'}
            </div>
          </div>
          <div ref={niftyLabelRef} className="absolute left-1 hidden transform -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-yellow-500/90 text-black text-[10px] px-1.5 py-0.5 rounded font-medium shadow-lg whitespace-nowrap">
              NIFTY 50
            </div>
          </div>
          <div ref={sectorLabelRef} className="absolute left-1 hidden transform -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-purple-500/90 text-white text-[10px] px-1.5 py-0.5 rounded font-medium shadow-lg whitespace-nowrap">
              {getSectorName(sectorSlug)}
            </div>
          </div>
          <div ref={upperLabelRef} className="absolute left-1 hidden transform -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-purple-800/20 border border-purple-800/80 text-white text-[10px] px-1 py-0.5 rounded font-medium shadow-lg whitespace-nowrap">
              +2σ
            </div>
          </div>
          <div ref={lowerLabelRef} className="absolute left-1 hidden transform -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-purple-800/20 border border-purple-800/80 text-white text-[10px] px-1 py-0.5 rounded font-medium shadow-lg whitespace-nowrap">
              -2σ
            </div>
          </div>
          <div ref={smaLabelRef} className="absolute left-1 hidden transform -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-purple-800/20 border border-purple-800/80 text-white text-[10px] px-1 py-0.5 rounded font-medium shadow-lg whitespace-nowrap">
              SMA 20
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
