import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
import type { ISeriesApi, IChartApi, Time } from 'lightweight-charts';
import { Activity, Wifi, WifiOff, TrendingUp, TrendingDown, Zap, BarChart3, Clock, Server, ArrowUpRight, ArrowDownRight } from 'lucide-react';

import {
  fetchCryptoStatus,
  fetchCryptoVWAP,
  fetchCryptoOHLC,
  fetchCryptoOrderBook,
  fetchCryptoImbalance,
  fetchCryptoStats,
  fetchCryptoTrades
} from '../api';

// --- Interfaces ---
interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface VWAPData {
  time: number;
  value: number;
}

interface Trade {
  id: string;
  time: number;
  price: number;
  size: number;
  side: 'buy' | 'sell';
}

interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
}

interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  mid: number;
}

interface CryptoStats {
  index?: number;
  vwap: number;
  high: number;
  low: number;
  volume: number;
  ticks: number;
  spread: number;
  mid: number;
  bid: number;
  ask: number;
  volatility: number;
  tick_rate: number;
  imbalance: number;
}

interface SystemStatus {
  status: string;
  rdb: string;
  ticks_today: number;
}

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'];

// --- Formatting Helpers ---
const formatTime = (ts: number | string) => {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
};
const formatPrice = (p: number) => p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const formatSize = (s: number) => s.toLocaleString(undefined, { maximumFractionDigits: 4 });

export const CryptoLive = () => {
  const [selectedSymbol, setSelectedSymbol] = useState(SYMBOLS[0]);
  
  // Real-time State
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [stats, setStats] = useState<CryptoStats | null>(null);
  const [wsStatus, setWsStatus] = useState<'Connecting' | 'Connected' | 'Reconnecting' | 'Offline'>('Connecting');
  
  // Chart Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Queries (Initial Data)
  const { data: initialOhlc, isLoading: loadingOhlc } = useQuery({
    queryKey: ['cryptoOhlc', selectedSymbol],
    queryFn: () => fetchCryptoOHLC(selectedSymbol, '1m') as Promise<OHLCData[]>,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const { data: initialTrades } = useQuery({
    queryKey: ['cryptoTrades', selectedSymbol],
    queryFn: () => fetchCryptoTrades(selectedSymbol, 100) as Promise<Trade[]>,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const { data: initialOrderBook } = useQuery({
    queryKey: ['cryptoOrderBook', selectedSymbol],
    queryFn: () => fetchCryptoOrderBook(selectedSymbol) as Promise<OrderBookData>,
    refetchOnWindowFocus: false,
  });

  const { data: initialStats } = useQuery({
    queryKey: ['cryptoStats', selectedSymbol],
    queryFn: () => fetchCryptoStats(selectedSymbol) as Promise<CryptoStats>,
    refetchOnWindowFocus: false,
  });

  const { data: systemStatus } = useQuery({
    queryKey: ['cryptoStatus'],
    queryFn: () => fetchCryptoStatus() as Promise<SystemStatus>,
    refetchInterval: 5000,
  });

  // Sync initial data to state
  // Safely initialize state handles API error fallbacks
  useEffect(() => { if (initialTrades && Array.isArray(initialTrades)) setTrades(initialTrades); }, [initialTrades]);
  useEffect(() => { 
    if (initialOrderBook && typeof initialOrderBook === 'object' && !Array.isArray(initialOrderBook)) {
      if (!('detail' in initialOrderBook)) {
        setOrderBook(initialOrderBook); 
      }
    }
  }, [initialOrderBook]);
  useEffect(() => { 
    if (initialStats && typeof initialStats === 'object' && !Array.isArray(initialStats)) {
      // Don't set error objects as stats (API returns {detail: "..."} on 503)
      if (!('detail' in initialStats)) {
        setStats(initialStats); 
      }
    }
  }, [initialStats]);

  // --- WebSocket Manager ---
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);
  const backoffRef = useRef(1000);
  
  // Batching queues for rAF
  const tradesQueueRef = useRef<Trade[]>([]);
  const latestOhlcRef = useRef<OHLCData | null>(null);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;

    const connectWS = () => {
      if (!isMounted) return;
      setWsStatus('Connecting');

      const apiUrl = import.meta.env.VITE_API_URL || '';
      let wsUrl = '';
      if (apiUrl) {
        wsUrl = apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '/ws/crypto');
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws/crypto`;
      }

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWsStatus('Connected');
          backoffRef.current = 1000;
          ws.send(JSON.stringify({ subscribe: selectedSymbol }));
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'trade') {
              // The backend sends the trade data directly on the msg object (no nested 'data' key)
              tradesQueueRef.current.push(msg as CryptoTrade);
            } else if (msg.type === 'depth') {
              setOrderBook(msg as OrderBook);
            } else if (msg.type === 'stats') {
              setStats(msg as CryptoStats);
            } else if (msg.type === 'ohlc') {
              latestOhlcRef.current = msg as OHLCData;
            }
          } catch (e) {
            console.error('WS Parse Error', e);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsStatus('Reconnecting');
          reconnectTimeoutRef.current = setTimeout(() => {
            backoffRef.current = Math.min(backoffRef.current * 2, 30000);
            connectWS();
          }, backoffRef.current);
        };

        ws.onerror = () => {
          // Handled by close
        };
      } catch (err) {
        setWsStatus('Offline');
      }
    };

    connectWS();

    const processQueue = () => {
      if (!isMounted) return;
      
      // Process Trades
      if (tradesQueueRef.current.length > 0) {
        const newTrades = [...tradesQueueRef.current];
        tradesQueueRef.current = [];
        setTrades(prev => {
          const merged = [...newTrades.reverse(), ...prev];
          return merged.slice(0, 200);
        });
      }

      // Process OHLC to Chart
      if (latestOhlcRef.current && candleSeriesRef.current) {
        // Need to cast time to Time for lightweight charts if it's a timestamp
        const ts = typeof latestOhlcRef.current.time === 'string' 
          ? new Date(latestOhlcRef.current.time).getTime() 
          : latestOhlcRef.current.time;
        candleSeriesRef.current.update({
          ...latestOhlcRef.current,
          time: (ts / 1000) as Time,
        });
        latestOhlcRef.current = null;
      }

      rafRef.current = requestAnimationFrame(processQueue);
    };
    rafRef.current = requestAnimationFrame(processQueue);

    return () => {
      isMounted = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [selectedSymbol]); // Re-run effect entirely on symbol change to ensure fresh connection/subscription

  // --- Chart Initialization ---
  useEffect(() => {
    if (!chartContainerRef.current || !initialOhlc) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0f' },
        textColor: '#9ca3af',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1a1a2e' },
        horzLines: { color: '#1a1a2e' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#2d2d3d',
      },
      timeScale: {
        borderColor: '#2d2d3d',
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });
    
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00dc82',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#00dc82',
      wickDownColor: '#ef4444',
    });
    
    candleSeriesRef.current = candleSeries;

    const vwapSeries = chart.addLineSeries({
      color: '#eab308',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    
    vwapSeriesRef.current = vwapSeries;

    // Transform data for lightweight-charts
    const validOhlc = Array.isArray(initialOhlc) ? initialOhlc : [];
    const chartData = validOhlc.filter(d => d && d.time).map(d => {
      const ts = typeof d.time === 'string' ? new Date(d.time).getTime() : d.time;
      return {
        ...d,
        time: (ts / 1000) as Time
      };
    });
    
    candleSeries.setData(chartData);

    // Dummy VWAP for visual if not provided in OHLC (since prompt mentions VWAP overlay)
    // Assuming we calculate a simple running VWAP from the initial OHLC if actual VWAP timeseries isn't fetched
    let cumVol = 0;
    let cumVolPrice = 0;
    const vwapData = validOhlc.filter(d => d && d.time).map(d => {
      const ts = typeof d.time === 'string' ? new Date(d.time).getTime() : d.time;
      const typicalPrice = (d.high + d.low + d.close) / 3;
      // Using generic volume for demo if volume missing from Ohlc interface, assuming it exists
      const vol = (d as any).volume || 1; 
      cumVol += vol;
      cumVolPrice += typicalPrice * vol;
      return { time: (ts / 1000) as Time, value: cumVolPrice / cumVol };
    });
    vwapSeries.setData(vwapData);

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      vwapSeriesRef.current = null;
    };
  }, [initialOhlc]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full bg-canvas text-text-primary overflow-hidden">
      {/* 1. Symbol Selector Bar */}
      <div className="flex-none flex items-center px-4 py-3 bg-surface border-b border-border gap-2 overflow-x-auto no-scrollbar">
        {SYMBOLS.map(sym => (
          <button
            key={sym}
            onClick={() => setSelectedSymbol(sym)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap flex items-center gap-2 ${
              selectedSymbol === sym 
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                : 'bg-surface-hover text-text-secondary border border-transparent hover:text-text-primary hover:border-border'
            }`}
          >
            {/* Logo */}
            <img 
              src={`/logos/${sym}.png`} 
              className="w-4 h-4 rounded-full flex-shrink-0 bg-white/10 object-cover" 
              alt=""
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            {sym}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Activity size={16} className={wsStatus === 'Connected' ? 'text-green-500' : 'text-yellow-500'} />
          <span className="font-mono">{wsStatus}</span>
        </div>
      </div>

      {/* 2. Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Column */}
        <div className="flex-[6] flex flex-col border-r border-border min-w-0">
          
          {/* Chart Container */}
          <div className="relative flex-[2] min-h-[300px] bg-[#0a0a0f]">
            {loadingOhlc && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-canvas/50 backdrop-blur-sm">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            )}
            <div ref={chartContainerRef} className="absolute inset-0" />
            
            {/* Chart Legend Overlay */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 pointer-events-none">
              <div className="flex items-center gap-2">
                {/* Logo */}
                <img 
                  src={`/logos/${selectedSymbol}.png`} 
                  className="w-6 h-6 rounded-full bg-white/10 flex-shrink-0 object-cover shadow-[0_0_10px_rgba(255,255,255,0.1)]" 
                  alt=""
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <span className="text-xl font-bold text-white tracking-tight">{selectedSymbol}</span>
                <span className="text-sm font-medium text-text-secondary bg-surface/80 px-2 py-0.5 rounded backdrop-blur-md">1m VWAP</span>
                
                <div className="ml-2 flex items-baseline gap-2">
                  <span className="text-xl font-mono text-white font-medium">${stats?.mid ? formatPrice(stats.mid) : '---'}</span>
                  {(() => {
                    if (!orderBook) return <span className="text-sm font-mono text-text-secondary">---</span>;
                    const prices = [
                      ...(orderBook.asks || []).map(a => a?.price).filter(p => p > 0),
                      ...(orderBook.bids || []).map(b => b?.price).filter(p => p > 0)
                    ];
                    if (prices.length === 0) return <span className="text-sm font-mono text-text-secondary">---</span>;
                    const high = Math.max(...prices);
                    const low = Math.min(...prices);
                    const diff = high - low;
                    const perc = (diff / low) * 100;
                    return (
                      <span className="text-sm font-mono text-[#00dc82]">
                        {diff > 0 ? '+' : ''}{formatPrice(diff)} ({diff > 0 ? '+' : ''}{perc.toFixed(2)}%)
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Trade Tape */}
          <div className="flex-[1] flex flex-col bg-surface overflow-hidden border-t border-border">
            <div className="flex items-center px-4 py-2 border-b border-border bg-surface-hover/50 text-xs font-semibold text-text-secondary tracking-wider uppercase">
              <div className="flex-1">Time</div>
              <div className="flex-1 text-right">Price</div>
              <div className="flex-1 text-right">Size</div>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-sm no-scrollbar">
              {!Array.isArray(trades) || trades.length === 0 ? (
                <div className="p-4 text-center text-text-secondary text-sm">Waiting for trades...</div>
              ) : (
                trades.map((trade, i) => {
                  if (!trade) return null;
                  const uniqueKey = `${trade.time}-${trade.price}-${trade.size}-${i}`;
                  return (
                    <div 
                      key={uniqueKey} 
                      className="flex items-center px-4 py-1 hover:bg-surface-hover/50 transition-colors cursor-default animate-trade-flash"
                    >
                      <div className="flex-1 text-text-secondary">{trade.time ? formatTime(trade.time) : '--:--'}</div>
                      <div className={`flex-1 text-right font-medium ${trade.side === 'buy' ? 'text-[#00dc82]' : 'text-[#ef4444]'}`}>
                        {trade.price ? formatPrice(trade.price) : '--'}
                      </div>
                      <div className="flex-1 text-right text-text-secondary">{trade.size ? formatSize(trade.size) : '--'}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="flex-[4] flex flex-col min-w-[300px] bg-canvas">
          
          {/* Order Book Depth */}
          <div className="flex-[2] flex flex-col border-b border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-surface/50">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BarChart3 size={16} className="text-blue-400" />
                Order Book Depth
              </div>
              {orderBook && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-text-secondary">Spread: <span className="text-text-primary font-mono">{orderBook.spread.toFixed(2)}</span></span>
                </div>
              )}
            </div>
            
            <div className="flex-1 flex flex-col overflow-hidden p-2">
              <div className="flex text-[11px] uppercase tracking-wider text-text-secondary px-2 mb-2 font-medium">
                <div className="flex-1 text-left">Total</div>
                <div className="flex-1 text-left">Size</div>
                <div className="flex-[1.5] text-center">Price</div>
                <div className="flex-1 text-right">Size</div>
                <div className="flex-1 text-right">Total</div>
              </div>
              
              <div className="flex-1 overflow-y-auto no-scrollbar font-mono text-sm flex flex-col justify-center">
                {/* Asks (Sell Orders - Top Half, Orange) */}
                <div className="flex flex-col-reverse justify-start">
                  {(() => {
                    let cumulativeAsk = 0;
                    const asks = (orderBook?.asks.filter(l => l) || []).slice(0, 15);
                    const asksWithTotal = asks.map(ask => {
                      cumulativeAsk += ask.size;
                      return { ...ask, total: cumulativeAsk };
                    });
                    const maxTotal = asksWithTotal.length ? asksWithTotal[asksWithTotal.length - 1].total : 1;
                    
                    return asksWithTotal.map((ask, i) => {
                      const width = `${(ask.total / maxTotal) * 100}%`;
                      return (
                        <div key={`ask-${i}`} className="flex relative h-6 items-center px-2 group hover:bg-surface-hover/30 text-xs">
                          <div className="absolute right-0 top-0 bottom-0 bg-[#f97316]/15 transition-all duration-300 ease-out" style={{ width }} />
                          <div className="flex-1 text-left text-text-secondary z-10">-</div>
                          <div className="flex-1 text-left text-text-secondary z-10">-</div>
                          <div className="flex-[1.5] text-center text-[#f97316] font-semibold z-10">{formatPrice(ask.price)}</div>
                          <div className="flex-1 text-right z-10">{formatSize(ask.size)}</div>
                          <div className="flex-1 text-right text-text-secondary z-10">{formatSize(ask.total)}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
                
                {/* Spread / Mid Price */}
                <div className="my-2 py-2 border-y border-border/50 flex flex-col items-center justify-center bg-surface/30">
                  <div className="text-lg font-bold">{orderBook ? formatPrice(orderBook.mid) : '---'}</div>
                </div>

                {/* Bids (Buy Orders - Bottom Half, Blue) */}
                <div className="flex flex-col justify-start">
                  {(() => {
                    let cumulativeBid = 0;
                    const bids = (orderBook?.bids.filter(l => l) || []).slice(0, 15);
                    const bidsWithTotal = bids.map(bid => {
                      cumulativeBid += bid.size;
                      return { ...bid, total: cumulativeBid };
                    });
                    const maxTotal = bidsWithTotal.length ? bidsWithTotal[bidsWithTotal.length - 1].total : 1;

                    return bidsWithTotal.map((bid, i) => {
                      const width = `${(bid.total / maxTotal) * 100}%`;
                      return (
                        <div key={`bid-${i}`} className="flex relative h-6 items-center px-2 group hover:bg-surface-hover/30 text-xs">
                          <div className="absolute left-0 top-0 bottom-0 bg-[#3b82f6]/15 transition-all duration-300 ease-out" style={{ width }} />
                          <div className="flex-1 text-left text-text-secondary z-10">{formatSize(bid.total)}</div>
                          <div className="flex-1 text-left z-10">{formatSize(bid.size)}</div>
                          <div className="flex-[1.5] text-center text-[#3b82f6] font-semibold z-10">{formatPrice(bid.price)}</div>
                          <div className="flex-1 text-right text-text-secondary z-10">-</div>
                          <div className="flex-1 text-right text-text-secondary z-10">-</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Microstructure Panel */}
          <div className="flex-[1] flex flex-col p-4 bg-surface/30 overflow-y-auto">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-0">
              <Zap size={16} className="text-yellow-400" />
              Microstructure Engine
            </h3>
            
            <div className="grid grid-cols-2 gap-0">
              <MetricCard 
                label="VWAP" 
                value={stats?.vwap ? formatPrice(stats.vwap) : '---'} 
                icon={<Activity size={14} />} 
              />
              <MetricCard 
                label="Spread (bps)" 
                value={stats?.spread && stats?.mid ? ((stats.spread / stats.mid) * 10000).toFixed(2) : '---'} 
              />
              
              {/* Imbalance Card with Progress Bar */}
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 flex flex-col justify-center relative overflow-hidden group hover:bg-white/10 transition-colors">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="text-xs text-white/60 mb-2 z-10">Bid/Ask Imbalance</span>
                <div className="flex flex-col gap-1.5 z-10">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-mono font-medium ${
                      !stats ? 'text-white' : stats.imbalance > 0 ? 'text-[#3b82f6]' : stats.imbalance < 0 ? 'text-[#f97316]' : 'text-white'
                    }`}>
                      {stats?.imbalance ? (stats.imbalance > 0 ? '+' : '') + stats.imbalance.toFixed(3) : '---'}
                    </span>
                  </div>
                  {/* Progress bar container */}
                  <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden flex">
                    {/* The imbalance is from -1 to 1. 0 means 50% / 50%. */}
                    {/* Example: Imbalance 1.0 means 100% Bids, -1.0 means 100% Asks */}
                    <div 
                      className="h-full bg-[#3b82f6] transition-all duration-300"
                      style={{ width: stats?.imbalance !== undefined ? `${(stats.imbalance + 1) / 2 * 100}%` : '50%' }}
                    />
                    <div 
                      className="h-full bg-[#f97316] transition-all duration-300"
                      style={{ width: stats?.imbalance !== undefined ? `${100 - ((stats.imbalance + 1) / 2 * 100)}%` : '50%' }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-white/40 font-mono">
                    <span>Bids</span>
                    <span>Asks</span>
                  </div>
                </div>
              </div>

              <MetricCard 
                label="Ticks/sec" 
                value={stats?.tick_rate ? stats.tick_rate.toFixed(1) : '---'} 
                icon={<Clock size={14} />} 
              />
              <MetricCard 
                label="Rolling Vol (1h)" 
                value={stats?.volatility ? `${stats.volatility.toFixed(4)}%` : '---'} 
              />
              <MetricCard 
                label="Session Vol" 
                value={stats?.volume ? (stats.volume >= 1000 ? (stats.volume/1000).toFixed(1)+'k' : stats.volume.toFixed(2)) : '---'} 
              />
            </div>
          </div>

        </div>
      </div>

      {/* 3. Status Bar */}
      <div className="flex-none h-8 bg-[#0a0a0f] border-t border-border flex items-center justify-between px-4 text-xs text-text-secondary font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">TP</span>
            <div className={`w-2 h-2 rounded-full ${systemStatus?.status === 'online' ? 'bg-[#00dc82] shadow-[0_0_5px_#00dc82]' : 'bg-[#ef4444]'}`} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">RDB</span>
            <div className={`w-2 h-2 rounded-full ${systemStatus?.rdb === 'up' ? 'bg-[#00dc82] shadow-[0_0_5px_#00dc82]' : 'bg-[#ef4444]'}`} />
          </div>
          <div className="flex items-center gap-2">
            <Server size={12} />
            <span>Ticks Today: {systemStatus?.ticks_today?.toLocaleString() || '---'}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {wsStatus === 'Connected' ? (
            <Wifi size={12} className="text-[#00dc82]" />
          ) : (
            <WifiOff size={12} className="text-[#ef4444]" />
          )}
          <span className={
            wsStatus === 'Connected' ? 'text-[#00dc82]' : 
            wsStatus === 'Reconnecting' ? 'text-yellow-500' : 'text-[#ef4444]'
          }>
            {wsStatus}
          </span>
        </div>
      </div>
      
      {/* Offline Overlay */}
      {wsStatus === 'Offline' && (
        <div className="absolute inset-0 z-50 bg-canvas/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="bg-surface border border-red-500/30 p-6 rounded-xl shadow-2xl flex flex-col items-center max-w-sm text-center">
            <WifiOff size={32} className="text-red-500 mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Connection Lost</h2>
            <p className="text-text-secondary text-sm mb-4">
              Unable to connect to the kdb+ real-time tick plant. Please check your backend connection.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard = ({ label, value, icon }: { label: string, value: string | number, icon?: React.ReactNode }) => (
  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 flex flex-col justify-center relative overflow-hidden group hover:bg-white/10 transition-colors">
    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    <div className="flex items-center gap-1.5 text-xs text-white/60 mb-1 z-10">
      {icon && <span className="opacity-70 text-blue-400">{icon}</span>}
      {label}
    </div>
    <div className="text-lg font-mono font-medium text-white z-10">
      {value}
    </div>
  </div>
);
