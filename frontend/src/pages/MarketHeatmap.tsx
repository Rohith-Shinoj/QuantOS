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
const getPerformanceColor = (value: number) => {
  if (value <= -3) return '#f23645'; 
  if (value <= -2) return '#f7525f'; 
  if (value < -0.25) return '#f77c80'; 
  if (value >= -0.25 && value <= 0.25) return '#787b86'; 
  if (value > 0.25 && value <= 2) return '#42bd7f'; 
  if (value > 2 && value < 3) return '#089950'; 
  return '#056636'; 
};

const formatNumber = (num: number) => {
  if (num >= 1e5) return (num / 1e5).toFixed(2) + 'L';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
};

export const MarketHeatmap = () => {
  const navigate = useNavigate();
  const [sizeBy, setSizeBy] = useState('Market Cap');
  const [colorBy, setColorBy] = useState('Change 1D, %');
  const [groupBy, setGroupBy] = useState('Sector');
  
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
      let val = 0;
      if (sizeBy === 'Market Cap') val = s.marketCap || 0;
      return Math.max(0, val);
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

    let filteredStocks = stocks
      .filter((s: any) => getSizeValue(s) > 0)
      .sort((a: any, b: any) => getSizeValue(b) - getSizeValue(a))
      .slice(0, 500);

    const groups: Record<string, any> = {};
    if (groupBy === 'No group') {
      groups['All'] = { name: 'All', children: [] };
    }

    filteredStocks.forEach((stock: any) => {
      const groupName = groupBy === 'No group' ? 'All' : (stock.industry || 'Other');
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
  }, [stocks, dimensions, sizeBy, colorBy, groupBy]);

  if (isLoading || !stocks) {
    return (
      <div className="flex flex-col h-full bg-[#131722] p-4">
        <div className="animate-pulse bg-[#1e222d] h-[90%] w-full rounded-xl border border-[#2a2e39]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#131722] text-text-primary overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="flex-none px-4 py-2 flex flex-col gap-3 border-b border-[#2a2e39] bg-[#131722] z-10 shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-white">Stock Heatmap</h1>
        
        <div className="flex items-center gap-4 overflow-x-auto text-sm">
          {/* Index / Context */}
          <div className="flex items-center gap-1.5 bg-[#1e222d] px-2 py-1 rounded border border-[#2a2e39] text-gray-300">
            <Flag size={14} className="text-[#089950]" />
            <span className="font-semibold text-xs">Nifty 500 Index</span>
          </div>

          <div className="w-px h-4 bg-[#2a2e39]" />

          {/* Size By */}
          <div className="flex items-center gap-1.5 group cursor-pointer">
            <Maximize size={14} className="text-gray-500" />
            <select 
              value={sizeBy} 
              onChange={e => setSizeBy(e.target.value)}
              className="bg-transparent focus:outline-none text-gray-300 hover:text-white font-semibold cursor-pointer appearance-none outline-none pr-1"
            >
              <option>Market Cap</option>
            </select>
            <ChevronDown size={14} className="text-gray-600 group-hover:text-gray-400" />
          </div>

          <div className="w-px h-4 bg-[#2a2e39]" />

          {/* Color By */}
          <div className="flex items-center gap-1.5 group cursor-pointer">
            <Grid size={14} className="text-gray-500" />
            <select 
              value={colorBy} 
              onChange={e => setColorBy(e.target.value)}
              className="bg-transparent focus:outline-none text-gray-300 hover:text-white font-semibold cursor-pointer appearance-none outline-none pr-1"
            >
              <option>Change 1D, %</option>
              <option>Performance 1W, %</option>
              <option>Performance 1M, %</option>
              <option>Performance 3M, %</option>
              <option>Performance 6M, %</option>
              <option>Performance YTD, %</option>
              <option>Performance 1Y, %</option>
            </select>
            <ChevronDown size={14} className="text-gray-600 group-hover:text-gray-400" />
          </div>

          <div className="w-px h-4 bg-[#2a2e39]" />

          {/* Group By */}
          <div className="flex items-center gap-1.5 group cursor-pointer">
            <PieChart size={14} className="text-gray-500" />
            <select 
              value={groupBy} 
              onChange={e => setGroupBy(e.target.value)}
              className="bg-transparent focus:outline-none text-gray-300 hover:text-white font-semibold cursor-pointer appearance-none outline-none pr-1"
            >
              <option>Sector</option>
              <option>No group</option>
            </select>
            <ChevronDown size={14} className="text-gray-600 group-hover:text-gray-400" />
          </div>
        </div>
      </header>

      {/* Heatmap Container */}
      <div className="flex-1 relative w-full h-full min-h-0 bg-[#131722] overflow-hidden" ref={containerRef}>
        {!rootNode && (
          <div className="text-white p-4 font-mono text-sm">
            DEBUG INFO: <br/>
            dimensions: {dimensions.width}x{dimensions.height} <br/>
            stocks loaded: {stocks ? stocks.length : 'loading...'} <br/>
            filtered: {stocks ? stocks.filter((s: any) => (s.marketCap || 0) > 0).length : 0} <br/>
          </div>
        )}
        {rootNode && rootNode.leaves().length === 0 && (
          <div className="text-white p-4 font-mono text-sm">
            DEBUG: rootNode has 0 leaves!
          </div>
        )}
        {rootNode && rootNode.children && rootNode.children.map((sectorNode, i) => {
          return (
            <div key={`sector-${i}`} style={{ position: 'absolute', left: sectorNode.x0, top: sectorNode.y0, width: sectorNode.x1 - sectorNode.x0, height: sectorNode.y1 - sectorNode.y0, pointerEvents: 'none' }}>
              {/* Sector Header */}
              {(groupBy !== 'No group' && sectorNode.x1 - sectorNode.x0 > 50 && sectorNode.y1 - sectorNode.y0 > 25) && (
                <div className="absolute top-0 left-0 h-[22px] flex items-center px-1 text-white/80 font-medium text-[11px] bg-transparent truncate">
                  {(sectorNode.data as any).name} <span className="ml-0.5 opacity-50">&gt;</span>
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

                const color = getPerformanceColor(data.colorValue);
                const showContent = width > 40 && height > 25;
                const showLogo = width > 50 && height > 60;
                const logoSize = Math.max(16, Math.min(width * 0.3, height * 0.3, 32));

                return (
                  <div
                    key={`leaf-${j}`}
                    onClick={() => navigate(`/stock/${data.slug}`)}
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
                    className="flex flex-col items-center justify-center overflow-hidden hover:brightness-110 transition-all"
                  >
                    {showContent && (
                      <div className="flex flex-col items-center justify-center w-full px-1">
                        {showLogo && (
                          <div style={{ width: logoSize, height: logoSize }} className="rounded-full overflow-hidden mb-1 shadow-sm bg-white shrink-0">
                            <StockLogo ticker={data.name} name={data.fullName} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <span className="text-white font-semibold leading-none truncate w-full text-center" style={{ fontSize: Math.max(9, Math.min(width * 0.18, 14)), marginBottom: '4px' }}>
                          {data.name}
                        </span>
                        <span className="text-white font-medium leading-none truncate w-full text-center" style={{ fontSize: Math.max(9, Math.min(width * 0.15, 12)) }}>
                          {data.colorValue > 0 ? '+' : ''}{data.colorValue.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Floating Command Bar Tooltip */}
        {hoveredNode && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-[#131722] border border-[#2a2e39] shadow-2xl rounded-lg px-4 py-3 text-sm pointer-events-none transition-all duration-150 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-3 pr-4 border-r border-[#2a2e39]">
              <div className="w-8 h-8 rounded-full bg-white overflow-hidden shrink-0">
                <StockLogo ticker={hoveredNode.slug} name={hoveredNode.name} className="w-full h-full" />
              </div>
              <div>
                <div className="text-white font-bold leading-tight">{hoveredNode.name}</div>
                <div className="text-gray-400 text-xs truncate max-w-[150px] leading-tight">{hoveredNode.fullName}</div>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-white font-mono font-medium">{formatNumber(hoveredNode.size)}</span>
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{sizeBy}</span>
              </div>
              <div className="flex flex-col">
                <span className={`font-mono font-bold ${hoveredNode.colorValue >= 0 ? 'text-[#42bd7f]' : 'text-[#f23645]'}`}>
                  {hoveredNode.colorValue > 0 ? '+' : ''}{hoveredNode.colorValue.toFixed(2)}{colorBy === 'P/E Ratio' ? '' : '%'}
                </span>
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{colorBy}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* The Bottom Legend Bar */}
      <div className="flex-none p-2 bg-[#131722] flex justify-start pl-6 items-center gap-1 text-xs shrink-0 border-t border-[#2a2e39]">
        <div className="flex items-center text-[10px] font-semibold text-gray-400">
          <div className="mr-2">{colorBy}</div>
          <div className="flex h-1.5 w-64 rounded overflow-hidden">
            <div style={{ backgroundColor: '#f23645' }} className="flex-1" />
            <div style={{ backgroundColor: '#f7525f' }} className="flex-1" />
            <div style={{ backgroundColor: '#f77c80' }} className="flex-1" />
            <div style={{ backgroundColor: '#787b86' }} className="flex-1" />
            <div style={{ backgroundColor: '#42bd7f' }} className="flex-1" />
            <div style={{ backgroundColor: '#089950' }} className="flex-1" />
            <div style={{ backgroundColor: '#056636' }} className="flex-1" />
          </div>
        </div>
        
        {/* Scale labels */}
        <div className="flex w-64 ml-[88px] text-[10px] text-gray-500 font-medium justify-between relative" style={{ top: '2px' }}>
          <span>-3%</span>
          <span>-2%</span>
          <span>-0.25%</span>
          <span>0%</span>
          <span>0.25%</span>
          <span>2%</span>
          <span>3%</span>
        </div>
      </div>
    </div>
  );
};
