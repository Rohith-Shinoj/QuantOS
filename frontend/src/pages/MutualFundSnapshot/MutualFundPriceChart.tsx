import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import { BrainCircuit, RefreshCw, HelpCircle, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchStockData } from '../../api';

const TIMEFRAMES = ['1M', '6M', '1Y', '3Y', '5Y', 'ALL', 'CUSTOM'];

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
      sum += data[i - j].value; // in MutualFund logic it's value, not close
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
      sumVariance += Math.pow(data[i - j].value - currentSMA, 2);
    }
    const stdDev = Math.sqrt(sumVariance / period);
    upper.push({ time: data[i].time, value: currentSMA + stdDev * multiplier });
    lower.push({ time: data[i].time, value: currentSMA - stdDev * multiplier });
  }
  return { sma, upper, lower };
}

export const MutualFundPriceChart = ({ fund }: { fund: any }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const baseLineRef = useRef<any>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const startPricesRef = useRef({ fund: 0, nifty: 0, sector: 0 });
  const [timeframe, setTimeframe] = useState('1Y');
  const [viewMode, setViewMode] = useState<'baseline' | 'line'>('baseline');
  const [showNifty, setShowNifty] = useState(false);
  const [showSector, setShowSector] = useState(false);
  const [showBands, setShowBands] = useState(false);
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [periodStats, setPeriodStats] = useState({ change: 0, percentChange: 0, cagr: 0, currentPrice: 0 });

  // Fetch Overlays
  const { data: niftyRaw } = useQuery({
    queryKey: ['stock', 'nifty'],
    queryFn: () => fetchStockData('nifty'),
    enabled: showNifty,
  });

  const getSectorSlug = (fund: any) => {
    const sub = (fund.sub_category || '').toLowerCase();
    const cat = (fund.category || '').toLowerCase();
    
    if (sub.includes('fmcg') || cat.includes('fmcg') || sub.includes('consumption')) return 'nifty-fmcg';
    if (sub.includes('auto')) return 'nifty-auto';
    if (sub.includes('psu bank')) return 'nifty-psu-bank';
    if (sub.includes('private bank') || sub.includes('pvt bank')) return 'nifty-pvt-bank';
    if (sub.includes('realty') || sub.includes('real estate')) return 'nifty-realty';
    if (sub.includes('financial') || cat.includes('financial')) return 'nifty-financial-services';
    if (sub.includes('bank') || cat.includes('bank')) return 'nifty-bank'; // fallback
    
    if (sub.includes('pharma') || sub.includes('health') || cat.includes('health')) return 'nifty-pharma'; // direct match instead of etf proxy
    if (sub.includes('metal') || cat.includes('metal')) return 'nifty-metal';
    if (/\bit\b/.test(sub) || sub.includes('tech') || /\bit\b/.test(cat) || cat.includes('technology')) return 'nifty-it';

    if (sub.includes('mid') && sub.includes('150')) return 'nifty-midcap-150';
    if (sub.includes('mid cap') || sub.includes('midcap')) return 'nifty-midcap';
    if (sub.includes('small cap') || sub.includes('smallcap')) return 'nifty-smallcap-100';
    if (sub.includes('large cap') || sub.includes('largecap')) return 'nifty-218500';
    if (sub.includes('next 50')) return 'nifty-next';
    
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
    const data = ([...ohlcv].reverse().map((d: any) => {
      if (!d || !d.Date) return null;
      const [day, month, year] = d.Date.split('-');
      return { time: `${year}-${month}-${day}`, value: d.Close };
    }).filter(Boolean) as any[]).sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    // Fill to today to match parsedData padding
    const todayStr = new Date().toISOString().split('T')[0];
    if (data.length > 0 && data[data.length - 1].time !== todayStr) {
       data.push({ time: todayStr, value: data[data.length - 1].value });
    }
    return data;
  }, [niftyRaw]);

  const sectorData = useMemo(() => {
    const ohlcv = sectorRaw?.absolute?.OHLCV || [];
    const data = ([...ohlcv].reverse().map((d: any) => {
      if (!d || !d.Date) return null;
      const [day, month, year] = d.Date.split('-');
      return { time: `${year}-${month}-${day}`, value: d.Close };
    }).filter(Boolean) as any[]).sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // Fill to today to match parsedData padding
    const todayStr = new Date().toISOString().split('T')[0];
    if (data.length > 0 && data[data.length - 1].time !== todayStr) {
       data.push({ time: todayStr, value: data[data.length - 1].value });
    }
    return data;
  }, [sectorRaw]);

  // Parse real historical NAV time-series data
  const parsedData = useMemo(() => {
    if (!fund?.historical_navs || !Array.isArray(fund.historical_navs)) return [];
    
    const data = fund.historical_navs.map((point: any) => {
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
      lastValueVisible: true,
      priceLineVisible: true,
    });
    niftySeries.setData(niftyData.filter((d: any) => parsedData.some((p: any) => p.time === d.time)));

    const sectorSeries = chart.addLineSeries({
      color: 'rgba(168, 85, 247, 0.6)',
      lineWidth: 1,
      crosshairMarkerVisible: false,
      visible: showSector,
      lastValueVisible: true,
      priceLineVisible: true,
    });
    sectorSeries.setData(sectorData.filter((d: any) => parsedData.some((p: any) => p.time === d.time)));

    const { sma, upper, lower } = calculateBollingerBands(parsedData, 20, 2);
    
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
      visible: showBands,
    });
    upperBand.setData(upper.filter(d => !isNaN(d.value)));

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
      visible: showBands,
    });
    lowerBand.setData(lower.filter(d => !isNaN(d.value)));

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
      visible: showBands,
    });
    smaLine.setData(sma.filter(d => !isNaN(d.value)));


    seriesRef.current = { 
      baseline: baselineSeries, 
      line: lineSeries, 
      nifty: niftySeries, 
      sector: sectorSeries,
      upperBand, lowerBand, sma: smaLine 
    };

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
        
        // Ensure we are reading latest view modes safely
        const isOverlayActive = showNifty || showSector;
        
        const priceData = param.seriesData.get(viewMode === 'baseline' ? seriesRef.current.baseline : seriesRef.current.line) as any;
        const price = priceData?.value || 0;
        
        const niftyItem = param.seriesData.get(seriesRef.current.nifty) as any;
        const sectorItem = param.seriesData.get(seriesRef.current.sector) as any;

        const fundStart = startPricesRef.current.fund;
        const niftyStart = startPricesRef.current.nifty;
        const sectorStart = startPricesRef.current.sector;

        const fundPct = fundStart ? (((price - fundStart) / fundStart) * 100).toFixed(2) + '%' : '0.00%';
        const niftyPct = niftyItem && niftyStart ? (((niftyItem.value - niftyStart) / niftyStart) * 100).toFixed(2) + '%' : '0.00%';
        const sectorPct = sectorItem && sectorStart ? (((sectorItem.value - sectorStart) / sectorStart) * 100).toFixed(2) + '%' : '0.00%';

        let left = param.point.x + 15;
        let top = param.point.y + 15;
        
        if (left + 180 > chartContainerRef.current!.clientWidth) {
           left = param.point.x - 180 - 15;
        }

        toolTip.style.left = left + 'px';
        toolTip.style.top = top + 'px';

        let html = `
          <div class="flex flex-col gap-1 min-w-[150px]">
            <span class="text-text-secondary font-semibold border-b border-border pb-1 mb-1 text-center">${dateStr}</span>
        `;
        
        if (isOverlayActive) {
          html += `
            <div class="flex justify-between gap-4 text-xs mb-0.5">
              <span class="text-blue-400 font-bold">Fund</span> 
              <span class="${price >= fundStart ? 'text-emerald-400' : 'text-red-400'} font-mono">${fundPct}</span>
            </div>
          `;
          if (showNifty && niftyItem) {
            html += `
              <div class="flex justify-between gap-4 text-xs mb-0.5">
                <span class="text-yellow-400 font-bold">Nifty 50</span> 
                <span class="${niftyItem.value >= niftyStart ? 'text-emerald-400' : 'text-red-400'} font-mono">${niftyPct}</span>
              </div>
            `;
          }
          if (showSector && sectorItem) {
            html += `
              <div class="flex justify-between gap-4 text-xs mb-0.5">
                <span class="text-purple-400 font-bold">Sector</span> 
                <span class="${sectorItem.value >= sectorStart ? 'text-emerald-400' : 'text-red-400'} font-mono">${sectorPct}</span>
              </div>
            `;
          }
        } else {
           html += `
            <div class="flex justify-between gap-4">
              <span class="text-text-secondary">NAV</span> 
              <span class="text-white font-bold text-right">₹${price.toFixed(2)}</span>
            </div>
          `;
        }

        html += `</div>`;
        toolTip.innerHTML = html;
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

    const isOverlayActive = showNifty || showSector;

    if (seriesRef.current.nifty) {
      seriesRef.current.nifty.applyOptions({ visible: showNifty });
        seriesRef.current.upperBand?.applyOptions({ visible: showBands });
      seriesRef.current.lowerBand?.applyOptions({ visible: showBands });
      seriesRef.current.sma?.applyOptions({ visible: showBands });

      if (showNifty || showSector) {
        chartRef.current.applyOptions({
          rightPriceScale: { mode: 2 } // Percentage mode
        });
      } else {
        chartRef.current.applyOptions({
          rightPriceScale: { mode: 0 } // Normal mode
        });
      }
    }

  }, [viewMode, showNifty, showSector, showBands]);

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
    
    const getStartPriceForOverlay = (dataArray: any[], timeStr: string) => {
      if (!dataArray || dataArray.length === 0) return 0;
      for (let i = 0; i < dataArray.length; i++) {
        if (new Date(dataArray[i].time).getTime() >= new Date(timeStr).getTime()) {
          return dataArray[i].value;
        }
      }
      return dataArray[dataArray.length - 1].value;
    };

    if (timeframe === 'ALL') {
      chartRef.current.timeScale().fitContent();
      const startPrice = parsedData[0].value;
      const endPrice = parsedData[parsedData.length - 1].value;
      const startRange = parsedData[0].time;
      
      startPricesRef.current = {
        fund: startPrice,
        nifty: getStartPriceForOverlay(niftyData, startRange),
        sector: getStartPriceForOverlay(sectorData, startRange)
      };

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
        case '3Y': cutoff = now - 3 * 365 * 24 * 60 * 60 * 1000; break;
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
    
    const startPrice = parsedData[startIndex].value;
    const endPrice = parsedData[parsedData.length - 1].value;

    startPricesRef.current = {
      fund: startPrice,
      nifty: getStartPriceForOverlay(niftyData, startRange),
      sector: getStartPriceForOverlay(sectorData, startRange)
    };

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
  }, [timeframe, customRange, parsedData, niftyData, sectorData]);

  // Top header metrics strictly 1D
  const return1d = parseFloat(fund?.return1d || '0');
  const currentNav = fund?.nav || 0;
  const navChange = (currentNav * return1d) / 100;
  const isPositive = return1d >= 0;

  const getSectorName = (slug: string) => {
    switch (slug) {
      case 'nifty-midcap': return 'Nifty Midcap 100';
      case 'nifty-smallcap-100': return 'Nifty Smallcap 100';
      case 'nifty-midcap-150': return 'NIFTY Midcap 150';
      case 'nifty-bank': return 'Nifty Bank';
      case 'nifty-it': return 'Nifty IT';
      case 'nippon-india-nifty-pharma-etf-netfpharma': return 'Pharma ETF';
      case 'nifty-pharma': return 'NIFTY Pharma';
      case 'nifty-metal': return 'Nifty Metal';
      case 'nifty-next': return 'NIFTY Next 50';
      case 'nifty-218500': return 'NIFTY 100';
      case 'nifty-auto': return 'NIFTY Auto';
      case 'nifty-financial-services': return 'NIFTY Fin Service';
      case 'nifty-realty': return 'NIFTY Realty';
      case 'nifty-psu-bank': return 'NIFTY PSU Bank';
      case 'nifty-fmcg': return 'NIFTY FMCG';
      case 'nifty-pvt-bank': return 'Nifty Pvt Bank';
      case 'nifty-total-market-index': return 'Total Market';
      default: return 'Index';
    }
  };

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
              <span className="px-2 py-0.5 mt-0.5 rounded bg-surface border border-border text-[10px] text-text-secondary font-semibold uppercase tracking-wider">
                {fund.sub_category || fund.category || 'Mutual Fund'}
              </span>
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
              onClick={() => {
                const nextState = !showNifty;
                setShowNifty(nextState);
                if (nextState) setShowBands(false);
              }}
              className={`px-3 py-1.5 rounded transition-all border ${showNifty ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-surface text-text-secondary border-border hover:bg-surface-hover hover:text-text-primary'}`}
            >
              vs Nifty 50
            </button>
            <button 
              onClick={() => {
                const nextState = !showSector;
                setShowSector(nextState);
                if (nextState) setShowBands(false);
              }}
              className={`px-3 py-1.5 rounded transition-all border ${showSector ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-surface text-text-secondary border-border hover:bg-surface-hover hover:text-text-primary'}`}
            >
              Sector ({getSectorName(sectorSlug)})
            </button>
            <button 
              onClick={() => {
                const nextState = !showBands;
                setShowBands(nextState);
                if (nextState) { setShowNifty(false); setShowSector(false); }
              }}
              className={`px-3 py-1.5 rounded transition-all border ${showBands ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-surface text-text-secondary border-border hover:bg-surface-hover hover:text-text-primary'}`}
            >
              Volatility Bands
            </button>
          </div>

          {/* Timeframes & Stats */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${periodStats.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {periodStats.change >= 0 ? '+' : ''}{periodStats.change.toFixed(2)} ({periodStats.change >= 0 ? '+' : ''}{periodStats.percentChange.toFixed(2)}%)
              </span>
              {(timeframe === '1Y' || timeframe === '3Y' || timeframe === '5Y' || timeframe === 'ALL' || timeframe === 'CUSTOM') && (
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

            <div className="h-4 w-px bg-border mx-1"></div>
            <div className="flex gap-1 bg-surface p-1 rounded-lg border border-border">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-colors flex items-center justify-center min-w-[32px] ${timeframe === tf ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
                >
                  {tf === 'CUSTOM' ? <Calendar size={14} /> : tf}
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
