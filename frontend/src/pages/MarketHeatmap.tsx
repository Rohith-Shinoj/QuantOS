import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks } from '../api';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
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

// Strict TradingView Colors [-5.5%, 5.5%]
const getPerformanceColor = (value: number) => {
  if (value <= -4.5) return '#991f29'; 
  if (value <= -2.5) return '#f23645'; 
  if (value < -0.5) return '#f77c80'; 
  if (value >= -0.5 && value <= 0.5) return '#c9c9c9'; 
  if (value > 0.5 && value <= 2.5) return '#42bd7f'; 
  if (value > 2.5 && value < 4.5) return '#089950'; 
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
  const [colorBy, setColorBy] = useState('Performance');
  
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
      else if (sizeBy === 'Volume') val = s.volume || 0;
      else if (sizeBy === 'P/E Ratio') val = s.peRatio || 0;
      else if (sizeBy === 'RS Rating') val = s.rs_rating || 0;
      return Math.max(0, val);
    };

    // Color logic
    const getColorValue = (s: any) => {
      if (colorBy === 'Performance') return parseDayChange(s.day_change);
      if (colorBy === 'Inst. Accumulation') return s.inst_accum || 0;
      if (colorBy === 'RS Rating') return (s.rs_rating || 50) - 50; // shift to center at 0
      if (colorBy === 'P/E Ratio') return -(s.peRatio || 0); // lower PE is greener
      return 0;
    };

    let filteredStocks = stocks.filter((s: any) => getSizeValue(s) > 0);

    const groups: Record<string, any> = {};
    filteredStocks.forEach((stock: any) => {
      const groupName = stock.industry || 'Other';
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
        inst_accum: stock.inst_accum
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
      .paddingOuter(0)
      .paddingTop(24) // DEDICATED HEADER SPACE FOR SECTORS
      .round(true);

    return tree(root as any);
  }, [stocks, dimensions, sizeBy, colorBy]);

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
      <header className="flex-none p-3 border-b border-[#2a2e39] flex justify-between items-center bg-[#131722] z-10 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight text-white">Stock Heatmap</h1>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto text-sm">
          <div className="flex items-center gap-2 bg-[#1e222d] px-3 py-1.5 rounded border border-[#2a2e39] hover:border-[#363a45] transition-colors group">
            <span className="text-gray-400 whitespace-nowrap">Size by:</span>
            <select 
              value={sizeBy} 
              onChange={e => setSizeBy(e.target.value)}
              className="bg-transparent focus:outline-none text-white font-medium cursor-pointer pr-4 appearance-none outline-none"
            >
              <option>Market Cap</option>
              <option>Volume</option>
              <option>RS Rating</option>
              <option>P/E Ratio</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-[#1e222d] px-3 py-1.5 rounded border border-[#2a2e39] hover:border-[#363a45] transition-colors group">
            <span className="text-gray-400 whitespace-nowrap">Color by:</span>
            <select 
              value={colorBy} 
              onChange={e => setColorBy(e.target.value)}
              className="bg-transparent focus:outline-none text-white font-medium cursor-pointer pr-4 appearance-none outline-none"
            >
              <option>Performance</option>
              <option>Inst. Accumulation</option>
              <option>RS Rating</option>
              <option>P/E Ratio</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 relative w-full h-full min-h-0" ref={containerRef}>
        {rootNode && rootNode.children && rootNode.children.map((sectorNode, i) => {
          return (
            <div key={`sector-${i}`} style={{ position: 'absolute', left: sectorNode.x0, top: sectorNode.y0, width: sectorNode.x1 - sectorNode.x0, height: sectorNode.y1 - sectorNode.y0, pointerEvents: 'none' }}>
              {/* Sector Header */}
              {(sectorNode.x1 - sectorNode.x0 > 50 && sectorNode.y1 - sectorNode.y0 > 30) && (
                <div className="absolute top-0 left-0 right-0 h-[24px] flex items-center px-2 text-white/80 font-semibold text-[11px] bg-transparent truncate">
                  {(sectorNode.data as any).name} <span className="ml-1 opacity-50">&gt;</span>
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
                const showContent = width > 40 && height > 30;
                const logoSize = Math.max(16, Math.min(width * 0.3, height * 0.3, 40));
                const showLogo = width > 60 && height > 70;

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
                    className="flex flex-col items-center justify-center overflow-hidden hover:brightness-110 transition-all border border-white/20"
                  >
                    {showContent && (
                      <>
                        {showLogo && (
                          <div style={{ width: logoSize, height: logoSize }} className="rounded-full overflow-hidden mb-1 shadow-md bg-white shrink-0">
                            <StockLogo ticker={data.slug} name={data.name} className="w-full h-full object-cover" textClass="text-[8px] text-black font-bold" fallbackClass="bg-white flex items-center justify-center text-black" />
                          </div>
                        )}
                        <span className="text-white font-bold tracking-tight truncate px-1" style={{ fontSize: Math.max(9, Math.min(width * 0.15, 14)) }}>
                          {data.name}
                        </span>
                        <span className="text-white/90 font-medium truncate px-1" style={{ fontSize: Math.max(8, Math.min(width * 0.12, 12)) }}>
                          {data.colorValue > 0 ? '+' : ''}{data.colorValue.toFixed(2)}{colorBy === 'P/E Ratio' ? '' : '%'}
                        </span>
                      </>
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
                <StockLogo ticker={hoveredNode.slug} name={hoveredNode.name} className="w-full h-full" textClass="text-[10px]" fallbackClass="bg-white text-black" />
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
      <div className="flex-none p-3 border-t border-[#2a2e39] bg-[#131722] flex justify-center items-center gap-1 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-medium mr-2">{colorBy}</span>
          {[
            { label: '\u2264 -5.5%', color: '#991f29' },
            { label: '-4.5% to -2.5%', color: '#f23645' },
            { label: '-2.5% to -0.5%', color: '#f77c80' },
            { label: 'Neutral', color: '#c9c9c9' },
            { label: '0.5% to 2.5%', color: '#42bd7f' },
            { label: '2.5% to 4.5%', color: '#089950' },
            { label: '\u2265 5.5%', color: '#056636' },
          ].map((item, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="w-16 h-3 rounded-sm border border-black/20" style={{ backgroundColor: item.color }}></div>
              <span className="text-gray-400 text-[10px] font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
