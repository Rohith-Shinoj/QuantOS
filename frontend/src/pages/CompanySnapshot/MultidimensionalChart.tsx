import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { HelpCircle, RefreshCw, Calendar, BrainCircuit, Settings, Lock, ChevronDown } from 'lucide-react';
import { StockLogo } from '../../components/StockLogo';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { fetchLiveQuote, fetchStockData } from '../../api';
import { calculateATR, calculateOBV, calculateRSDivergence, findSwingPivots, detectGeometricPatterns } from '../../utils/QuantitativeEngine';
import { TrendLinePrimitive } from '../../plugins/TrendLinePrimitive';
import { WedgePrimitive } from '../../plugins/WedgePrimitive';

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
  const bbw: any[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push({ time: data[i].time, value: NaN });
      lower.push({ time: data[i].time, value: NaN });
      bbw.push({ time: data[i].time, value: NaN });
      continue;
    }
    let sumVariance = 0;
    const currentSMA = sma[i].value;
    for (let j = 0; j < period; j++) {
      sumVariance += Math.pow(data[i - j].close - currentSMA, 2);
    }
    const stdDev = Math.sqrt(sumVariance / period);
    const u = currentSMA + stdDev * multiplier;
    const l = currentSMA - stdDev * multiplier;
    upper.push({ time: data[i].time, value: u });
    lower.push({ time: data[i].time, value: l });
    bbw.push({ time: data[i].time, value: currentSMA > 0 ? ((u - l) / currentSMA) * 100 : 0 });
  }
  return { sma, upper, lower, bbw };
}

export const MultidimensionalChart = ({ 
  data, 
  centralMode = 'PRICE', 
  setCentralMode, 
  setIsAIOverlayOpen 
}: { 
  data: any, 
  centralMode?: 'PRICE' | 'PAIRS', 
  setCentralMode?: (m: 'PRICE' | 'PAIRS') => void, 
  setIsAIOverlayOpen?: (o: boolean) => void 
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    const slug = data?.slug || data?.absolute?.slug;
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
    const slug = data?.slug || data?.absolute?.slug;
    if (slug && !hasFetched.current) {
      hasFetched.current = true;
      handleRefresh();
    }
  }, [data?.slug, data?.absolute?.slug]);
  
  const [viewMode, setViewMode] = useState<'candles' | 'baseline'>('candles');
  const [showNifty, setShowNifty] = useState(false);
  const [showSector, setShowSector] = useState(false);
  const [showBands, setShowBands] = useState(false);
  const [showMacroPatterns, setShowMacroPatterns] = useState(false);
  const [showTechnicalLevels, setShowTechnicalLevels] = useState(false);
  const [pivotTimeframe, setPivotTimeframe] = useState<'1D' | '1W' | '1M' | '1Y'>('1D');
  const priceLinesRef = useRef<any[]>([]);
  const [timeframe, setTimeframe] = useState('ALL');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [periodStats, setPeriodStats] = useState({ change: 0, percentChange: 0, cagr: 0 });
  const trendLinePluginRef = useRef<TrendLinePrimitive | null>(null);
  const wedgePluginRef = useRef<WedgePrimitive | null>(null);
  
  const [patternFilter, setPatternFilter] = useState<'ALL' | 'FORMING' | 'REACHED'>('ALL');
  const [showPatternSettings, setShowPatternSettings] = useState(false);
  
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [activeDrawPoint, setActiveDrawPoint] = useState<{time: number | string, price: number, x: number} | null>(null);
  const [userLines, setUserLines] = useState<any[]>([]);
  
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<'start' | 'end' | null>(null);

  // Global keydown for deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedLineId) {
          setUserLines(prev => prev.filter(l => l.id !== selectedLineId));
          setSelectedLineId(null);
          setDragState(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLineId]);

  useEffect(() => {
    if (trendLinePluginRef.current) {
      trendLinePluginRef.current.setSelectedLineId(selectedLineId);
    }
  }, [selectedLineId]);

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
  const mlSeriesRefs = useRef<any[]>([]);
  const baseLineRef = useRef<any>(null);

  const { parsedData, niftyData, sectorData, baseValue, delistedPadIndex, isDelisted } = useMemo(() => {
    const livePriceStr = String(data?.absolute?.['live price'] || '');
    const priceVal = parseFloat(livePriceStr.replace(/[^\d.]/g, '')) || 0;
    const isDelisted = priceVal === 0;

    const ohlcv = data?.absolute?.OHLCV || [];
    const rawNifty = data?.benchmark_ohlcv || [];

    const sortedData = ([...ohlcv].reverse().map((d: any) => {
      if (!d || !d.Date) return null;
      let timeStr = d.Date;
      const parts = d.Date.split('-');
      if (parts.length === 3 && parts[2].length === 4) {
        timeStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return {
        time: timeStr,
        open: d.Open,
        high: d.High,
        low: d.Low,
        close: d.Close,
        value: d.Volume,
      };
    }).filter(Boolean) as any[]).sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());

    let delistedPadIndex = -1;
    
    if (isDelisted && sortedData.length > 0) {
      delistedPadIndex = sortedData.length;
      const lastData = sortedData[sortedData.length - 1];
      const lastDate = new Date(lastData.time);
      const today = new Date();
      
      let currDate = new Date(lastDate);
      currDate.setDate(currDate.getDate() + 1);
      
      while (currDate <= today) {
        if (currDate.getDay() !== 0 && currDate.getDay() !== 6) { // Skip weekends
          sortedData.push({
            time: currDate.getTime() / 1000,
            open: lastData.close,
            high: lastData.close,
            low: lastData.close,
            close: lastData.close,
            volume: 0,
            Date: `${String(currDate.getDate()).padStart(2, '0')}-${String(currDate.getMonth() + 1).padStart(2, '0')}-${currDate.getFullYear()}`
          });
        }
        currDate.setDate(currDate.getDate() + 1);
      }
    }

    const uniqueData: any[] = [];
    const seenTimes = new Set();
    for (const d of sortedData) {
      if (!seenTimes.has(d.time) && !isNaN(new Date(d.time).getTime())) {
        seenTimes.add(d.time);
        uniqueData.push(d);
      }
    }

    const nData = ([...rawNifty].reverse().map((d: any) => {
      if (!d || !d.Date) return null;
      let timeStr = d.Date;
      const parts = d.Date.split('-');
      if (parts.length === 3 && parts[2].length === 4) {
        timeStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return {
        time: timeStr,
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

    const sData = ([...(sectorRaw?.absolute?.OHLCV || [])].reverse().map((d: any) => {
      if (!d || !d.Date) return null;
      let timeStr = d.Date;
      const parts = d.Date.split('-');
      if (parts.length === 3 && parts[2].length === 4) {
        timeStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return {
        time: timeStr,
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

    const baseVal = uniqueData.length > 0 ? uniqueData[0].close : 0;

    return { parsedData: uniqueData, niftyData: nUnique, sectorData: sUnique, baseValue: baseVal, delistedPadIndex, isDelisted };
  }, [data, sectorRaw]);

  // Strict useMemo for Quantitative Engine
  const quantData = useMemo(() => {
    if (parsedData.length === 0) return { atr: [], obv: [], geometricPatterns: [], lines: [] };
    
    const instAccum = data?.absolute?.inst_accum || 0;
    
    // 1. Math Arrays
    const atr = calculateATR(parsedData, 14);
    const obv = calculateOBV(parsedData);
    
    // 2. Structural Overlays
    const { swingHighs, swingLows } = (showMacroPatterns && !showNifty && !showSector) ? findSwingPivots(parsedData, 10) : { swingHighs: [], swingLows: [] };
    const geometricPatternsAll = (showMacroPatterns && !showNifty && !showSector) ? detectGeometricPatterns(parsedData, swingHighs, swingLows, atr) : [];
    const geometricPatterns = geometricPatternsAll.filter(p => patternFilter === 'ALL' || p.status === patternFilter);
    
    const lines = showMacroPatterns ? calculateRSDivergence(parsedData, niftyData.length > 0 ? niftyData : null) : [];
    
    const exhaustionMarkers: any[] = [];
    if (showMacroPatterns && lines.length > 0) {
      lines.forEach((line: any) => {
        if (line.type === 'divergence' && parsedData[line.endX]) {
          exhaustionMarkers.push({
            time: parsedData[line.endX].time,
            position: 'aboveBar',
            color: '#ef4444',
            shape: 'arrowDown',
            text: 'Trim/Sell Warning (Exhaustion)',
          });
        }
      });
    }
    
    return { atr, obv, geometricPatterns, lines, exhaustionMarkers };
  }, [parsedData, niftyData, data?.absolute, showMacroPatterns, patternFilter]);

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
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
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
    
    const trendlinePrimitive = new TrendLinePrimitive([]);
    candleSeries.attachPrimitive(trendlinePrimitive);
    trendLinePluginRef.current = trendlinePrimitive;

    const wedgePrimitive = new WedgePrimitive([]);
    candleSeries.attachPrimitive(wedgePrimitive);
    wedgePluginRef.current = wedgePrimitive;

    // 2. Baseline Series
    const baselineSeries = chart.addBaselineSeries({
      baseValue: { type: 'price', price: isDelisted ? (parsedData[0]?.close || 1) : baseValue },
      topLineColor: isDelisted ? '#ef4444' : '#10b981',
      topFillColor1: isDelisted ? 'rgba(239, 68, 68, 0.28)' : 'rgba(16, 185, 129, 0.28)',
      topFillColor2: isDelisted ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)',
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

    // 4. Bollinger Bands & Volatility Squeeze (Decluttered but visible)
    const { sma, upper, lower, bbw } = calculateBollingerBands(parsedData, 20, 2);
    
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

    // Volatility Squeeze (BBW) Heatmap
    const bbwSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'bbw',
    });
    chart.priceScale('bbw').applyOptions({
      scaleMargins: { top: 0.9, bottom: 0 },
    });
    
    let maxBbw = 0, minBbw = Infinity;
    bbw.forEach(d => {
       if (!isNaN(d.value)) {
           if(d.value > maxBbw) maxBbw = d.value;
           if(d.value < minBbw) minBbw = d.value;
       }
    });
    
    const bbwData = bbw.map(d => {
       let color = 'rgba(167, 139, 250, 0.2)'; // purple
       if (!isNaN(d.value) && maxBbw > minBbw) {
          const pct = (d.value - minBbw) / (maxBbw - minBbw);
          if (pct < 0.15) color = 'rgba(37, 99, 235, 0.8)'; // dark blue (squeeze)
          else if (pct > 0.85) color = 'rgba(239, 68, 68, 0.8)'; // bright red (expansion)
       }
       return { time: d.time, value: d.value, color };
    });
    bbwSeries.setData(bbwData.filter(d => !isNaN(d.value)));
    seriesRefs.current.bbw = bbwSeries;

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

    if (delistedPadIndex !== -1 && delistedPadIndex < parsedData.length) {
      const delistArea = chart.addAreaSeries({
        lineColor: 'rgba(239, 68, 68, 1)',
        topColor: 'rgba(239, 68, 68, 0.25)',
        bottomColor: 'rgba(239, 68, 68, 0.05)',
        lineWidth: 1,
        crosshairMarkerVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      
      const paddedPoints = parsedData.slice(delistedPadIndex - 1).map(d => ({
        time: d.time,
        value: d.close
      }));
      delistArea.setData(paddedPoints);
      
      const firstPadded = parsedData[delistedPadIndex];
      const marker = {
        time: firstPadded.time,
        position: 'aboveBar' as const,
        color: '#ef4444',
        shape: 'arrowDown' as const,
        text: 'Delisted',
      };
      // @ts-ignore
      candleSeries.setMarkers([marker] as any);
      // @ts-ignore
      baselineSeries.setMarkers([marker] as any);
    }

    // Initial visibility state
    candleSeries.applyOptions({ visible: true });
    baselineSeries.applyOptions({ visible: false });
    niftySeries.applyOptions({ visible: false });
    upperBand.applyOptions({ visible: false });
    lowerBand.applyOptions({ visible: false });
    smaLine.applyOptions({ visible: false });
    bbwSeries.applyOptions({ visible: false });

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

  // Effect to update chart markers and geometric patterns
  useEffect(() => {
    if (!seriesRefs.current.candle) return;
    let markersToSet: any[] = delistedPadIndex !== -1 ? [{
      time: parsedData[delistedPadIndex]?.time,
      position: 'aboveBar' as const,
      color: '#ef4444',
      shape: 'arrowDown' as const,
      text: 'Delisted',
    }] : [];
    
    if (showMacroPatterns) {
      if (quantData.exhaustionMarkers && quantData.exhaustionMarkers.length > 0) {
        markersToSet = [...markersToSet, ...quantData.exhaustionMarkers];
      }
    }
    
    // Sort markers by time before setting to avoid lightweight-charts sorting issues
    markersToSet.sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
    seriesRefs.current.candle.setMarkers(markersToSet as any);
    if (seriesRefs.current.baseline) {
       seriesRefs.current.baseline.setMarkers(markersToSet as any);
    }

    // Render Finite Geometric Patterns using WedgePrimitive plugin
    if (wedgePluginRef.current) {
      wedgePluginRef.current.setPatterns(showMacroPatterns && quantData ? quantData.geometricPatterns : []);
    }

    if (showMacroPatterns && quantData.geometricPatterns && quantData.geometricPatterns.length > 0) {
      quantData.geometricPatterns.forEach((pattern: any) => {
        if (pattern.targetPrice && pattern.showTargetInUI) {
          const targetLine = seriesRefs.current.candle.createPriceLine({
            price: pattern.targetPrice,
            color: pattern.color || '#10b981',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'Target',
          });
          // Track this for cleanup if necessary, though it might persist on the series
          mlSeriesRefs.current.push(targetLine as any); 
        }
      });
    }

    if (trendLinePluginRef.current) {
      const activeAlgorithmic = showMacroPatterns && quantData ? quantData.lines : [];
      trendLinePluginRef.current.setLines([...activeAlgorithmic, ...userLines]);
    }

    // React Cleanup: Ensure dynamically generated series and lines are removed on unmount or dependency change safely
    return () => {
      if (chartRef.current) {
        mlSeriesRefs.current.forEach(s => {
          if (s) {
            try { 
              if ((s as any).price !== undefined) {
                 seriesRefs.current.candle.removePriceLine(s);
              } else {
                 chartRef.current?.removeSeries(s);
              }
            } catch (e) {}
          }
        });
        mlSeriesRefs.current = [];
      }
    };
  }, [quantData, showMacroPatterns, parsedData, delistedPadIndex, userLines]);

  // Handle Drawing Mode Click
  useEffect(() => {
    if (!chartRef.current || !seriesRefs.current.candle) return;
    const chart = chartRef.current;
    const series = seriesRefs.current.candle;

    const clickHandler = (param: any) => {
      if (!param.point) return;
      const logical = chart.timeScale().coordinateToLogical(param.point.x);
      
      if (isDrawingMode) {
        if (logical === null) return;
        if (!activeDrawPoint) {
          // First click: Start drawing
          setActiveDrawPoint({ time: logical, price: series.coordinateToPrice(param.point.y) as number, x: logical as number });
        } else {
          // Second click: End drawing
          const endX = logical as number;
          const endY = series.coordinateToPrice(param.point.y) as number;
          const startX = activeDrawPoint.x;
          const startY = activeDrawPoint.price;
          
          if (startX !== endX) {
            const slope = (endY - startY) / (endX - startX);
            const newLine = {
              id: Math.random().toString(36).substring(7),
              startX: Math.min(startX, endX),
              startY: startX < endX ? startY : endY,
              endX: Math.max(startX, endX),
              endY: startX < endX ? endY : startY,
              slope,
              type: 'support',
              inliers: 2,
              method: 'USER'
            };
            setUserLines(prev => [...prev, newLine]);
          }
          setActiveDrawPoint(null);
          setIsDrawingMode(false); // Turn off drawing mode
        }
        return;
      }

      // Hit testing logic for selection and dragging
      if (dragState && selectedLineId) {
         // Dropping a line
         if (logical === null) return;
         const price = series.coordinateToPrice(param.point.y) as number;

         setUserLines(prev => prev.map(line => {
             if (line.id === selectedLineId) {
                 const newX = logical as number;
                 const newY = price;
                 if (dragState === 'start') {
                     const slope = newX !== line.endX ? (line.endY - newY) / (line.endX - newX) : line.slope;
                     return { ...line, startX: newX, startY: newY, slope };
                 } else {
                     const slope = newX !== line.startX ? (newY - line.startY) / (newX - line.startX) : line.slope;
                     return { ...line, endX: newX, endY: newY, slope };
                 }
             }
             return line;
         }));
         setDragState(null);
         return;
      }

      // Check hit test to select a line or pick up a grab handle
      const px = param.point.x;
      const py = param.point.y;
      
      let hitHandle: 'start' | 'end' | null = null;
      let hitLineId: string | null = null;

      // Prioritize currently selected line's handles
      if (selectedLineId) {
         const selLine = userLines.find(l => l.id === selectedLineId);
         if (selLine) {
             const sx = chart.timeScale().logicalToCoordinate(selLine.startX);
             const sy = series.priceToCoordinate(selLine.startY);
             const ex = chart.timeScale().logicalToCoordinate(selLine.endX);
             const ey = series.priceToCoordinate(selLine.endY);
             
             if (sx !== null && sy !== null && Math.hypot(px - sx, py - sy) < 15) {
                 hitHandle = 'start';
                 hitLineId = selLine.id;
             } else if (ex !== null && ey !== null && Math.hypot(px - ex, py - ey) < 15) {
                 hitHandle = 'end';
                 hitLineId = selLine.id;
             }
         }
      }

      if (!hitHandle) {
          // Check line bodies
          for (const line of userLines) {
             const sx = chart.timeScale().logicalToCoordinate(line.startX);
             const sy = series.priceToCoordinate(line.startY);
             const ex = chart.timeScale().logicalToCoordinate(line.endX);
             const ey = series.priceToCoordinate(line.endY);
             
             if (sx !== null && sy !== null && ex !== null && ey !== null) {
                 const minX = Math.min(sx, ex) - 10;
                 const maxX = Math.max(sx, ex) + 10;
                 if (px >= minX && px <= maxX) {
                     const l2 = (ex - sx) ** 2 + (ey - sy) ** 2;
                     if (l2 > 0) {
                         let t = ((px - sx) * (ex - sx) + (py - sy) * (ey - sy)) / l2;
                         t = Math.max(0, Math.min(1, t));
                         const projX = sx + t * (ex - sx);
                         const projY = sy + t * (ey - sy);
                         const dist = Math.hypot(px - projX, py - projY);
                         if (dist < 8) {
                             hitLineId = line.id;
                             break;
                         }
                     }
                 }
             }
          }
      }

      setDragState(hitHandle);
      setSelectedLineId(hitLineId);
    };

    const crosshairMoveHandler = (param: any) => {
      if (!trendLinePluginRef.current) return;
      if (!param.point) return;

      const logical = chart.timeScale().coordinateToLogical(param.point.x);
      if (logical === null) return;
      
      const currX = logical as number;
      const currY = series.coordinateToPrice(param.point.y) as number;

      if (dragState && selectedLineId) {
          // Preview dragged line
          const previewLines = userLines.map(line => {
              if (line.id === selectedLineId) {
                  if (dragState === 'start') {
                      const slope = currX !== line.endX ? (line.endY - currY) / (line.endX - currX) : line.slope;
                      return { ...line, startX: currX, startY: currY, slope };
                  } else {
                      const slope = currX !== line.startX ? (currY - line.startY) / (currX - line.startX) : line.slope;
                      return { ...line, endX: currX, endY: currY, slope };
                  }
              }
              return line;
          });
          const activeAlgorithmic = showMacroPatterns && quantData ? quantData.lines : [];
          trendLinePluginRef.current.setLines([...activeAlgorithmic, ...previewLines]);
          return;
      }

      if (isDrawingMode && activeDrawPoint) {
        const startX = activeDrawPoint.x;
        const startY = activeDrawPoint.price;
        
        if (startX !== currX) {
          const slope = (currY - startY) / (currX - startX);
          const previewLine = {
            id: 'preview',
            startX: Math.min(startX, currX),
            startY: startX < currX ? startY : currY,
            endX: Math.max(startX, currX),
            endY: startX < currX ? currY : startY,
            slope,
            type: 'support',
            inliers: 2,
            method: 'USER'
          };
          
          const activeAlgorithmic = showMacroPatterns && quantData ? quantData.lines : [];
          trendLinePluginRef.current.setLines([...activeAlgorithmic, ...userLines, previewLine]);
        }
      }
    };

    chart.subscribeClick(clickHandler);
    chart.subscribeCrosshairMove(crosshairMoveHandler);
    
    return () => {
       chart.unsubscribeClick(clickHandler);
       chart.unsubscribeCrosshairMove(crosshairMoveHandler);
    };
  }, [isDrawingMode, activeDrawPoint, quantData, userLines, selectedLineId, dragState]);

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
    refs.bbw?.applyOptions({ visible: showBands });

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
    
    const getStartPriceForOverlay = (dataArray: any[], timeStr: string) => {
      if (!dataArray || dataArray.length === 0) return 0;
      for (let i = 0; i < dataArray.length; i++) {
        if (new Date(dataArray[i].time).getTime() >= new Date(timeStr).getTime()) {
          return dataArray[i].value || dataArray[i].close;
        }
      }
      return dataArray[dataArray.length - 1].value || dataArray[dataArray.length - 1].close;
    };

    if (timeframe === 'ALL') {
      chartRef.current.timeScale().fitContent();
      const startPrice = parsedData[0].close;
      const endPrice = parsedData[parsedData.length - 1].close;
      const years = (new Date(parsedData[parsedData.length - 1].time).getTime() - new Date(parsedData[0].time).getTime()) / (365 * 24 * 60 * 60 * 1000);
      const cagr = years > 0 ? (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100 : 0;
      setPeriodStats({ change: endPrice - startPrice, percentChange: ((endPrice - startPrice) / startPrice) * 100, cagr });
      
      const startRange = parsedData[0].time;
      if (seriesRefs.current.nifty && niftyData.length > 0) {
        seriesRefs.current.nifty.applyOptions({ baseValue: { type: 'price', price: getStartPriceForOverlay(niftyData, startRange) } });
      }
      if (seriesRefs.current.sector && sectorData.length > 0) {
        seriesRefs.current.sector.applyOptions({ baseValue: { type: 'price', price: getStartPriceForOverlay(sectorData, startRange) } });
      }

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

    if (seriesRefs.current.nifty && niftyData.length > 0) {
      seriesRefs.current.nifty.applyOptions({ baseValue: { type: 'price', price: getStartPriceForOverlay(niftyData, startRange) } });
    }
    if (seriesRefs.current.sector && sectorData.length > 0) {
      seriesRefs.current.sector.applyOptions({ baseValue: { type: 'price', price: getStartPriceForOverlay(sectorData, startRange) } });
    }

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
  let rawLivePrice = data?.absolute?.["live price"];
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
    <div className="bg-surface border border-border h-full flex flex-col rounded-xl overflow-hidden">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border-b border-border gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <StockLogo 
            ticker={data?.absolute?.ticker || ''} 
            name={data?.absolute?.name || ''} 
            logoUrl={data?.absolute?.header_raw?.logoUrl}
            className="w-14 h-14 shadow-md" 
            textClass="text-sm" 
            fallbackClass="bg-surface border border-border text-text-primary" 
          />
          <div className="flex flex-col justify-center gap-0.5 flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-extrabold text-text-primary tracking-tight leading-none truncate max-w-[400px]">
                {data?.absolute?.name || data?.absolute?.header_raw?.displayName || data?.absolute?.displayName || data?.absolute?.ticker || 'N/A'}
              </h3>
              {data?.absolute?.header_raw?.industryName && (
                <span className="px-2 py-0.5 rounded-full bg-surface border border-border text-[10px] text-text-secondary font-medium tracking-wide shadow-sm">
                  {data.absolute.header_raw.industryName}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded bg-yellow-500/20 border border-yellow-500/30 text-[10px] font-bold text-yellow-400 tracking-wider">
                {data?.absolute?.ticker || 'N/A'}
              </span>
              <span className="text-lg font-bold text-text-primary leading-none ml-2">₹{currentPrice.toFixed(2)}</span>
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

        <div className="flex flex-col items-end gap-2 flex-1 min-w-0">
          {/* Toggles */}
          <div className="flex items-center justify-start sm:justify-end gap-2 text-[10px] font-bold relative z-50 w-full pb-1 flex-wrap">
            {/* 1. Views Dropdown */}
            <div className="relative group/view">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-hover whitespace-nowrap transition-all">
                Views <ChevronDown size={12} />
              </button>
              <div className="absolute top-full left-0 mt-1 w-40 bg-surface border border-border rounded shadow-xl opacity-0 invisible group-hover/view:opacity-100 group-hover/view:visible transition-all z-50 flex flex-col p-1">
                <button 
                  onClick={() => { setViewMode('candles'); if(setCentralMode) setCentralMode('PRICE'); }}
                  className={`px-3 py-2 text-left rounded text-[10px] font-bold ${viewMode === 'candles' && centralMode !== 'PAIRS' ? 'bg-indigo-500/20 text-indigo-400' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                >
                  OHLCV Candlesticks
                </button>
                <button 
                  onClick={() => { setViewMode('baseline'); if(setCentralMode) setCentralMode('PRICE'); }}
                  className={`px-3 py-2 text-left rounded text-[10px] font-bold ${viewMode === 'baseline' && centralMode !== 'PAIRS' ? 'bg-indigo-500/20 text-indigo-400' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                >
                  Baseline Area
                </button>
              </div>
            </div>

            <span className="text-text-secondary mx-1">|</span>

            {/* 2. Overlays Dropdown */}
            <div className="relative group/overlay">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-hover whitespace-nowrap transition-all">
                Overlays <ChevronDown size={12} />
              </button>
              <div className="absolute top-full left-0 mt-1 w-52 bg-surface border border-border rounded shadow-xl opacity-0 invisible group-hover/overlay:opacity-100 group-hover/overlay:visible transition-all z-50 flex flex-col p-1">
                <button 
                  onClick={() => {
                    const nextState = !showNifty;
                    setShowNifty(nextState);
                    if (nextState) setShowBands(false);
                  }}
                  className={`px-3 py-2 text-left rounded text-[10px] font-bold ${showNifty ? 'bg-yellow-500/20 text-yellow-400' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                >
                  vs Nifty 50
                </button>
                <button 
                  onClick={() => {
                    const nextState = !showSector;
                    setShowSector(nextState);
                    if (nextState) setShowBands(false);
                  }}
                  className={`px-3 py-2 text-left rounded text-[10px] font-bold ${showSector ? 'bg-purple-500/20 text-purple-400' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                >
                  Sector ({getSectorName(sectorSlug)})
                </button>
                <button 
                  onClick={() => {
                    const nextState = !showBands;
                    setShowBands(nextState);
                    if (nextState) { setShowNifty(false); setShowSector(false); }
                  }}
                  className={`px-3 py-2 text-left rounded text-[10px] font-bold ${showBands ? 'bg-emerald-500/20 text-emerald-400' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                >
                  Volatility Bands & Squeeze
                </button>
                {setCentralMode && (
                  <button 
                    onClick={() => setCentralMode(centralMode === 'PAIRS' ? 'PRICE' : 'PAIRS')}
                    className={`px-3 py-2 text-left rounded text-[10px] font-bold ${centralMode === 'PAIRS' ? 'bg-blue-500/20 text-blue-400' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                  >
                    Pair Trading
                  </button>
                )}
              </div>
            </div>

            <span className="text-text-secondary mx-1">|</span>

            {/* 3. Technical Analysis Dropdown */}
            <div className="relative group/tech">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-hover whitespace-nowrap transition-all">
                Technical Analysis <ChevronDown size={12} />
              </button>
              <div className="absolute top-full right-0 mt-1 w-52 bg-surface border border-border rounded shadow-xl opacity-0 invisible group-hover/tech:opacity-100 group-hover/tech:visible transition-all z-50 flex flex-col p-1">
                <button 
                  onClick={() => {
                    setIsDrawingMode(prev => !prev);
                    setActiveDrawPoint(null);
                  }}
                  className={`px-3 py-2 text-left rounded text-[10px] font-bold flex items-center gap-2 ${isDrawingMode ? 'bg-orange-500/20 text-orange-400' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                >
                  ✏️ Draw
                </button>
                
                {/* Nested Timeline for Support & Resistance */}
                <div className="relative group/timeline flex items-center w-full">
                  <button 
                    onClick={() => setShowTechnicalLevels(prev => !prev)}
                    className={`flex-1 px-3 py-2 text-left rounded text-[10px] font-bold ${showTechnicalLevels ? 'bg-pink-500/20 text-pink-400' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                  >
                    Support & Resistance
                  </button>
                  {showTechnicalLevels && (
                    <select
                      value={pivotTimeframe}
                      onChange={(e) => setPivotTimeframe(e.target.value as '1D'|'1W'|'1M'|'1Y')}
                      className="absolute right-2 px-1.5 py-0.5 rounded bg-surface border border-border text-text-primary focus:outline-none cursor-pointer text-[9px] font-bold"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="1D">1D</option>
                      <option value="1W">1W</option>
                      <option value="1M">1M</option>
                      <option value="1Y">1Y</option>
                    </select>
                  )}
                </div>

                <div className="w-full h-px bg-border my-1"></div>

                {/* Automate Button */}
                <div className="relative group/automate px-1 py-1">
                  <button 
                    onClick={() => setShowMacroPatterns(prev => !prev)}
                    className={`w-full px-3 py-2 text-left rounded text-[10px] font-bold border transition-all duration-300 relative overflow-hidden flex items-center gap-1.5 ${
                      showMacroPatterns 
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.4)]' 
                        : 'border-purple-500/50 text-purple-300 shadow-[0_0_6px_rgba(168,85,247,0.25)] hover:shadow-[0_0_10px_rgba(168,85,247,0.4)] hover:bg-purple-500/10'
                    }`}
                  >
                    <BrainCircuit size={11} />
                    Automate
                  </button>
                  <div className="absolute right-full top-0 mr-2 w-48 bg-surface border border-purple-500/30 rounded p-2 text-[10px] text-purple-300 opacity-0 invisible group-hover/automate:opacity-100 group-hover/automate:visible transition-all z-50 shadow-xl pointer-events-none">
                    <strong>Beta Feature:</strong> Automated geometric pattern detection is experimental. Verify visually.
                  </div>
                </div>

              </div>
            </div>

            <div className="w-px h-4 bg-border mx-1"></div>

            {/* AI Analysis */}
            {setIsAIOverlayOpen && (
              <>
                {localStorage.getItem('admin_mode') === 'true' ? (
                  <button 
                    onClick={() => setIsAIOverlayOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded transition-all border whitespace-nowrap bg-purple-500/10 text-purple-300 border-purple-500/50 hover:bg-purple-500/20 shadow-[0_0_8px_#a855f7]"
                  >
                    <BrainCircuit size={14} /> AI Analysis
                  </button>
                ) : (
                  <div className="group relative">
                    <button 
                      disabled
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded transition-all border whitespace-nowrap bg-surface text-text-secondary opacity-50 border-border cursor-not-allowed"
                    >
                      <BrainCircuit size={14} /> AI Analysis <Lock size={10} className="ml-0.5 opacity-70" />
                    </button>
                    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-surface-hover border border-border p-2 rounded text-[10px] w-48 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-text-secondary font-mono pointer-events-none text-center">
                      Due to increased demand, AI Analyst Desk is currently restricted to Enterprise / Internal use only.
                    </div>
                  </div>
                )}
              </>
            )}
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

            <div className="flex gap-1 bg-surface p-1 rounded-lg border border-border">
              {TIMEFRAMES.map(t => (
                <button 
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-colors flex items-center justify-center min-w-[32px] ${timeframe === t ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
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

          {/* Right-side Floating Price Labels */}
          <div ref={labelRef} className="absolute right-[70px] hidden transform -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-surface-elevated border border-border text-text-primary text-[10px] px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap font-bold tracking-wider uppercase">
              {data?.absolute?.ticker || 'Current'}
            </div>
          </div>
          <div ref={niftyLabelRef} className="absolute right-[70px] hidden transform -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-white/10 border border-white/20 text-text-primary text-[10px] px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap font-bold tracking-wider uppercase backdrop-blur-sm">
              NIFTY 50
            </div>
          </div>
          <div ref={sectorLabelRef} className="absolute right-[70px] hidden transform -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-white/10 border border-white/20 text-text-primary text-[10px] px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap font-bold tracking-wider uppercase backdrop-blur-sm">
              {getSectorName(sectorSlug)}
            </div>
          </div>
          <div ref={upperLabelRef} className="absolute right-[70px] hidden transform -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-white/5 border border-border text-text-primary/70 text-[10px] px-1 py-0.5 rounded shadow-lg whitespace-nowrap font-bold">
              +2σ
            </div>
          </div>
          <div ref={lowerLabelRef} className="absolute right-[70px] hidden transform -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-white/5 border border-border text-text-primary/70 text-[10px] px-1 py-0.5 rounded shadow-lg whitespace-nowrap font-bold">
              -2σ
            </div>
          </div>
          <div ref={smaLabelRef} className="absolute right-[70px] hidden transform -translate-y-1/2 pointer-events-none z-50">
            <div className="bg-white/5 border border-border text-text-primary/70 text-[10px] px-1 py-0.5 rounded shadow-lg whitespace-nowrap font-bold">
              SMA 20
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
