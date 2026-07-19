import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks } from '../api';
import { Maximize, Grid, PieChart, ChevronDown, Flag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { StockLogo } from '../components/StockLogo';
import { treemap, hierarchy } from 'd3-hierarchy';

const parseDayChange = (changeStr: string) => {
  if (!changeStr) return 0;
  const isNegative = changeStr.trim().startsWith('-');
  const match = changeStr.match(/\(([-+]?[\d.]+)%\)/);
  if (match) {
    let val = parseFloat(match[1]);
    if (isNegative && val > 0) val = -val;
    return val;
  }
  const justNum = parseFloat(changeStr);
  return isNaN(justNum) ? 0 : justNum;
};

// Strict TradingView Colors Steps
const getPerformanceColor = (value: number, timeframe: string) => {
  let scaleMultiplier = 1;
  if (timeframe === 'Performance 1W, %') scaleMultiplier = 3.33; 
  if (timeframe === 'Performance 1M, %') scaleMultiplier = 6.66; 
  if (timeframe === 'Performance 3M, %') scaleMultiplier = 10.0; // +/- 30%
  if (timeframe === 'Performance 6M, %') scaleMultiplier = 13.33; // +/- 40%
  if (timeframe === 'Performance YTD, %') scaleMultiplier = 15.0; // +/- 45%
  if (timeframe === 'Performance 1Y, %') scaleMultiplier = 20.0; // +/- 60% 
  
  const v = value / scaleMultiplier;

  if (v <= -3) return '#f23645'; 
  if (v <= -2) return '#f7525f'; 
  if (v < -0.25) return '#f77c80'; 
  if (v >= -0.25 && v <= 0.25) return '#787b86'; 
  if (v > 0.25 && v <= 2) return '#42bd7f'; 
  if (v > 2 && v < 3) return '#089950'; 
  return '#056636'; 
};

const formatNumber = (num: number) => {
  if (num >= 1e5) return (num / 1e5).toFixed(2) + 'L';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
};

export const MarketHeatmap = () => {
  const navigate = useNavigate();
  const [indexFilter, setIndexFilter] = useState('Nifty 500 Index');
  const [sizeBy, setSizeBy] = useState('Market Cap');
  const [colorBy, setColorBy] = useState('Change 1D, %');
  const [groupBy, setGroupBy] = useState('Sector');
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [hiddenColorSteps, setHiddenColorSteps] = useState<string[]>([]);
  
  const scaleMultiplier = useMemo(() => {
    if (colorBy === 'Performance 1W, %') return 3.33; 
    if (colorBy === 'Performance 1M, %') return 6.66; 
    if (colorBy === 'Performance 3M, %') return 10.0; 
    if (colorBy === 'Performance 6M, %') return 13.33; 
    if (colorBy === 'Performance YTD, %') return 15.0; 
    if (colorBy === 'Performance 1Y, %') return 20.0; 
    return 1.0;
  }, [colorBy]);
  
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { data: stocks, isLoading } = useQuery({
    queryKey: ['allStocks'],
    queryFn: fetchAllStocks,
  });

  const rootNode = useMemo(() => {
    if (!stocks || dimensions.width === 0 || dimensions.height === 0) return null;
    
    // Size logic
    const getSizeValue = (s: any) => {
      if (sizeBy === 'Market Cap') return s.marketCap || 0;
      if (sizeBy === 'Volume 1D') return s.volume || 0;
      if (sizeBy === 'Volume 1W') return s.vol_1w || 0;
      if (sizeBy === 'Volume 1M') return s.vol_1m || 0;
      if (sizeBy === 'Price * Volume (Turnover) 1D') return s.turnover_1d || 0;
      if (sizeBy === 'Price * Volume (Turnover) 1W') return s.turnover_1w || 0;
      if (sizeBy === 'Price * Volume (Turnover) 1M') return s.turnover_1m || 0;
      if (sizeBy === 'Mono size') return 1;
      return 0;
    };

    // Color logic
    const getColorValue = (s: any) => {
      if (colorBy === 'Change 1D, %') return parseDayChange(s.day_change);
      if (colorBy === 'Performance 1W, %') return s.perf_1w || 0;
      if (colorBy === 'Performance 1M, %') return s.perf_1m || 0;
      if (colorBy === 'Performance 3M, %') return s.perf_3m || 0;
      if (colorBy === 'Performance 6M, %') return s.perf_6m || 0;
      if (colorBy === 'Performance YTD, %') return s.perf_ytd || 0;
      if (colorBy === 'Performance 1Y, %') return s.perf_1y || 0;
      return 0;
    };

    const sortedByCap = [...stocks].sort((a: any, b: any) => (b.marketCap || 0) - (a.marketCap || 0));
    let baseStocks = sortedByCap;
    if (indexFilter === 'Nifty 50 Index') {
      baseStocks = sortedByCap.slice(0, 50);
    } else if (indexFilter === 'Nifty Next 50 Index') {
      baseStocks = sortedByCap.slice(50, 100);
    } else if (indexFilter === 'BSE Sensex') {
      baseStocks = sortedByCap.slice(0, 30);
    } else if (indexFilter === 'Nifty 500 Index') {
      baseStocks = sortedByCap.slice(0, 500);
    } else {
      baseStocks = sortedByCap; // Entire Market (No slice)
    }

    if (selectedSector) {
      baseStocks = baseStocks.filter((s: any) => (s.industry || 'Other') === selectedSector);
    }

    let filteredStocks = baseStocks
      .filter((s: any) => getSizeValue(s) > 0)
      .filter((s: any) => {
        const color = getPerformanceColor(getColorValue(s), colorBy);
        return !hiddenColorSteps.includes(color);
      })
      .sort((a: any, b: any) => getSizeValue(b) - getSizeValue(a));

    const groups: Record<string, any> = {};
    if (groupBy === 'No group' || selectedSector) {
      const gName = selectedSector || 'All';
      groups[gName] = { name: gName, children: [] };
    }

    filteredStocks.forEach((stock: any) => {
      const groupName = (groupBy === 'No group' || selectedSector) ? (selectedSector || 'All') : (stock.industry || 'Other');
      if (!groups[groupName]) {
        groups[groupName] = { name: groupName, children: [] };
      }
      groups[groupName].children.push({
        name: stock.ticker,
        slug: stock.slug,
        fullName: stock.name,
        size: getSizeValue(stock),
        colorValue: getColorValue(stock),
        peRatio: stock.peRatio,
        marketCap: stock.marketCap,
        volume: stock.volume,
        dayChange: parseDayChange(stock.day_change),
        inst_accum: stock.inst_accum,
        perf_1w: stock.perf_1w,
        perf_1m: stock.perf_1m,
        perf_3m: stock.perf_3m,
        perf_6m: stock.perf_6m,
        perf_1y: stock.perf_1y,
        perf_ytd: stock.perf_ytd
      });
    });

    const hierarchyData = {
      name: 'root',
      children: Object.values(groups)
    };

    const root = hierarchy(hierarchyData)
      .sum((d: any) => d.size)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const tree = treemap()
      .size([dimensions.width, dimensions.height])
      .paddingInner(1) // space between leaf nodes
      .paddingOuter(1) // gap from sector borders
      .paddingTop(groupBy === 'No group' ? 1 : 22) // Top gap for sector headers
      .round(true);

    return tree(root as any);
  }, [stocks, dimensions, sizeBy, colorBy, groupBy, indexFilter, selectedSector, hiddenColorSteps]);

  if (isLoading || !stocks) {
    return (
      <div className="flex flex-col h-full bg-canvas p-4">
        <div className="animate-pulse bg-surface-hover h-[90%] w-full rounded-xl border border-border" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-canvas text-text-primary overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="flex-none px-4 py-2 flex flex-col gap-3 border-b border-border bg-canvas z-10 shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">Stock Heatmap</h1>
        
        <div className="flex items-center gap-4 overflow-x-auto text-sm">
          {/* Index / Context */}
          <div className="flex items-center gap-1.5 bg-surface-hover px-2 py-1 rounded border border-border text-text-primary group cursor-pointer">
            <Flag size={14} className="text-[#089950]" />
            <select 
              value={indexFilter} 
              onChange={e => { setIndexFilter(e.target.value); setSelectedSector(null); }}
              className="bg-transparent focus:outline-none text-text-primary font-semibold cursor-pointer appearance-none outline-none pr-1"
            >
              <option>Nifty 50 Index</option>
              <option>Nifty Next 50 Index</option>
              <option>BSE Sensex</option>
              <option>Nifty 500 Index</option>
              <option>Entire Market</option>
            </select>
            <ChevronDown size={14} className="text-gray-600 group-hover:text-text-secondary" />
          </div>

          <div className="w-px h-4 bg-border" />

          {/* Size By */}
          <div className="flex items-center gap-1.5 group cursor-pointer">
            <Maximize size={14} className="text-text-secondary" />
            <select 
              value={sizeBy} 
              onChange={e => setSizeBy(e.target.value)}
              className="bg-transparent focus:outline-none text-text-primary hover:text-text-primary font-semibold cursor-pointer appearance-none outline-none pr-1"
            >
              <option>Market Cap</option>
              <option>Volume 1D</option>
              <option>Volume 1W</option>
              <option>Volume 1M</option>
              <option>Price * Volume (Turnover) 1D</option>
              <option>Price * Volume (Turnover) 1W</option>
              <option>Price * Volume (Turnover) 1M</option>
              <option>Mono size</option>
            </select>
            <ChevronDown size={14} className="text-gray-600 group-hover:text-text-secondary" />
          </div>

          <div className="w-px h-4 bg-border" />

          {/* Color By */}
          <div className="flex items-center gap-1.5 group cursor-pointer">
            <Grid size={14} className="text-text-secondary" />
            <select 
              value={colorBy} 
              onChange={e => setColorBy(e.target.value)}
              className="bg-transparent focus:outline-none text-text-primary hover:text-text-primary font-semibold cursor-pointer appearance-none outline-none pr-1"
            >
              <option>Change 1D, %</option>
              <option>Performance 1W, %</option>
              <option>Performance 1M, %</option>
              <option>Performance 3M, %</option>
              <option>Performance 6M, %</option>
              <option>Performance YTD, %</option>
              <option>Performance 1Y, %</option>
            </select>
            <ChevronDown size={14} className="text-gray-600 group-hover:text-text-secondary" />
          </div>

          <div className="w-px h-4 bg-border" />

          {/* Group By */}
          <div className="flex items-center gap-1.5 group cursor-pointer">
            <PieChart size={14} className="text-text-secondary" />
            <select 
              value={groupBy} 
              onChange={e => setGroupBy(e.target.value)}
              className="bg-transparent focus:outline-none text-text-primary hover:text-text-primary font-semibold cursor-pointer appearance-none outline-none pr-1"
            >
              <option>Sector</option>
              <option>No group</option>
            </select>
            <ChevronDown size={14} className="text-gray-600 group-hover:text-text-secondary" />
          </div>

          <div className="w-px h-4 bg-border" />

          {/* Legend Inline */}
          <div className="flex items-center gap-1">
            {[
              { c: '#f23645', v: -3, p: '< ' }, 
              { c: '#f7525f', v: -2, p: '' }, 
              { c: '#f77c80', v: -0.25, p: '' }, 
              { c: '#787b86', v: 0, p: '' }, 
              { c: '#42bd7f', v: 0.25, p: '' }, 
              { c: '#089950', v: 2, p: '' }, 
              { c: '#056636', v: 3, p: '> ' }
            ].map(({c, v, p}) => {
              const val = v * scaleMultiplier;
              const formatted = v === 0 ? '0' : (Math.abs(val) < 10 ? val.toFixed(1).replace('.0', '') : Math.round(val).toString());
              return (
                <div 
                  key={c} 
                  onClick={() => setHiddenColorSteps(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                  style={{ backgroundColor: c }} 
                  className={`flex items-center justify-center px-2 h-5 rounded cursor-pointer hover:scale-110 transition-transform shadow-sm text-[10px] font-bold text-text-primary ${hiddenColorSteps.includes(c) ? 'opacity-30 scale-90' : 'opacity-100'}`}
                  title={`Toggle scale`}
                >
                  {p}{formatted}%
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* Heatmap Container */}
      <div className="flex-1 relative w-full h-full min-h-0 bg-canvas overflow-hidden" ref={containerRef}>
        {/* {!rootNode && (
          <div className="text-text-primary p-4 font-mono text-sm">
            DEBUG INFO: <br/>
            dimensions: {dimensions.width}x{dimensions.height} <br/>
            stocks loaded: {stocks ? stocks.length : 'loading...'} <br/>
            filtered: {stocks ? stocks.filter((s: any) => (s.marketCap || 0) > 0).length : 0} <br/>
          </div>
        )} */}
        {rootNode && rootNode.leaves().length === 0 && (
          <div className="text-text-primary p-4 font-mono text-sm">
            DEBUG: rootNode has 0 leaves!
          </div>
        )}
        {rootNode && rootNode.children && rootNode.children.map((sectorNode, i) => {
          return (
            <div key={`sector-${i}`} style={{ position: 'absolute', left: sectorNode.x0, top: sectorNode.y0, width: sectorNode.x1 - sectorNode.x0, height: sectorNode.y1 - sectorNode.y0, pointerEvents: 'none' }}>
              {/* Sector Header */}
              {((groupBy !== 'No group' || selectedSector) && !selectedSector && sectorNode.x1 - sectorNode.x0 > 50 && sectorNode.y1 - sectorNode.y0 > 25) && (
                <div 
                  onClick={() => setSelectedSector((sectorNode.data as any).name)}
                  className="absolute top-0 left-0 h-[22px] flex items-center px-1 text-text-primary/80 hover:text-text-primary font-medium text-[11px] bg-transparent truncate pointer-events-auto cursor-pointer transition-colors"
                >
                  {(sectorNode.data as any).name} <span className="ml-0.5 opacity-50">&gt;</span>
                </div>
              )}
              {/* Selected Sector Back Button */}
              {selectedSector && (
                <div 
                  onClick={() => setSelectedSector(null)}
                  className="absolute top-0 left-0 h-[22px] flex items-center px-1 text-text-primary hover:text-alpha font-bold text-[11px] bg-transparent truncate pointer-events-auto cursor-pointer transition-colors z-20"
                >
                  &lt; Back to All Sectors
                </div>
              )}
              
              {/* Leaves */}
              {sectorNode.children && sectorNode.children.map((leafNode, j) => {
                const data = leafNode.data as any;
                const width = leafNode.x1 - leafNode.x0;
                const height = leafNode.y1 - leafNode.y0;
                // Since this div is inside the sectorNode (which is absolute positioned at sectorNode.x0),
                // the leafNode position needs to be relative to the sectorNode!
                const relX = leafNode.x0 - sectorNode.x0;
                const relY = leafNode.y0 - sectorNode.y0;

                const color = getPerformanceColor(data.colorValue, colorBy);
                
                const isTiny = width < 45 || height < 35;
                const showText = !isTiny;
                const logoSize = isTiny ? Math.max(12, Math.min(width * 0.8, height * 0.8)) : Math.max(16, Math.min(width * 0.3, height * 0.3, 32));

                return (
                  <div
                    key={`leaf-${j}`}
                    onClick={() => navigate(`/stocks/${data.slug}`)}
                    onMouseEnter={() => setHoveredNode(data)}
                    onMouseLeave={() => setHoveredNode(null)}
                    style={{
                      position: 'absolute',
                      left: relX,
                      top: relY,
                      width: width,
                      height: height,
                      backgroundColor: color,
                      pointerEvents: 'auto',
                      cursor: 'pointer'
                    }}
                    className="flex flex-col items-center justify-center overflow-hidden hover:brightness-110 transition-all border border-[#131722]/20"
                  >
                    <div className="flex flex-col items-center justify-center w-full h-full px-1">
                      <div style={{ width: logoSize, height: logoSize }} className="rounded-full overflow-hidden bg-white shrink-0 flex items-center justify-center shadow-sm">
                        <StockLogo ticker={data.name} name={data.fullName} className="w-full h-full object-cover" />
                      </div>
                      {showText && (
                        <>
                          <span className="text-text-primary font-semibold leading-none truncate w-full text-center mt-1" style={{ fontSize: Math.max(9, Math.min(width * 0.18, 14)), marginBottom: '4px' }}>
                            {data.name}
                          </span>
                          <span className="text-text-primary font-medium leading-none truncate w-full text-center" style={{ fontSize: Math.max(9, Math.min(width * 0.15, 12)) }}>
                            {data.colorValue > 0 ? '+' : ''}{data.colorValue.toFixed(2)}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Floating Command Bar Tooltip */}
        {hoveredNode && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-canvas border border-border shadow-2xl rounded-lg px-4 py-3 text-sm pointer-events-none transition-all duration-150 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-3 pr-4 border-r border-border">
              <div className="w-8 h-8 rounded-full bg-white overflow-hidden shrink-0">
                <StockLogo ticker={hoveredNode.slug} name={hoveredNode.name} className="w-full h-full" />
              </div>
              <div>
                <div className="text-text-primary font-bold leading-tight">{hoveredNode.name}</div>
                <div className="text-text-secondary text-xs truncate max-w-[150px] leading-tight">{hoveredNode.fullName}</div>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-text-primary font-mono font-medium">{formatNumber(hoveredNode.size)}</span>
                <span className="text-[10px] text-text-secondary font-medium uppercase tracking-wider">{sizeBy}</span>
              </div>
              <div className="flex flex-col">
                <span className={`font-mono font-bold ${hoveredNode.colorValue >= 0 ? 'text-[#42bd7f]' : 'text-[#f23645]'}`}>
                  {hoveredNode.colorValue > 0 ? '+' : ''}{hoveredNode.colorValue.toFixed(2)}{colorBy === 'P/E Ratio' ? '' : '%'}
                </span>
                <span className="text-[10px] text-text-secondary font-medium uppercase tracking-wider">{colorBy}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden Scale Labels for bottom since it moved to header (could remove this entirely) */}
      <div className="hidden">
      </div>
    </div>
  );
};
