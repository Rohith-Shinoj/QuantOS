import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks } from '../api';
import { Share, Settings, Expand, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { StockLogo } from '../components/StockLogo';

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

const CustomizedContent = (props: any) => {
  const { root, depth, x, y, width, height, index, payload, name, onClickNode } = props;

  if (width < 2 || height < 2) return null;

  if (depth === 1) {
    // Sector container. We just let it render transparently, as the child rects will fill the space.
    // We add a thicker stroke to distinguish sectors.
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="transparent"
          stroke="#131722"
          strokeWidth={4}
          pointerEvents="none"
        />
        {/* Only render sector name if it's large enough, pushing it to the very top left so it doesn't get completely obscured by stock labels */}
        {width > 80 && height > 60 && (
          <text 
            x={x + 6} 
            y={y + 18} 
            fill="rgba(255,255,255,0.85)" 
            fontSize={13} 
            fontFamily="-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif"
            fontWeight="600" 
            pointerEvents="none"
            stroke="none"
            style={{ textRendering: 'optimizeLegibility' }}
          >
            {name}
          </text>
        )}
      </g>
    );
  }

  if (depth === 2) {
    const colorValue = payload?.colorValue ?? props?.colorValue ?? 0;
    const color = getPerformanceColor(colorValue);

    // Dynamic font size calculation
    // Approximate character width is ~0.6 of font size. We want text to fit in width * 0.85.
    const tickerFontSize = Math.floor(Math.min((width * 0.85) / Math.max(name.length * 0.6, 1), height * 0.25, 24));
    const pctFontSize = Math.floor(tickerFontSize * 0.75);

    // Minimum readable font size is ~9px. If we can't even render 9px, hide text.
    const canFitTicker = tickerFontSize >= 9 && height >= 20;
    const canFitPct = pctFontSize >= 9 && height >= 36;
    
    // Logo scaling logic
    const minSide = Math.min(width, height);
    const logoSize = Math.max(16, Math.floor(minSide * 0.3));
    const canFitLogo = minSide >= 40 && height >= (logoSize + tickerFontSize * 1.5 + 10);

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={color}
          stroke="#131722"
          strokeWidth={1}
          style={{ cursor: 'pointer' }}
          onClick={() => onClickNode(payload || props)}
          className="transition-opacity hover:opacity-80"
        />
        
        {/* Logo rendered via foreignObject */}
        {canFitLogo && payload?.slug && (
          <foreignObject
            x={Math.round(x + width / 2 - logoSize / 2)}
            y={Math.round(canFitPct ? y + height / 2 - tickerFontSize * 0.1 - logoSize - 8 : y + height / 2 + tickerFontSize * 0.35 - tickerFontSize - logoSize - 8)}
            width={logoSize}
            height={logoSize}
            style={{ pointerEvents: 'none' }}
          >
            <StockLogo ticker={payload.slug} name={name} className="w-full h-full" textClass="hidden" fallbackClass="bg-canvas border border-border text-text-primary" />
          </foreignObject>
        )}
        
        {/* Text rendering without clipPath to prevent WebKit antialiasing loss */}
        {canFitTicker && (
          <>
            {/* Ticker Symbol */}
            <text 
              x={Math.round(x + width / 2)} 
              y={Math.round(canFitPct ? y + height / 2 - tickerFontSize * 0.1 : y + height / 2 + tickerFontSize * 0.35)} 
              textAnchor="middle" 
              fill="#FFFFFF" 
              fontSize={tickerFontSize} 
              fontFamily="-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif"
              fontWeight="bold" 
              pointerEvents="none"
              stroke="none"
              style={{ WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' }}
            >
              {name === '1' ? 'BSE SENSEX' : name}
            </text>
            
            {/* % Change (Only show if height is big enough to separate it from ticker) */}
            {canFitPct && (
              <text 
                x={Math.round(x + width / 2)} 
                y={Math.round(y + height / 2 + tickerFontSize * 1.0)} 
                textAnchor="middle" 
                fill="#FFFFFF" 
                fontSize={pctFontSize} 
                fontFamily="-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif"
                fontWeight="normal"
                pointerEvents="none"
                stroke="none"
                style={{ WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' }}
              >
                {colorValue > 0 ? '+' : ''}{colorValue.toFixed(2)}%
              </text>
            )}
          </>
        )}
      </g>
    );
  }

  return null;
};

import { Skeleton } from '../components/Skeleton';

export const MarketHeatmap = () => {
  const navigate = useNavigate();
  const [sizeBy, setSizeBy] = useState('Market Cap');
  const [colorBy, setColorBy] = useState('Performance');

  const { data: stocks, isLoading } = useQuery({
    queryKey: ['allStocks'],
    queryFn: fetchAllStocks,
  });

  const hierarchyData = useMemo(() => {
    if (!stocks) return [];
    
    let filteredStocks = stocks.filter((s: any) => s.marketCap > 0);

    const groups: Record<string, any> = {};

    filteredStocks.forEach((stock: any) => {
      const groupName = stock.industry || 'Other';
      if (!groups[groupName]) {
        groups[groupName] = { name: groupName, children: [] };
      }
      
      const pctChange = parseDayChange(stock.day_change);

      groups[groupName].children.push({
        name: stock.ticker,
        slug: stock.slug,
        fullName: stock.name,
        size: stock.marketCap || 1, 
        colorValue: pctChange,
        peRatio: stock.peRatio,
        marketCap: stock.marketCap
      });
    });

    return Object.values(groups).map((g: any) => {
      // sort children by size descending for better squarify
      g.children.sort((a: any, b: any) => b.size - a.size);
      return g;
    }).sort((a: any, b: any) => {
      const aSize = a.children.reduce((acc: number, curr: any) => acc + curr.size, 0);
      const bSize = b.children.reduce((acc: number, curr: any) => acc + curr.size, 0);
      return bSize - aSize;
    });
  }, [stocks]);

  const handleNodeClick = (nodeData: any) => {
    if (nodeData && nodeData.slug) {
      navigate(`/stock/${nodeData.slug}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-[#131722] p-4">
        <Skeleton className="h-[90%] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#131722] text-text-primary overflow-hidden">
      {/* Top Navigation Bar - TradingView Dark Style */}
      <header className="flex-none p-3 border-b border-[#2a2e39] flex justify-between items-center bg-[#131722] z-10 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight text-white">Stock Heatmap</h1>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto text-sm">
          <div className="flex items-center gap-2 bg-[#1e222d] px-3 py-1.5 rounded border border-[#2a2e39] hover:border-[#363a45] transition-colors">
            <span className="text-gray-400 whitespace-nowrap">Size by:</span>
            <select 
              value={sizeBy} 
              onChange={e => setSizeBy(e.target.value)}
              className="bg-transparent focus:outline-none text-white font-medium appearance-none cursor-pointer pr-2"
            >
              <option>Market Cap</option>
              <option>Volume</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-[#1e222d] px-3 py-1.5 rounded border border-[#2a2e39] hover:border-[#363a45] transition-colors">
            <span className="text-gray-400 whitespace-nowrap">Color by:</span>
            <select 
              value={colorBy} 
              onChange={e => setColorBy(e.target.value)}
              className="bg-transparent focus:outline-none text-white font-medium appearance-none cursor-pointer pr-2"
            >
              <option>Performance</option>
              <option>P/E Ratio</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Workspace: Full Screen Monolithic Treemap */}
      <div className="flex-1 relative w-full h-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={hierarchyData}
            dataKey="size"
            aspectRatio={4 / 3}
            stroke="#131722"
            fill="#131722"
            content={<CustomizedContent onClickNode={handleNodeClick} />}
            isAnimationActive={false}
          >
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  if (!data.slug) return null; // hide sector hover
                  return (
                    <div className="bg-[#1e222d] border border-[#2a2e39] rounded shadow-xl p-4 text-sm min-w-[220px] text-white z-50">
                      <div className="font-bold text-base mb-1">{data.name}</div>
                      <div className="text-gray-400 mb-3 truncate max-w-[250px]">{data.fullName}</div>
                      <div className="flex justify-between py-1 border-b border-[#2a2e39]">
                        <span className="text-gray-400">Size ({sizeBy})</span>
                        <span className="font-mono tabular-nums font-medium">{formatNumber(data.marketCap)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-[#2a2e39]">
                        <span className="text-gray-400">{colorBy}</span>
                        <span className={`font-mono tabular-nums font-bold ${data.colorValue >= 0 ? 'text-[#42bd7f]' : 'text-[#f23645]'}`}>
                          {data.colorValue > 0 ? '+' : ''}{data.colorValue.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-gray-400">P/E Ratio</span>
                        <span className="font-mono tabular-nums">{data.peRatio ? data.peRatio.toFixed(2) : 'N/A'}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
          </Treemap>
        </ResponsiveContainer>

        {/* Floating Controls */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2 bg-[#1e222d] rounded border border-[#2a2e39] p-1 shadow-xl">
          <button className="p-2 hover:bg-[#2a2e39] rounded text-gray-400 hover:text-white transition-colors" title="Zoom In">
            <ZoomIn size={16} />
          </button>
          <button className="p-2 hover:bg-[#2a2e39] rounded text-gray-400 hover:text-white transition-colors" title="Zoom Out">
            <ZoomOut size={16} />
          </button>
          <button className="p-2 hover:bg-[#2a2e39] rounded text-gray-400 hover:text-white transition-colors" title="Reset Zoom">
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* The Bottom Legend Bar */}
      <div className="flex-none p-3 border-t border-[#2a2e39] bg-[#131722] flex justify-center items-center gap-1 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-medium mr-2">Performance</span>
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