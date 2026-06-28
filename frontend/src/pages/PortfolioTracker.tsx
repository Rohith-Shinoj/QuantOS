import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllStocks, fetchMutualFunds, fetchPortfolioAIAnalysis, sendPortfolioChat, fetchBatchStockData, fetchMutualFundByCode, fetchCaptureRatios, fetchPortfolio, savePortfolio, fetchBatchLiveQuotes } from '../api';
import { Search, X, PieChart as PieChartIcon, BrainCircuit, AlertTriangle, Send, Loader2, Globe, Zap, List, Activity, Maximize2, Minimize2, TrendingUp, TrendingDown, Shield, Eye, Wallet, Crosshair, Waves, BarChart3, Info, RefreshCw, Edit3, Check } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, BarChart, Bar, AreaChart, Area, ReferenceLine, ReferenceArea, LineChart, Line } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { StockLogo } from '../components/StockLogo';
import { GlobalSearch } from '../components/GlobalSearch';
import { useSearch } from '../hooks/useSearch';
import type { SearchResult } from '../hooks/useSearch';

interface LocalHolding {
  slug: string;
  type: string;
  units: number;
  invested_amount: number;
  holding_value: number;
}

export const PortfolioTracker = ({ isPanel = false }: { isPanel?: boolean }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'STOCKS' | 'MUTUAL_FUNDS'>('STOCKS');
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editHoldingVal, setEditHoldingVal] = useState<string>('');
  const [editInvestedVal, setEditInvestedVal] = useState<string>('');
  
  const [stockHoldings, setStockHoldings] = useState<LocalHolding[]>([]);
  const [mfHoldings, setMfHoldings] = useState<LocalHolding[]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<any[]>([]);
  const [isPortfolioLoaded, setIsPortfolioLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [liveQuotesMap, setLiveQuotesMap] = useState<Record<string, any>>({});
  const [inceptionDateString, setInceptionDateString] = useState<string>('');

  useEffect(() => {
    fetchPortfolio().then(data => {
      if (data && data.holdings) {
        const migrated = data.holdings.map((h: any) => ({
          ...h,
          holding_value: h.holding_value || 0,
        }));
        setStockHoldings(migrated.filter((h: any) => h.type === 'STOCKS'));
        setMfHoldings(migrated.filter((h: any) => h.type === 'MUTUAL_FUNDS'));
      }
      if (data && data.history) {
        setPortfolioHistory(data.history);
      }
      setIsPortfolioLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (isPortfolioLoaded) {
      savePortfolio({ holdings: [...stockHoldings, ...mfHoldings] });
    }
  }, [stockHoldings, mfHoldings, isPortfolioLoaded]);

  const [query, setQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<SearchResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [unitsInput, setUnitsInput] = useState<string>('');
  const [investedInput, setInvestedInput] = useState<string>('');
  
  const [stockRiskTolerance, setStockRiskTolerance] = useState<string>(() => localStorage.getItem('portfolio_stock_risk') || 'Moderate');
  const [mfRiskTolerance, setMfRiskTolerance] = useState<string>(() => localStorage.getItem('portfolio_mf_risk') || 'Moderate');
  const [holdingPeriod, setHoldingPeriod] = useState<string>(() => localStorage.getItem('portfolio_holding_period') || 'Long Term');
  
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: string, content: string}[]>(() => {
    const saved = localStorage.getItem('portfolio_chat');
    return saved ? JSON.parse(saved) : [];
  });
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem('portfolio_stock_risk', stockRiskTolerance); }, [stockRiskTolerance]);
  useEffect(() => { localStorage.setItem('portfolio_mf_risk', mfRiskTolerance); }, [mfRiskTolerance]);
  useEffect(() => { localStorage.setItem('portfolio_holding_period', holdingPeriod); }, [holdingPeriod]);
  useEffect(() => { localStorage.setItem('portfolio_chat', JSON.stringify(chatHistory)); }, [chatHistory]);

  const { data: allStocks } = useQuery({ queryKey: ['allStocks'], queryFn: fetchAllStocks });
  const { data: mfData } = useQuery({ queryKey: ['allMFsSearch'], queryFn: () => fetchMutualFunds({ limit: 5000, minimal: true }) });
  const allMFs = mfData?.data || [];

  // Chart mode toggle
  const [chartMode, setChartMode] = useState<'growth' | 'allocation' | 'stress' | 'performance' | 'drawdown'>('growth');

  // Fetch detailed batch stock data (OHLCV, relative_data) for portfolio holdings
  const stockSlugs = useMemo(() => stockHoldings.map(h => h.slug), [stockHoldings]);
  const { data: batchStockData } = useQuery({
    queryKey: ['batchStockData_v2', stockSlugs.join(',')],
    queryFn: () => fetchBatchStockData(stockSlugs),
    enabled: stockSlugs.length > 0,
  });

  // Fetch detailed MF data for each holding (for detailed_holdings, advanced_stats)
  const mfSlugs = useMemo(() => mfHoldings.map(h => h.slug), [mfHoldings]);
  const mfSlugsKey = mfSlugs.join(',');
  const { data: mfDetailsRaw } = useQuery({
    queryKey: ['mfDetails', mfSlugsKey],
    queryFn: async () => {
      const results = await Promise.all(mfSlugs.map(slug => fetchMutualFundByCode(slug)));
      const map: Record<string, any> = {};
      results.forEach((r, i) => { if (r) map[mfSlugs[i]] = r; });
      return map;
    },
    enabled: mfSlugs.length > 0,
  });
  const mfDetails: Record<string, any> = mfDetailsRaw || {};

  // Fetch capture ratios
  const { data: captureRatiosData } = useQuery({
    queryKey: ['captureRatios'],
    queryFn: fetchCaptureRatios,
    enabled: mfHoldings.length > 0,
  });

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const stockSlugs = stockHoldings.map(h => h.slug);
      if (stockSlugs.length > 0) {
        const quotes = await fetchBatchLiveQuotes(stockSlugs);
        setLiveQuotesMap(quotes);
      }
      // Also refresh MF NAV data
      queryClient.invalidateQueries({ queryKey: ['mfDetails'] });
      queryClient.invalidateQueries({ queryKey: ['allMFsSearch'] });
    } catch (e) {
      console.error("Sync failed:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const getLivePrice = (slug: string, tab: 'STOCKS' | 'MUTUAL_FUNDS'): number => {
    if (tab === 'STOCKS') {
      // Priority 1: Live quote from sync
      if (liveQuotesMap[slug] && liveQuotesMap[slug].currentPrice) {
        return liveQuotesMap[slug].currentPrice;
      }
      // Priority 2: Parse livePrice string from allStocks
      const stock = allStocks?.find((s: any) => s.slug === slug);
      let price = stock?.livePrice;
      if (typeof price === 'string') {
        price = parseFloat(price.replace(/[^0-9.-]+/g, ""));
      }
      if (price && !isNaN(price) && price > 0) return price;
      // Priority 3: Derive from stored holding_value (never use peRatio as price)
      const holding = stockHoldings.find(h => h.slug === slug);
      if (holding && holding.holding_value > 0 && holding.units > 0) {
        return holding.holding_value / holding.units;
      }
      return 0;
    } else {
      // Priority 1: Dedicated detail fetch (works for ALL funds, not just top 500)
      const detail = mfDetails[slug];
      if (detail?.historical_navs?.length) {
        const lastNav = detail.historical_navs[detail.historical_navs.length - 1];
        if (Array.isArray(lastNav) && lastNav.length >= 2 && lastNav[1] > 0) return lastNav[1];
      }
      if (detail?.nav && detail.nav > 0) return detail.nav;
      // Priority 2: Bulk list (allMFs, top 500 only)
      const mf = allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === slug);
      if (mf?.historical_navs?.length) {
        const lastNav = mf.historical_navs[mf.historical_navs.length - 1];
        if (Array.isArray(lastNav) && lastNav.length >= 2 && lastNav[1] > 0) return lastNav[1];
      }
      if (mf?.nav && mf.nav > 0) return mf.nav;
      // Priority 3: Derive from stored holding_value (never return hardcoded 100)
      const holding = mfHoldings.find(h => h.slug === slug);
      if (holding && holding.holding_value > 0 && holding.units > 0) {
        return holding.holding_value / holding.units;
      }
      return 0;
    }
  };

  const extractStockDayChange = (changeStr: string): { amount: number, pct: number } => {
    if (!changeStr) return { amount: 0, pct: 0 };
    const match = changeStr.match(/([+-]?[0-9.]+)\s*\(\s*([+-]?[0-9.]+)%\s*\)/);
    if (match) {
      return { amount: parseFloat(match[1]), pct: parseFloat(match[2]) };
    }
    return { amount: 0, pct: 0 };
  };

  const getMfDayChange = (slug: string): { amount: number, pct: number } => {
    const mf = mfDetails[slug] || allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === slug);
    if (mf && mf.historical_navs && mf.historical_navs.length > 1) {
      const latest = mf.historical_navs[mf.historical_navs.length - 1][1];
      const prev = mf.historical_navs[mf.historical_navs.length - 2][1];
      const amt = latest - prev;
      const pct = (amt / prev) * 100;
      return { amount: amt, pct: pct };
    }
    return { amount: 0, pct: 0 };
  };

  const filtered = useMemo(() => {
    if (query.length === 0) return [];
    const q = query.toLowerCase();

    if (activeTab === 'STOCKS') {
      if (!allStocks) return [];
      
      const results = allStocks
        .filter((s: any) => !stockHoldings.find(h => h.slug === s.slug))
        .map((s: any) => {
          let score = 0;
          const ticker = s.ticker ? s.ticker.toLowerCase() : '';
          const name = s.name ? s.name.toLowerCase() : '';
          
          if (ticker === q) score = 100;
          else if (name === q) score = 90;
          else if (ticker.startsWith(q)) score = 80;
          else if (name.startsWith(q)) score = 70;
          else if (ticker.includes(q)) score = 60;
          else if (name.includes(q)) score = 50;
          
          return { item: s, score };
        })
        .filter((res: any) => res.score > 0)
        .sort((a: any, b: any) => b.score - a.score);
        
      return results.slice(0, 50).map((res: any) => res.item);
    } else {
      if (!allMFs) return [];
      
      const results = allMFs
        .filter((m: any) => !mfHoldings.find(h => h.slug === (m.scheme_code || m.direct_search_id)))
        .map((m: any) => {
          let score = 0;
          const sname = m.scheme_name ? m.scheme_name.toLowerCase() : '';
          const fname = m.fund_name ? m.fund_name.toLowerCase() : '';
          
          if (sname === q || fname === q) score = 100;
          else if (sname.startsWith(q) || fname.startsWith(q)) score = 80;
          else if (sname.includes(q) || fname.includes(q)) score = 60;
          
          return { item: m, score };
        })
        .filter((res: any) => res.score > 0)
        .sort((a: any, b: any) => b.score - a.score);
        
      return results.slice(0, 50).map((res: any) => res.item);
    }
  }, [query, activeTab, allStocks, allMFs, stockHoldings, mfHoldings]);

  const addAsset = (slug: string, type: 'STOCKS' | 'MUTUAL_FUNDS') => {
    const holdVal = parseFloat(unitsInput);
    const inv = parseFloat(investedInput);
    if (!holdVal || isNaN(holdVal) || holdVal <= 0) return;
    if (!inv || isNaN(inv) || inv <= 0) return;
    
    if (type === 'STOCKS') {
      const price = getLivePrice(slug, 'STOCKS');
      const units = price > 0 ? holdVal / price : 0;
      setStockHoldings([...stockHoldings, { slug, type: 'STOCKS', units, invested_amount: inv, holding_value: holdVal }]);
    } else {
      const price = getLivePrice(slug, 'MUTUAL_FUNDS');
      const units = price > 0 ? holdVal / price : 0;
      setMfHoldings([...mfHoldings, { slug, type: 'MUTUAL_FUNDS', units, invested_amount: inv, holding_value: holdVal }]);
    }
    
    setQuery('');
    setSelectedAsset(null);
    setUnitsInput('');
    setInvestedInput('');
    setIsOpen(false);
  };

  const updateAsset = (slug: string, type: 'STOCKS' | 'MUTUAL_FUNDS') => {
    const newHoldVal = parseFloat(editHoldingVal);
    const newInvested = parseFloat(editInvestedVal);
    if (!newHoldVal || isNaN(newHoldVal) || newHoldVal <= 0) return;
    if (!newInvested || isNaN(newInvested) || newInvested <= 0) return;

    if (type === 'STOCKS') {
      const price = getLivePrice(slug, 'STOCKS');
      const units = price > 0 ? newHoldVal / price : 0;
      setStockHoldings(stockHoldings.map(h => h.slug === slug ? { ...h, units, invested_amount: newInvested, holding_value: newHoldVal } : h));
    } else {
      const price = getLivePrice(slug, 'MUTUAL_FUNDS');
      const units = price > 0 ? newHoldVal / price : 0;
      setMfHoldings(mfHoldings.map(h => h.slug === slug ? { ...h, units, invested_amount: newInvested, holding_value: newHoldVal } : h));
    }
    setEditingSlug(null);
    setEditHoldingVal('');
    setEditInvestedVal('');
  };

  const removeAsset = (slug: string, type: 'STOCKS' | 'MUTUAL_FUNDS') => {
    if (type === 'STOCKS') {
      setStockHoldings(stockHoldings.filter(h => h.slug !== slug));
    } else {
      setMfHoldings(mfHoldings.filter(h => h.slug !== slug));
    }
  };

  const stockTotalValue = stockHoldings.reduce((sum, h) => {
    return sum + (h.units * getLivePrice(h.slug, 'STOCKS'));
  }, 0);

  const mfTotalValue = mfHoldings.reduce((sum, h) => {
    return sum + (h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS'));
  }, 0);

  const totalValue = stockTotalValue + mfTotalValue;
  const totalAssets = stockHoldings.length + mfHoldings.length;

  const totalInvested = stockHoldings.reduce((sum, h) => sum + (h.invested_amount || 0), 0) + mfHoldings.reduce((sum, h) => sum + (h.invested_amount || 0), 0);
  const totalPnL = totalValue - totalInvested;
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  // We can keep the stock and MF separate PnLs based on invested_amount as well
  const stockInvested = stockHoldings.reduce((sum, h) => sum + (h.invested_amount || 0), 0);
  const totalStockPnL = stockTotalValue - stockInvested;
  const stockPnLPct = stockInvested > 0 ? (totalStockPnL / stockInvested) * 100 : 0;

  const mfInvested = mfHoldings.reduce((sum, h) => sum + (h.invested_amount || 0), 0);
  const totalMfPnL = mfTotalValue - mfInvested;
  const mfPnLPct = mfInvested > 0 ? (totalMfPnL / mfInvested) * 100 : 0;

  const stocksPie = useMemo(() => {
    return stockHoldings.map(h => {
      const stock = allStocks?.find((s: any) => s.slug === h.slug);
      return { name: stock?.ticker || h.slug, slug: h.slug, ticker: stock?.ticker, value: h.units * getLivePrice(h.slug, 'STOCKS') };
    }).sort((a, b) => b.value - a.value);
  }, [stockHoldings, allStocks]);

  const mfsPie = useMemo(() => {
    return mfHoldings.map(h => {
      const mf = mfDetails[h.slug] || allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
      const val = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
      const fundName = mf?.fund_name || h.slug;
      
      let finalLogoUrl = mf?.logo_url;
      if (!finalLogoUrl && fundName) {
        const firstWord = fundName.split(' ')[0].toLowerCase();
        if (firstWord === 'axis') finalLogoUrl = 'https://assets-netstorage.groww.in/mf-assets/logos/axis_groww.png';
        else if (firstWord === 'nippon' || firstWord === 'reliance') finalLogoUrl = 'https://assets-netstorage.groww.in/mf-assets/logos/reliance_groww.png';
      }

      return { name: fundName.substring(0, 15) + '...', slug: h.slug, ticker: h.slug, logoUrl: finalLogoUrl, value: val };
    }).sort((a, b) => b.value - a.value);
  }, [mfHoldings, allMFs, mfDetails, totalValue, liveQuotesMap]);

  const overallPie = [
    { name: 'Stocks', value: stockTotalValue, slug: 'stocks' },
    { name: 'Mutual Funds', value: mfTotalValue, slug: 'mfs' }
  ];
  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#64748b'];

  // ═══════════════════════════════════════════════════════════════════
  // ANALYTICS ENGINE: All computed data for charts and cards
  // ═══════════════════════════════════════════════════════════════════

  // CHART 1: Asset Allocation Data
  const allocationData = useMemo(() => {
    const sectors: Record<string, { value: number, assets: any[] }> = {};
    const marketCaps: Record<string, { value: number, assets: any[] }> = {};
    const assetTypes = { 'Direct Equity': 0, 'Mutual Funds': 0 };

    stockHoldings.forEach(h => {
      const stock = allStocks?.find((st: any) => st.slug === h.slug);
      const val = h.units * getLivePrice(h.slug, 'STOCKS');
      const name = (stock?.name || h.slug).substring(0, 20);
      
      let sector = stock?.industry || 'Unknown';
      let mc = stock?.marketCapType || 'Unknown';
      const isETF = /\betf\b/i.test(name) || /\betf\b/i.test(sector) || /\betf\b/i.test(h.slug);
      
      if (isETF) {
        sector = 'Index/ETF';
        mc = 'Index/ETF';
      }
      
      if (!sectors[sector]) sectors[sector] = { value: 0, assets: [] };
      if (!marketCaps[mc]) marketCaps[mc] = { value: 0, assets: [] };
      marketCaps[mc].value += val;
      marketCaps[mc].assets.push({ name, val });
      
      assetTypes['Direct Equity'] += val;
    });

    mfHoldings.forEach(h => {
      const mf = mfDetails[h.slug] || allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
      const val = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
      const name = (mf?.fund_name || h.slug).substring(0, 20);
      
      const cat = mf?.category || 'Fund';
      if (!sectors[cat]) sectors[cat] = { value: 0, assets: [] };
      sectors[cat].value += val;
      sectors[cat].assets.push({ name, val });
      
      const mc = 'Diversified (MF)';
      if (!marketCaps[mc]) marketCaps[mc] = { value: 0, assets: [] };
      marketCaps[mc].value += val;
      marketCaps[mc].assets.push({ name, val });
      
      assetTypes['Mutual Funds'] += val;
    });

    return { sectors, marketCaps, assetTypes };
  }, [stockHoldings, mfHoldings, allStocks, allMFs]);

  const ProgressBar = ({ label, value, max, color }: any) => {
    const perc = ((value / Math.max(max, 1)) * 100).toFixed(1);
    return (
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1.5">
          <span className="text-text-primary/90">{label}</span>
          <span className="text-text-secondary font-mono">{perc}%</span>
        </div>
        <div className="h-2 w-full bg-surface-hover rounded-full overflow-hidden">
          <div 
            className={`h-full ${color} rounded-full transition-all duration-1000`}
            style={{ width: `${perc}%` }}
          />
        </div>
      </div>
    );
  };

  // Helper to find closest date in OHLCV/NAV array
  const getReturnForPeriod = (dataArray: any[], startDate: string, endDate: string) => {
    if (!dataArray || dataArray.length === 0) return null;
    
    const startTs = new Date(startDate).getTime();
    const endTs = new Date(endDate).getTime();

    // Standardize data to { ts, price }
    const standardized = dataArray.map((d: any) => {
      let ts = 0;
      let price = 0;
      
      if (Array.isArray(d)) {
        if (d.length >= 2) {
          const dateVal = d[0];
          if (typeof dateVal === 'string') {
            if (dateVal.includes('-')) {
              const parts = dateVal.split('-');
              if (parts[0].length === 4) ts = new Date(dateVal).getTime();
              else ts = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
            } else {
              ts = new Date(dateVal).getTime();
            }
          } else if (typeof dateVal === 'number') {
            ts = dateVal;
          }
          price = d.length > 2 ? d[4] : parseFloat(d[1]);
        }
      } else if (typeof d === 'object') {
        const dateStr = d.Date || d.date || String(d.time || '');
        if (dateStr && dateStr.includes('-')) {
          const parts = dateStr.split('-');
          if (parts[0].length === 4) ts = new Date(dateStr).getTime();
          else ts = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
        } else if (d.time) {
           ts = new Date(d.time).getTime(); // fallback for timestamp
        }
        price = d.Close ?? d.close ?? d.nav ?? d.NAV ?? 0;
      }
      return { ts, price };
    }).filter((d: any) => !isNaN(d.ts) && d.price > 0).sort((a: any, b: any) => a.ts - b.ts);

    if (standardized.length === 0) return null;
    
    let startPrice = null;
    let actualStartTs = 0;
    for (let i = 0; i < standardized.length; i++) {
      if (standardized[i].ts >= startTs) {
        startPrice = standardized[i].price;
        actualStartTs = standardized[i].ts;
        break;
      }
    }
    
    let endPrice = null;
    let actualEndTs = 0;
    for (let i = standardized.length - 1; i >= 0; i--) {
      if (standardized[i].ts <= endTs) {
        endPrice = standardized[i].price;
        actualEndTs = standardized[i].ts;
        break;
      }
    }
    
    if (startPrice === null || endPrice === null || actualStartTs >= actualEndTs) return null;
    
    return (endPrice - startPrice) / startPrice;
  };

  // CHART 2: Macro Stress-Test Data (Empirical Historical Backtest)
  const stressTestData = useMemo(() => {
    if (!batchStockData && mfHoldings.length === 0) return [];

    const scenarios = [
      { 
        id: 'crude_spike', 
        event: 'Brent Crude Spike ($70 → $100)', 
        periods: [
          { start: '2021-12-01', end: '2022-02-28' }
        ]
      },
      { 
        id: 'crude_collapse', 
        event: 'Brent Crude Collapse ($100 → $70)', 
        periods: [
          { start: '2022-10-31', end: '2023-03-31' }
        ]
      },
      { 
        id: 'nifty_down', 
        event: 'Nifty -10% Correction', 
        periods: [
          { start: '2024-09-27', end: '2024-11-14' },
          { start: '2026-02-20', end: '2026-03-13' }
        ]
      },
      { 
        id: 'nifty_up', 
        event: 'Nifty +10% Rally', 
        periods: [
          { start: '2024-06-21', end: '2024-09-27' },
          { start: '2025-02-28', end: '2025-05-02' }
        ]
      }
    ];

    let niftyOhlcv: any[] = [];
    niftyOhlcv = (Object.values(batchStockData || {}) as any[]).find((d: any) => d.absolute?.benchmark_key === 'NIFTY')?.benchmark_ohlcv;
    if (!niftyOhlcv?.length) {
       niftyOhlcv = (Object.values(batchStockData || {}) as any[]).find((d: any) => d.benchmark_ohlcv)?.benchmark_ohlcv || [];
    }

    return scenarios.map(s => {
      let totalPortfolioReturn = 0;
      let totalBenchmarkReturn = 0;
      let validPeriodsCount = 0;
      
      // Store average empirical return for each asset across all valid periods for this scenario
      const assetAverages: Record<string, { returnSum: number, validCount: number, name: string, type: string, currentWeight: number }> = {};

      s.periods.forEach(period => {
        let periodPortfolioReturn = 0;
        let periodCoveredWeight = 0;
        
        // Calculate Stock Returns for this period
        stockHoldings.forEach(h => {
          const stock = allStocks?.find((st: any) => st.slug === h.slug);
          const detail = batchStockData?.[h.slug];
          if (!stock || !detail?.absolute?.OHLCV) return;
          
          const val = h.units * getLivePrice(h.slug, 'STOCKS');
          const weight = totalValue > 0 ? val / totalValue : 0;
          
          const empiricalReturn = getReturnForPeriod(detail.absolute.OHLCV, period.start, period.end);
          if (empiricalReturn !== null) {
            periodPortfolioReturn += empiricalReturn * weight;
            periodCoveredWeight += weight;
            
            const key = stock.slug;
            if (!assetAverages[key]) assetAverages[key] = { returnSum: 0, validCount: 0, name: stock.name || stock.ticker, type: 'stock', currentWeight: weight };
            assetAverages[key].returnSum += empiricalReturn;
            assetAverages[key].validCount += 1;
          }
        });

        // Calculate MF Returns for this period
        mfHoldings.forEach(h => {
          const mf = mfDetails[h.slug] || allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
          if (!mf?.historical_navs?.length) return;
          
          const val = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
          const weight = totalValue > 0 ? val / totalValue : 0;
          
          const empiricalReturn = getReturnForPeriod(mf.historical_navs, period.start, period.end);
          if (empiricalReturn !== null) {
            periodPortfolioReturn += empiricalReturn * weight;
            periodCoveredWeight += weight;
            
            const key = mf.scheme_code || mf.direct_search_id;
            if (!assetAverages[key]) assetAverages[key] = { returnSum: 0, validCount: 0, name: (mf.fund_name || mf.slug).substring(0,20), type: 'fund', currentWeight: weight };
            assetAverages[key].returnSum += empiricalReturn;
            assetAverages[key].validCount += 1;
          }
        });

        // If we found data for at least part of the portfolio, calculate normalized return
        if (periodCoveredWeight > 0) {
           const normalizedPeriodReturn = periodPortfolioReturn / periodCoveredWeight;
           totalPortfolioReturn += normalizedPeriodReturn;
           
           // Calculate benchmark return for this period
           const bmarkReturn = getReturnForPeriod(niftyOhlcv, period.start, period.end);
           if (bmarkReturn !== null) totalBenchmarkReturn += bmarkReturn;
           
           validPeriodsCount++;
        }
      });

      const avgScenarioReturn = validPeriodsCount > 0 ? (totalPortfolioReturn / validPeriodsCount) * 100 : 0;
      const avgBenchmarkReturn = validPeriodsCount > 0 ? (totalBenchmarkReturn / validPeriodsCount) * 100 : 0;

      // Compile top contributing assets (positive or negative) based on their average empirical return
      const breakdowns = Object.values(assetAverages)
        .filter(a => a.validCount > 0)
        .map(a => ({
           name: a.name,
           type: a.type,
           impact: ((a.returnSum / a.validCount) * 100).toFixed(2),
           mathStr: `Historical Return: ${((a.returnSum / a.validCount) * 100).toFixed(2)}% | Portfolio Weight: ${(a.currentWeight * 100).toFixed(1)}%`
        }))
        .sort((a, b) => Math.abs(parseFloat(b.impact)) - Math.abs(parseFloat(a.impact)))
        .slice(0, 5);

      return {
        event: s.event,
        combined: parseFloat(avgScenarioReturn.toFixed(1)),
        benchmark: parseFloat(avgBenchmarkReturn.toFixed(1)),
        breakdowns: breakdowns
      };
    });
  }, [stockHoldings, mfHoldings, allStocks, allMFs, totalValue, batchStockData]);

  // CHART 3: Historical Performance Matrix
  const performanceData = useMemo(() => {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    
    const oneMonthAgo = new Date(today); oneMonthAgo.setMonth(today.getMonth() - 1);
    const sixMonthsAgo = new Date(today); sixMonthsAgo.setMonth(today.getMonth() - 6);
    const oneYearAgo = new Date(today); oneYearAgo.setFullYear(today.getFullYear() - 1);
    const todayStr = formatDate(today);
    
    const data: any[] = [];
    
    stockHoldings.forEach(h => {
      const stock = allStocks?.find((st: any) => st.slug === h.slug);
      const detail = batchStockData?.[h.slug];
      const ohlcv = detail?.absolute?.OHLCV;
      
      if (stock && ohlcv) {
        data.push({
          name: stock.ticker || h.slug,
          type: 'stock',
          value: h.units * getLivePrice(h.slug, 'STOCKS'),
          ret1m: getReturnForPeriod(ohlcv, formatDate(oneMonthAgo), todayStr),
          ret6m: getReturnForPeriod(ohlcv, formatDate(sixMonthsAgo), todayStr),
          ret1y: getReturnForPeriod(ohlcv, formatDate(oneYearAgo), todayStr),
        });
      }
    });

    mfHoldings.forEach(h => {
      const mf = mfDetails[h.slug] || allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
      const detail = mfDetails[h.slug];
      if (mf && detail?.historical_navs) {
        data.push({
          name: (mf.fund_name || h.slug).substring(0, 20),
          type: 'fund',
          value: h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS'),
          ret1m: getReturnForPeriod(detail.historical_navs, formatDate(oneMonthAgo), todayStr),
          ret6m: getReturnForPeriod(detail.historical_navs, formatDate(sixMonthsAgo), todayStr),
          ret1y: getReturnForPeriod(detail.historical_navs, formatDate(oneYearAgo), todayStr),
        });
      }
    });
    
    return data.sort((a, b) => b.value - a.value);
  }, [stockHoldings, mfHoldings, allStocks, allMFs, batchStockData]);


  const returnsData = useMemo(() => {
    const dateReturns: Record<string, number> = {};
    const benchmarkReturns: Record<string, number> = {};
    let benchmarkOhlcv: any[] = [];

    const parseDateKey = (val: any) => {
      if (typeof val === 'number' || /^\d+$/.test(String(val))) {
        const d = new Date(parseInt(val as string));
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      } else if (typeof val === 'string' && val.includes('-')) {
        const parts = val.split('-');
        if (parts[0].length === 2 && parts[2]?.length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
        return val;
      }
      return String(val);
    };

    stockHoldings.forEach(h => {
      const detail = batchStockData?.[h.slug];
      if (!detail?.absolute?.OHLCV) return;
      const ohlcv = detail.absolute.OHLCV;
      if (!benchmarkOhlcv.length && detail.benchmark_ohlcv) benchmarkOhlcv = detail.benchmark_ohlcv;
      const val = h.units * getLivePrice(h.slug, 'STOCKS');
      const weight = totalValue > 0 ? val / totalValue : 0;
      for (let i = 1; i < ohlcv.length; i++) {
        const dateRaw = ohlcv[i].Date !== undefined ? ohlcv[i].Date : ohlcv[i][0];
        const close = ohlcv[i].Close !== undefined ? ohlcv[i].Close : ohlcv[i][4];
        const prevClose = ohlcv[i - 1].Close !== undefined ? ohlcv[i - 1].Close : ohlcv[i - 1][4];
        if (close == null || prevClose == null) continue;
        const date = parseDateKey(dateRaw);
        const ret = (close - prevClose) / prevClose;
        dateReturns[date] = (dateReturns[date] || 0) + ret * weight;
      }
    });

    mfHoldings.forEach(h => {
      const detail = mfDetails[h.slug];
      if (!detail?.historical_navs?.length) return;
      const navs = detail.historical_navs;
      const val = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
      const weight = totalValue > 0 ? val / totalValue : 0;
      for (let i = 1; i < navs.length; i++) {
        const date = parseDateKey(navs[i][0]);
        const ret = (navs[i][1] - navs[i - 1][1]) / navs[i - 1][1];
        dateReturns[date] = (dateReturns[date] || 0) + ret * weight;
      }
    });

    if (!benchmarkOhlcv.length) {
      benchmarkOhlcv = (Object.values(batchStockData || {}) as any[]).find((d: any) => d.absolute?.benchmark_key === 'NIFTY')?.benchmark_ohlcv || [];
      if (!benchmarkOhlcv.length) {
        benchmarkOhlcv = (Object.values(batchStockData || {}) as any[]).find((d: any) => d.benchmark_ohlcv)?.benchmark_ohlcv || [];
      }
    }

    const niftyMap: Record<string, number> = {};
    for (let i = 0; i < benchmarkOhlcv.length; i++) {
      const dateRaw = benchmarkOhlcv[i].Date !== undefined ? benchmarkOhlcv[i].Date : benchmarkOhlcv[i][0];
      const close = benchmarkOhlcv[i].Close !== undefined ? benchmarkOhlcv[i].Close : benchmarkOhlcv[i][4];
      if (close != null) {
        niftyMap[parseDateKey(dateRaw)] = close;
      }
      if (i > 0) {
        const prevClose = benchmarkOhlcv[i - 1].Close !== undefined ? benchmarkOhlcv[i - 1].Close : benchmarkOhlcv[i - 1][4];
        if (prevClose != null && close != null) {
          const ret = (close - prevClose) / prevClose;
          benchmarkReturns[parseDateKey(dateRaw)] = ret;
        }
      }
    }

    return { dateReturns, benchmarkReturns, benchmarkOhlcv, niftyMap };
  }, [batchStockData, stockHoldings, mfHoldings, allMFs, totalValue, liveQuotesMap]);

  // CHART 4: Drawdown Data
  const drawdownData = useMemo(() => {
    if (!batchStockData && mfHoldings.length === 0) return [];
    const { dateReturns, benchmarkReturns } = returnsData;
    const dates = Object.keys(dateReturns).filter(d => d !== 'undefined' && d !== 'NaN' && d !== 'null').sort();
    
    let portfolioPeak = 100;
    let portfolioCumValue = 100;
    let benchmarkPeak = 100;
    let benchmarkCumValue = 100;

    return dates.slice(-252).map(d => {
      portfolioCumValue *= (1 + (dateReturns[d] || 0));
      portfolioPeak = Math.max(portfolioPeak, portfolioCumValue);
      const portfolioDD = ((portfolioCumValue - portfolioPeak) / portfolioPeak) * 100;

      benchmarkCumValue *= (1 + (benchmarkReturns[d] || 0));
      benchmarkPeak = Math.max(benchmarkPeak, benchmarkCumValue);
      const benchmarkDD = ((benchmarkCumValue - benchmarkPeak) / benchmarkPeak) * 100;

      return {
        date: d,
        portfolio: parseFloat(portfolioDD.toFixed(2)),
        benchmark: parseFloat(benchmarkDD.toFixed(2)),
      };
    });
  }, [returnsData]);

  // ═══ CHART: Foundational Growth ═══
  const growthData = useMemo(() => {
    const { dateReturns, benchmarkReturns, niftyMap } = returnsData;
    
    const today = new Date().toISOString().split('T')[0];
    const liveInvested = stockHoldings.reduce((sum, h) => sum + (h.invested_amount || 0), 0) + mfHoldings.reduce((sum, h) => sum + (h.invested_amount || 0), 0);
    const liveValue = totalValue;

    const data = [];
    let shadowNiftyUnits = 0;
    let lastInvested = 0;
    
    const availableNiftyDates = Object.keys(niftyMap).sort();
    let lastNiftyPrice = availableNiftyDates.length > 0 ? niftyMap[availableNiftyDates[availableNiftyDates.length - 1]] : 25000;

    for (let i = 0; i < portfolioHistory.length; i++) {
      const point = portfolioHistory[i];
      if (i === 0 && availableNiftyDates.length > 0) {
         lastNiftyPrice = niftyMap[point.date] || niftyMap[availableNiftyDates.find(d => d >= point.date) || availableNiftyDates[0]] || 25000;
      }
      const currentNifty = niftyMap[point.date] || lastNiftyPrice;
      
      const cashAdded = point.invested - lastInvested;
      if (i === 0) {
         // Fix Nifty Shadow on day 1
         shadowNiftyUnits = cashAdded / currentNifty;
      } else if (cashAdded !== 0) {
         shadowNiftyUnits += cashAdded / currentNifty;
      }
      
      data.push({
        date: point.date,
        portfolio: parseFloat(point.value.toFixed(2)),
        invested: parseFloat(point.invested.toFixed(2)),
        benchmark: parseFloat((shadowNiftyUnits * currentNifty).toFixed(2)),
        isProjected: false
      });
      
      lastInvested = point.invested;
      lastNiftyPrice = currentNifty;
    }
    
    // LIVE STITCHING
    if (data.length > 0) {
      const lastPoint = data[data.length - 1];
      if (lastPoint.date < today) {
        const currentNifty = niftyMap[today] || lastNiftyPrice;
        const cashAdded = liveInvested - lastPoint.invested;
        let newShadowUnits = shadowNiftyUnits;
        if (cashAdded !== 0) newShadowUnits += cashAdded / currentNifty;
        data.push({
          date: today,
          portfolio: parseFloat(liveValue.toFixed(2)),
          invested: parseFloat(liveInvested.toFixed(2)),
          benchmark: parseFloat((newShadowUnits * currentNifty).toFixed(2)),
          isProjected: false
        });
      } else if (lastPoint.date === today) {
        lastPoint.portfolio = parseFloat(liveValue.toFixed(2));
        const currentNifty = niftyMap[today] || lastNiftyPrice;
        const snapInvested = portfolioHistory.length > 0 ? portfolioHistory[portfolioHistory.length - 1].invested : 0;
        const cashAddedToday = liveInvested - snapInvested;
        let newShadowUnits = shadowNiftyUnits;
        if (cashAddedToday !== 0) {
            newShadowUnits += cashAddedToday / currentNifty;
        }
        lastPoint.invested = parseFloat(liveInvested.toFixed(2));
        lastPoint.benchmark = parseFloat((newShadowUnits * currentNifty).toFixed(2));
      }
    } else if (liveInvested > 0) {
      const currentNifty = niftyMap[today] || lastNiftyPrice;
      data.push({
        date: today,
        portfolio: parseFloat(liveValue.toFixed(2)),
        invested: parseFloat(liveInvested.toFixed(2)),
        benchmark: parseFloat(liveInvested.toFixed(2)),
        isProjected: false
      });
    }

    // PROJECTED PAST (Hybrid Chart)
    const firstActual = data[0];
    const inceptionDate = firstActual ? firstActual.date : today;
    const inceptionPortfolio = firstActual ? firstActual.portfolio : liveValue;
    const inceptionInvested = firstActual ? firstActual.invested : liveInvested;
    
    // Pass to outer scope for ReferenceArea
    // Since we can't directly set state during render, we rely on the component using inceptionDate later, or we can just memoize the entire inceptionDate string. We'll use a hack to pass it out, or calculate it inline later. We'll just add a field to the data items!
    
    const allDates = Object.keys(dateReturns).sort();
    const pastDates = allDates.filter(d => d <= inceptionDate).slice(-252);
    
    let projectedData: any[] = [];
    if (pastDates.length > 1) {
      let pCum = 1;
      let nCum = 1;
      const fwd = pastDates.map(d => {
        pCum *= (1 + (dateReturns[d] || 0));
        nCum *= (1 + (benchmarkReturns[d] || 0));
        return { date: d, pCum, nCum };
      });
      
      const lastFwd = fwd[fwd.length - 1];
      const pScale = inceptionPortfolio / lastFwd.pCum;
      const nScale = inceptionInvested / lastFwd.nCum;
      
      projectedData = fwd.slice(0, -1).map(pt => ({
        date: pt.date,
        portfolio: parseFloat((pt.pCum * pScale).toFixed(2)),
        invested: parseFloat(inceptionInvested.toFixed(2)),
        benchmark: parseFloat((pt.nCum * nScale).toFixed(2)),
        isProjected: true
      }));
    }
    
    return [...projectedData, ...data];
  }, [portfolioHistory, returnsData, stockHoldings, mfHoldings, totalValue]);

  // ═══ CARD 1: True Concentration X-Ray ═══
  const concentrationData = useMemo(() => {
    // Map: slug -> { name, ticker, directPct, mfPct }
    const exposureMap: Record<string, { name: string, ticker: string, directPct: number, mfPct: number, mfSources: { name: string, pct: number }[] }> = {};

    // 1. Direct stock holdings
    stockHoldings.forEach(h => {
      const stock = allStocks?.find((s: any) => s.slug === h.slug);
      if (!stock) return;
      const val = h.units * getLivePrice(h.slug, 'STOCKS');
      const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
      
      if (!exposureMap[h.slug]) {
        exposureMap[h.slug] = { name: stock.name, ticker: stock.ticker, directPct: 0, mfPct: 0, mfSources: [] };
      }
      exposureMap[h.slug].directPct += pct;
    });

    // 2. MF look-through holdings
    mfHoldings.forEach(h => {
      const mf = mfDetailsRaw?.[h.slug] || allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
      const detail = mfDetails[h.slug];
      if (!detail?.detailed_holdings) return;
      
      const holdings = typeof detail.detailed_holdings === 'string' 
        ? JSON.parse(detail.detailed_holdings) 
        : detail.detailed_holdings;
        
      if (!Array.isArray(holdings)) return;
      
      const mfVal = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
      const mfWeight = totalValue > 0 ? mfVal / totalValue : 0;
      
      holdings.forEach((holding: any) => {
        if (!holding.company_name || holding.nature_name === 'CASH') return;
        
        // Use stock_search_id if available, fallback to raw company_name
        const slug = holding.stock_search_id || holding.company_name;
        const corpusPct = parseFloat(holding.corpus_per) || 0;
        
        if (!exposureMap[slug]) {
          const stock = allStocks?.find((s: any) => s.slug === slug);
          exposureMap[slug] = { 
            name: stock?.name || holding.company_name, 
            ticker: stock?.ticker || '', 
            directPct: 0, 
            mfPct: 0,
            mfSources: []
          };
        }
        const pctContrib = corpusPct * mfWeight;
        exposureMap[slug].mfPct += pctContrib;
        
        const fundName = mf?.scheme_name || detail.scheme_name || h.slug;
        const existingSource = exposureMap[slug].mfSources.find(s => s.name === fundName);
        if (existingSource) {
          existingSource.pct += pctContrib;
        } else {
          exposureMap[slug].mfSources.push({ name: fundName, pct: pctContrib });
        }
      });
    });

    return Object.entries(exposureMap)
      .map(([_, data]) => {
        const displayName = data.ticker || data.name;
        return {
          name: displayName.length > 25 ? displayName.substring(0, 25) + '…' : displayName,
          ticker: data.ticker,
          directPct: parseFloat(data.directPct.toFixed(2)),
          mfPct: parseFloat(data.mfPct.toFixed(2)),
          totalPct: parseFloat((data.directPct + data.mfPct).toFixed(2)),
          hasOverlap: data.directPct > 0 && data.mfPct > 0,
          mfSources: data.mfSources.map(s => ({ ...s, pct: parseFloat(s.pct.toFixed(2)) })).sort((a, b) => b.pct - a.pct)
        };
      })
      .sort((a, b) => b.totalPct - a.totalPct);
  }, [stockHoldings, mfHoldings, allStocks, mfDetails, totalValue]);

  // ═══ CARD 2: Defense Engine (VaR, Beta, Up/Down Capture) ═══
  const defenseMetrics = useMemo(() => {
    // Weighted portfolio beta
    let weightedBeta = 0;
    let betaCoveredWeight = 0;
    
    // Weighted capture ratios
    let upCapture = 0, downCapture = 0, captureCnt = 0;
    let captureCoveredWeight = 0;

    stockHoldings.forEach(h => {
      const stock = allStocks?.find((s: any) => s.slug === h.slug);
      if (!stock) return;
      const val = h.units * getLivePrice(h.slug, 'STOCKS');
      const weight = totalValue > 0 ? val / totalValue : 0;
      
      // Strict mathematical true Beta (calculated dynamically on the backend via covariance against Nifty points)
      const detail = batchStockData?.[h.slug];
      const trueBeta = detail?.absolute?.beta;
      
      if (trueBeta !== undefined && trueBeta !== null) {
        weightedBeta += trueBeta * weight;
        betaCoveredWeight += weight;
      } else {
        console.log(`Beta missing for ${h.slug}: detail=`, detail);
      }
      
      // Add stock weights to capture ratios (defaulting to 100%)
      upCapture += 100 * weight;
      downCapture += 100 * weight;
      captureCoveredWeight += weight;
      captureCnt++;
    });
    mfHoldings.forEach(h => {
      const mf = mfDetails[h.slug] || allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
      if (!mf) return;
      const val = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
      const weight = totalValue > 0 ? val / totalValue : 0;
      let beta: number | null = null;
      const detail = mfDetails[h.slug];
      if (detail?.advanced_stats) {
        const stats = typeof detail.advanced_stats === 'string' ? JSON.parse(detail.advanced_stats) : detail.advanced_stats;
        const betaStat = stats?.find?.((s: any) => s.type?.toLowerCase()?.includes('beta'));
        if (betaStat?.stat_1y) beta = parseFloat(betaStat.stat_1y);
      }
      if (mf.category?.toLowerCase()?.includes('debt') || mf.category?.toLowerCase()?.includes('liquid')) beta = 0.2;
      
      if (beta !== null) {
        weightedBeta += beta * weight;
        betaCoveredWeight += weight;
      }

      // Capture ratios from capture_ratios.parquet
      const cr = captureRatiosData?.find?.((c: any) => c.search_id === (mf.search_id || mf.scheme_code || mf.direct_search_id));
      if (cr) {
        upCapture += (cr.up_1Y || 100) * weight;
        downCapture += (cr.down_1Y || 100) * weight;
        captureCoveredWeight += weight;
        captureCnt++;
      }
    });

    const portfolioBeta = betaCoveredWeight > 0 ? weightedBeta / betaCoveredWeight : null;

    // 95% Weekly VaR (parametric) = Portfolio Value × Beta × Weekly Market Sigma × Z(95%)
    // Using Nifty historical weekly sigma ≈ 2.5%, Z(95%) = 1.645
    const weeklyVaR = portfolioBeta !== null ? totalValue * portfolioBeta * 0.025 * 1.645 : null;

    let defensiveRating = 'Unknown';
    if (portfolioBeta !== null) {
      if (portfolioBeta < 0.8) defensiveRating = 'Strong';
      else if (portfolioBeta <= 1.1) defensiveRating = 'Moderate';
      else defensiveRating = 'Aggressive';
    }

    return {
      beta: portfolioBeta !== null ? parseFloat(portfolioBeta.toFixed(2)) : 'N/A',
      var95: weeklyVaR !== null ? Math.round(weeklyVaR) : 'N/A',
      upCapture: captureCnt > 0 && captureCoveredWeight > 0 ? parseFloat((upCapture / captureCoveredWeight).toFixed(0)) : null,
      downCapture: captureCnt > 0 && captureCoveredWeight > 0 ? parseFloat((downCapture / captureCoveredWeight).toFixed(0)) : null,
      defensiveRating,
    };
  }, [stockHoldings, mfHoldings, allStocks, allMFs, mfDetails, captureRatiosData, totalValue, batchStockData]);

  // ═══ CARD 3: Yield & Valuation Profiler ═══
  const yieldValuation = useMemo(() => {
    let weightedPE = 0;
    let weightedDivYield = 0;
    let peCoveredWeight = 0;
    let yieldCoveredWeight = 0;
    let sectorPeSum = 0;
    let sectorPeCount = 0;

    stockHoldings.forEach(h => {
      const stock = allStocks?.find((s: any) => s.slug === h.slug);
      if (!stock) return;
      const val = h.units * getLivePrice(h.slug, 'STOCKS');
      const weight = totalValue > 0 ? val / totalValue : 0;

      if (stock.peRatio && stock.peRatio > 0) {
        weightedPE += stock.peRatio * weight;
        peCoveredWeight += weight;
      }

      // Get divYield from batch detailed data if available
      const detail = batchStockData?.[h.slug];
      const divYield = detail?.absolute?.dividendYieldInPercent || detail?.absolute?.divYield;
      if (divYield && parseFloat(divYield) > 0) {
        weightedDivYield += parseFloat(divYield) * weight;
        yieldCoveredWeight += weight;
      }
    });

    // Value-Weighted Sector Avg P/E
    let weightedSectorPE = 0;
    let sectorPeCoveredWeight = 0;
    stockHoldings.forEach(h => {
      const detail = batchStockData?.[h.slug];
      const sectorPe = detail?.absolute?.sectorPe || detail?.absolute?.industryPe;
      const val = h.units * getLivePrice(h.slug, 'STOCKS');
      const weight = totalValue > 0 ? val / totalValue : 0;
      
      if (sectorPe && parseFloat(sectorPe) > 0) {
        weightedSectorPE += parseFloat(sectorPe) * weight;
        sectorPeCoveredWeight += weight;
      }
    });

    const aggPE = peCoveredWeight > 0 ? weightedPE / peCoveredWeight : 0;
    const benchmarkPE = sectorPeCoveredWeight > 0 ? weightedSectorPE / sectorPeCoveredWeight : 22.5; // fallback
    const pePremium = benchmarkPE > 0 ? ((aggPE - benchmarkPE) / benchmarkPE) * 100 : 0;
    const aggYield = yieldCoveredWeight > 0 ? weightedDivYield / yieldCoveredWeight : 0;
    const projectedAnnualYield = totalValue * (aggYield / 100);

    return {
      aggPE: parseFloat(aggPE.toFixed(1)),
      benchmarkPE: parseFloat(benchmarkPE.toFixed(1)),
      pePremium: parseFloat(pePremium.toFixed(1)),
      aggYield: parseFloat(aggYield.toFixed(2)),
      projectedYield: parseFloat(projectedAnnualYield.toFixed(0)),
    };
  }, [stockHoldings, allStocks, batchStockData, totalValue]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#1e222d] border border-[#2a2e39] p-2 rounded-lg flex items-center gap-3">
          {data.slug !== 'stocks' && data.slug !== 'mfs' && (
            data.logoUrl
              ? <img src={data.logoUrl} alt={data.name} className="w-6 h-6 rounded-full bg-white object-contain border border-border" />
              : <StockLogo ticker={data.ticker || data.slug} name={data.name} className="w-6 h-6 rounded-full" />
          )}
          <div className="flex flex-col">
            <span className="text-white font-bold text-xs">{data.name}</span>
            <span className="text-text-secondary text-[10px]">₹{Number(data.value).toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const getAPIHoldingsPayload = () => {
    return {
      stockHoldings: stockHoldings.map(h => ({ slug: h.slug, amount: h.units * getLivePrice(h.slug, 'STOCKS') })),
      mfHoldings: mfHoldings.map(h => ({ slug: h.slug, amount: h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS') }))
    };
  };

  const handleAnalyze = async () => {
    if (totalAssets === 0) return;
    setIsAnalyzing(true);
    setAiError(null);
    try {
      const payload = getAPIHoldingsPayload();
      const result = await fetchPortfolioAIAnalysis({
        stockHoldings: payload.stockHoldings,
        mfHoldings: payload.mfHoldings,
        stockRisk: stockRiskTolerance,
        mfRisk: mfRiskTolerance,
        holdingPeriod
      });
      setAiAnalysis(result);
      if (result._is_fallback) {
        setAiError("Oops, looks like the AI Agent is experiencing high demand currently. Please try again in a while :(");
      }
    } catch (err) {
      console.error("AI Analysis failed", err);
      setAiError("Oops, looks like the AI Agent is experiencing high demand currently. Please try again in a while :(");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || totalAssets === 0) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    const newHistory = [...chatHistory, { role: 'user', content: userMsg }];
    setChatHistory(newHistory);
    setIsChatting(true);
    try {
      const payload = getAPIHoldingsPayload();
      const res = await sendPortfolioChat({
        stockHoldings: payload.stockHoldings,
        mfHoldings: payload.mfHoldings,
        stockRisk: stockRiskTolerance,
        mfRisk: mfRiskTolerance,
        holdingPeriod,
        message: userMsg,
        history: chatHistory
      });
      setChatHistory([...newHistory, { role: 'assistant', content: res.response }]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsChatting(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isChatting, isAiModalOpen]);

  const getActionColor = (action: string) => {
    switch(action.toUpperCase()) {
      case 'ACCUMULATE': return 'bg-alpha/10 text-alpha border-alpha/30';
      case 'TRIM': return 'bg-beta/10 text-beta border-beta/30';
      case 'LIQUIDATE': return 'bg-beta/20 text-beta border-beta/50';
      default: return 'bg-surface-hover text-text-secondary border-border';
    }
  };

  const currentHoldings = activeTab === 'STOCKS' ? stockHoldings : mfHoldings;

  return (
    <div className={`${isPanel ? 'p-2 flex flex-col h-full gap-4' : 'p-6 w-full flex flex-col h-full gap-6'}`}>
      {!isPanel && (
        <div className="flex justify-between items-center z-10 relative">
          <div>
            <h2 className="text-3xl font-bold text-text-primary">Portfolio Analyzer</h2>
            <p className="text-text-secondary mt-1">Dual-approach financial data aggregation powered by live prices & NAVs.</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="px-4 py-2 bg-canvas hover:bg-surface-hover border border-border rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
              Sync
            </button>
            <button 
              onClick={() => setIsAiModalOpen(true)}
              className="px-6 py-2.5 bg-indigo-500 text-white font-bold rounded-lg hover:bg-indigo-600 transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
            >
              <BrainCircuit size={18} />
              CIO AI Analysis
            </button>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-3 ${isPanel ? 'gap-4 h-full' : 'gap-6 flex-1'} min-h-0`}>
        {/* Left: Allocations Window (1/3rd width) */}
        <div className={`lg:col-span-1 bg-surface rounded-lg border border-border flex flex-col min-h-0 ${isPanel ? 'p-4 gap-4' : 'p-4 gap-4'} overflow-y-auto hide-scrollbar`}>
          
          <div className="flex bg-canvas border border-border rounded-lg p-1">
            <button 
              onClick={() => setActiveTab('STOCKS')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === 'STOCKS' ? 'bg-surface border border-border text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Stocks
            </button>
            <button 
              onClick={() => setActiveTab('MUTUAL_FUNDS')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === 'MUTUAL_FUNDS' ? 'bg-surface border border-border text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Funds
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative">
              <label className="block text-[10px] text-text-secondary font-bold uppercase mb-1 tracking-widest">Search</label>
              <GlobalSearch 
                className="w-full"
                fixedFilter={activeTab === 'STOCKS' ? 'Stocks' : 'Mutual Funds'}
                value={selectedAsset ? selectedAsset.title : query}
                onChange={(val) => {
                  if (!val) setSelectedAsset(null);
                  setQuery(val);
                }}
                onSelect={(res) => {
                  setSelectedAsset(res);
                  setQuery(res.title);
                }}
              />
            </div>
            
            <div className="flex gap-2 items-end">
              <div className="flex-1 flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-text-secondary font-bold uppercase mb-1 tracking-widest">HOLDING VALUE (₹)</label>
                  <input 
                    type="number"
                    value={unitsInput}
                    onChange={e => setUnitsInput(e.target.value)}
                    placeholder="e.g. 15000"
                    className="w-full px-3 py-1.5 text-sm bg-canvas border border-border rounded-md text-text-primary focus:outline-none focus:border-alpha"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-text-secondary font-bold uppercase mb-1 tracking-widest">TOTAL INVESTED (₹)</label>
                  <input 
                    type="number"
                    value={investedInput}
                    onChange={e => setInvestedInput(e.target.value)}
                    placeholder="e.g. 14000"
                    className="w-full px-3 py-1.5 text-sm bg-canvas border border-border rounded-md text-text-primary focus:outline-none focus:border-alpha"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (selectedAsset) {
                          const type = selectedAsset.type === 'Mutual Fund' ? 'MUTUAL_FUNDS' : 'STOCKS';
                          addAsset(selectedAsset.slug, type);
                        }
                      }
                    }}
                  />
                </div>
              </div>
              <button 
                onClick={() => {
                  if (selectedAsset) {
                    const type = selectedAsset.type === 'Mutual Fund' ? 'MUTUAL_FUNDS' : 'STOCKS';
                    addAsset(selectedAsset.slug, type);
                  }
                }}
                className="px-4 py-1.5 h-[34px] bg-surface-hover border border-border rounded-md font-bold hover:bg-border transition-colors text-xs"
              >
                Add
              </button>
            </div>
          </div>

          <div className="h-px bg-border w-full my-0"></div>

          {totalAssets > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="flex bg-canvas p-3 rounded-lg border border-border justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-surface rounded-full blur-2xl -translate-y-8 translate-x-8"></div>
                <div className="flex flex-col gap-1 z-10">
                  <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">Total Valuation</span>
                  <span className="text-xl font-bold text-text-primary tabular-nums">₹{totalValue.toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
                  <div className={`flex items-center gap-1 text-xs font-bold ${totalPnL >= 0 ? 'text-alpha' : 'text-beta'}`}>
                    {totalPnL >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    ₹{Math.abs(totalPnL).toLocaleString(undefined, {maximumFractionDigits: 0})} ({totalPnLPct.toFixed(2)}%)
                  </div>
                </div>
                <div className="flex flex-col gap-3 z-10 ml-auto">
                  <div className="flex items-center justify-end gap-3">
                    <span className="text-xs font-bold text-text-primary/70">Stocks</span>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-sm font-bold text-text-primary tabular-nums">₹{stockTotalValue.toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
                      <div className={`flex items-center gap-1 text-[10px] font-bold ${totalStockPnL >= 0 ? 'text-alpha' : 'text-beta'}`}>
                        {totalStockPnL >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        ₹{Math.abs(totalStockPnL).toLocaleString(undefined, {maximumFractionDigits: 0})} ({stockPnLPct.toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <span className="text-xs font-bold text-text-primary/70">Funds</span>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-sm font-bold text-text-primary tabular-nums">₹{mfTotalValue.toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
                      <div className={`flex items-center gap-1 text-[10px] font-bold ${totalMfPnL >= 0 ? 'text-alpha' : 'text-beta'}`}>
                        {totalMfPnL >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        ₹{Math.abs(totalMfPnL).toLocaleString(undefined, {maximumFractionDigits: 0})} ({mfPnLPct.toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="w-full bg-canvas rounded-lg border border-border p-2 flex flex-col pb-4">
                <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest mb-2 flex items-center gap-1">
                  <PieChartIcon size={12} /> Allocations
                </span>
                
                <div className="grid grid-cols-3 gap-2 h-[130px] relative pb-2">
                  {/* Overall Pie */}
                  <div className="flex-1 flex flex-col items-center justify-center relative">
                    <span className="absolute top-0 text-[9px] text-text-secondary font-bold tracking-widest">OVERALL</span>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={overallPie} innerRadius={22} outerRadius={32} paddingAngle={2} dataKey="value" stroke="none">
                          <Cell fill="#8b5cf6" />
                          <Cell fill="#06b6d4" />
                        </Pie>
                        <RechartsTooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute -bottom-1 flex gap-2 text-[8px] font-bold uppercase tracking-widest whitespace-nowrap">
                       <span className="text-[#8b5cf6]">Stocks: {totalValue > 0 ? ((stockTotalValue/totalValue)*100).toFixed(0) : 0}%</span>
                       <span className="text-[#06b6d4]">Funds: {totalValue > 0 ? ((mfTotalValue/totalValue)*100).toFixed(0) : 0}%</span>
                    </div>
                  </div>
                  {/* Stocks Pie */}
                  <div className="flex-1 flex flex-col items-center justify-center relative border-l border-border/50">
                    <span className="absolute top-0 text-[9px] text-[#8b5cf6] font-bold tracking-widest">STOCKS</span>
                    {stockHoldings.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={stocksPie} innerRadius={22} outerRadius={32} paddingAngle={2} dataKey="value" stroke="none">
                            {stocksPie.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <span className="text-[9px] text-text-secondary/50 m-auto">N/A</span>}
                    <span className="absolute -bottom-1 text-[8px] text-text-secondary font-bold uppercase tracking-widest">{stockHoldings.length} Stocks</span>
                  </div>
                  {/* MFs Pie */}
                  <div className="flex-1 flex flex-col items-center justify-center relative border-l border-border/50">
                    <span className="absolute top-0 text-[9px] text-[#06b6d4] font-bold tracking-widest">FUNDS</span>
                    {mfHoldings.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={mfHoldings.map(h => ({
                            name: (allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug)?.fund_name || h.slug).substring(0, 15) + '...',
                            value: h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS')
                          }))} innerRadius={22} outerRadius={32} paddingAngle={2} dataKey="value" stroke="none">
                            {mfHoldings.map((_e, i) => <Cell key={i} fill={COLORS[(i+2) % COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <span className="text-[9px] text-text-secondary/50 m-auto">N/A</span>}
                    <span className="absolute -bottom-1 text-[8px] text-text-secondary font-bold uppercase tracking-widest">{mfHoldings.length} Funds</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest mt-1">
                  {activeTab === 'STOCKS' 
                    ? `${activeTab} LIST (${stockHoldings.length})` 
                    : `MUTUAL FUNDS LIST (${mfHoldings.length})`}
                </span>
                {currentHoldings.length === 0 && (
                  <div className="text-xs text-text-secondary text-center py-2">No {activeTab.toLowerCase()} added.</div>
                )}
                {currentHoldings.map((h) => {
                  let title = h.slug;
                  let tickerForLogo = h.slug;
                  let logoUrlForMF = undefined;
                  let dayAmt = 0;
                  let dayPct = 0;

                  if (activeTab === 'STOCKS') {
                    const stock = allStocks?.find((s: any) => s.slug === h.slug);
                    title = stock?.ticker || h.slug;
                    tickerForLogo = stock?.ticker || h.slug;
                    const change = extractStockDayChange(stock?.day_change || "");
                    dayAmt = change.amount;
                    dayPct = change.pct;
                  } else {
                    const mf = mfDetails[h.slug] || allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
                    title = mf?.fund_name || mf?.scheme_name || h.slug;
                    tickerForLogo = h.slug;
                    logoUrlForMF = mf?.logo_url;
                    if (!logoUrlForMF && title) {
                      const firstWord = title.split(' ')[0].toLowerCase();
                      if (firstWord === 'axis') logoUrlForMF = 'https://assets-netstorage.groww.in/mf-assets/logos/axis_groww.png';
                      else if (firstWord === 'nippon' || firstWord === 'reliance') logoUrlForMF = 'https://assets-netstorage.groww.in/mf-assets/logos/reliance_groww.png';
                    }
                    const change = getMfDayChange(h.slug);
                    dayAmt = change.amount;
                    dayPct = change.pct;
                  }

                  const price = getLivePrice(h.slug, activeTab);
                  const val = h.units * price;
                  const weight = totalValue > 0 ? ((val / totalValue) * 100).toFixed(1) : '0.0';

                  const isPositive = dayAmt >= 0;

                  return (
                    <div key={h.slug} className="flex flex-col p-2.5 rounded bg-canvas border border-border group hover:border-alpha/30 transition-colors relative">
                      {editingSlug !== h.slug && (
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                          <button 
                            onClick={() => {
                              setEditingSlug(h.slug);
                              setEditHoldingVal((h.holding_value || val).toString());
                              setEditInvestedVal(h.invested_amount.toString());
                            }} 
                            className="text-text-secondary hover:text-beta p-0.5 rounded hover:bg-surface"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button onClick={() => removeAsset(h.slug, activeTab)} className="text-text-secondary hover:text-beta p-0.5 rounded hover:bg-surface">
                            <X size={12} />
                          </button>
                        </div>
                      )}
                      
                      {editingSlug === h.slug ? (
                        <div className="flex flex-col gap-2 pt-1 pb-1">
                          <div className="flex items-center gap-3">
                            {logoUrlForMF 
                              ? <img src={logoUrlForMF} alt="AMC Logo" className="w-8 h-8 rounded-full bg-white object-contain border border-border shrink-0" />
                              : <StockLogo ticker={tickerForLogo} name={title} className="w-8 h-8 rounded-full shrink-0" />
                            }
                            <span className="font-bold text-text-primary text-sm truncate">{title}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-text-secondary font-bold uppercase">Current Value (₹)</label>
                              <input 
                                type="number" 
                                value={editHoldingVal} 
                                onChange={e => setEditHoldingVal(e.target.value)}
                                className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-alpha"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-text-secondary font-bold uppercase">Invested Amount (₹)</label>
                              <input 
                                type="number" 
                                value={editInvestedVal} 
                                onChange={e => setEditInvestedVal(e.target.value)}
                                className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-alpha"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 mt-2">
                            <button onClick={() => setEditingSlug(null)} className="px-2 py-1 text-xs text-text-secondary hover:text-white transition-colors">
                              Cancel
                            </button>
                            <button 
                              onClick={() => updateAsset(h.slug, activeTab)}
                              className="px-2 py-1 text-xs bg-alpha/20 text-alpha rounded hover:bg-alpha/30 transition-colors flex items-center gap-1"
                            >
                              <Check size={12} /> Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            {logoUrlForMF 
                              ? <img src={logoUrlForMF} alt="AMC Logo" className="w-8 h-8 rounded-full bg-white object-contain border border-border shrink-0" />
                              : <StockLogo ticker={tickerForLogo} name={title} className="w-8 h-8 rounded-full shrink-0" />
                            }
                            <div className="flex flex-col gap-0.5">
                               <span className="font-bold text-text-primary text-sm truncate max-w-[240px] pr-8">{title}</span>
                               <span className="text-[10px] text-text-secondary">{activeTab === 'STOCKS' ? h.units : h.units.toFixed(2)} Units • {price > 0 ? `₹${price.toLocaleString(undefined, {maximumFractionDigits: 2})}` : <span className="text-beta">Price Unavailable</span>} • {weight}%</span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end shrink-0 pr-4 group-hover:pr-10 transition-all">
                             <span className="font-mono text-sm font-bold tabular-nums text-white">₹{val.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                             <span className={`text-[10px] font-bold ${isPositive ? 'text-alpha' : 'text-beta'}`}>
                               {isPositive ? '+' : ''}{dayAmt.toFixed(2)} ({isPositive ? '+' : ''}{dayPct.toFixed(2)}%)
                             </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-text-secondary p-4 text-center border border-dashed border-border rounded-lg bg-canvas/50">
              <PieChartIcon size={32} className="mb-2 opacity-20" />
              <p className="text-xs">Add assets and values to build portfolio.</p>
            </div>
          )}
        </div>

        {/* Right: Analytics Panel (2/3rds width) */}
        <div className={`lg:col-span-2 bg-surface rounded-lg border border-border flex flex-col p-4 gap-4 min-h-0 relative`}>
           {/* Multi-Mode Chart Container */}
           <div className="flex-1 flex flex-col min-h-0 bg-canvas rounded-lg border border-border overflow-hidden">
             {/* Chart Mode Toggles */}
             <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
               <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest flex items-center gap-1.5">
                 {chartMode === 'growth' && <><TrendingUp size={12} className="text-purple-400" /> Portfolio Growth</>}
                 {chartMode === 'allocation' && <><PieChartIcon size={12} className="text-indigo-400" /> Asset Allocation</>}
                 {chartMode === 'stress' && <><Waves size={12} className="text-amber-400" /> Empirical Backtest</>}
                 {chartMode === 'performance' && <><List size={12} className="text-emerald-400" /> Performance Matrix</>}
                 {chartMode === 'drawdown' && (
                   <div className="flex items-center gap-1 group relative">
                     <TrendingDown size={12} className="text-red-400" /> 
                     <span>Drawdown Profile</span>
                     <Info size={12} className="text-text-secondary opacity-50 cursor-pointer" />
                     <div className="absolute top-full left-0 mt-2 w-64 p-2 bg-gray-900 border border-gray-700 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        Assumes your current portfolio weights were held passively (no rebalancing) over the last 252 trading days. The benchmark is strictly normalized against the Nifty 50.
                     </div>
                   </div>
                 )}
               </span>
               <div className="flex bg-surface rounded-md p-0.5 border border-border gap-0.5">
                 {[
                   { key: 'growth' as const, label: 'Growth', color: 'purple' },
                   { key: 'allocation' as const, label: 'Allocation', color: 'indigo' },
                   { key: 'stress' as const, label: 'Backtest', color: 'amber' },
                   { key: 'performance' as const, label: 'Performance', color: 'emerald' },
                   { key: 'drawdown' as const, label: 'Drawdown', color: 'red' },
                 ].map(m => (
                   <button
                     key={m.key}
                     onClick={() => setChartMode(m.key)}
                     className={`px-2.5 py-1 text-[10px] font-bold rounded transition-all ${
                       chartMode === m.key
                         ? `bg-${m.color}-500/20 text-${m.color}-400 border border-${m.color}-500/30`
                         : 'text-text-secondary hover:text-text-primary border border-transparent'
                     }`}
                   >
                     {m.label}
                   </button>
                 ))}
               </div>
             </div>

             {/* Chart Content */}
             <div className="flex-1 p-3 min-h-0">
               {totalAssets === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-text-secondary/50">
                   <Crosshair size={48} className="mb-3 opacity-20" />
                   <p className="text-xs">Add holdings to visualize analytics</p>
                 </div>
               ) : chartMode === 'growth' ? (
                  /* Portfolio Growth */
                  growthData.length > 0 ? (
                    <div className="flex flex-col h-full">
                      <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={growthData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9 }} tickFormatter={(d: string) => { const parts = d.split('-'); return parts.length >= 2 ? `${parts[1]}/${parts[0]?.slice(2)}` : d; }} />
                            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={['auto', 'auto']} tickFormatter={(val: number) => `₹${(val/1000).toFixed(0)}k`} />
                            
                            {(() => {
                              const firstActual = growthData.find(d => !d.isProjected);
                              const inceptionDate = firstActual ? firstActual.date : null;
                              return inceptionDate && growthData[0]?.date !== inceptionDate ? (
                                <>
                                  <ReferenceArea x1={growthData[0]?.date} x2={inceptionDate} fill="#eab308" fillOpacity={0.06} />
                                  <ReferenceLine x={inceptionDate} stroke="#ffffff" strokeDasharray="3 3" opacity={0.5} />
                                </>
                              ) : null;
                            })()}

                            <RechartsTooltip
                              contentStyle={{ backgroundColor: '#1e222d', borderColor: '#2a2e39', fontSize: 11 }}
                              formatter={(val: any, name: any, props: any) => {
                                const isProj = props?.payload?.isProjected;
                                if (String(name).toLowerCase() === 'invested' && isProj) return [null, null];
                                let label = String(name).toLowerCase() === 'portfolio' ? 'Portfolio' : String(name).toLowerCase() === 'benchmark' ? 'Nifty 50' : 'Total Invested';
                                if (isProj && label !== 'Total Invested') label += ' (projected)';
                                return [`₹${Number(val).toLocaleString()}`, label];
                              }}
                            />
                            <Line type="monotone" dataKey="portfolio" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Portfolio" />
                            <Line type="monotone" dataKey="benchmark" stroke="#06b6d4" strokeWidth={1} dot={false} opacity={0.6} name="Benchmark" />
                            <Line type="stepAfter" dataKey="invested" stroke="#64748b" strokeWidth={1} dot={false} opacity={0.5} strokeDasharray="5 5" name="Invested" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      {(() => {
                         if (!growthData.some(d => d.isProjected)) return null;
                         const projCount = growthData.filter(d => d.isProjected).length;
                         const totalCount = growthData.length;
                         const projPercent = (projCount / totalCount) * 100;
                         return (
                            <div className="relative flex-none" style={{ marginLeft: '10px', marginRight: '20px' }}>
                               <div style={{ width: `${projPercent}%` }} className="flex justify-center">
                                  <p className="text-[#eab308] text-[10px] mt-2 font-medium bg-surface/50 py-1.5 px-3 rounded-md border border-[#eab308]/20 flex items-center gap-1.5 w-max max-w-full text-center leading-tight">
                                    <Waves size={12} className="flex-shrink-0" />
                                    Growth of your portfolio if this distribution was projected to the past
                                  </p>
                               </div>
                            </div>
                         );
                      })()}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-text-secondary/50 text-center px-6">
                       <TrendingUp size={48} className="mb-3 opacity-20" />
                       <p className="text-xs">Processing growth data...</p>
                    </div>
                  )
               ) : chartMode === 'allocation' ? (
                  /* Asset Allocation */
                  Object.keys(allocationData.sectors).length > 0 ? (
                    <div className="flex flex-col md:flex-row gap-4 h-full overflow-y-auto px-2">
                      <div className="flex-1 bg-surface/50 rounded-lg p-4 border border-border">
                        <h4 className="text-xs font-bold text-text-secondary uppercase mb-4 tracking-wider flex items-center gap-1.5"><PieChartIcon size={12} className="text-indigo-400"/> Sector Weighting</h4>
                        <div className="space-y-3">
                          {Object.entries(allocationData.sectors)
                            .sort((a, b) => b[1].value - a[1].value)
                            .map(([sector, data], i) => (
                            <ProgressBar 
                              key={sector}
                              label={sector}
                              value={data.value}
                              max={totalValue}
                              assets={data.assets}
                              color={i === 0 ? 'bg-indigo-500' : 'bg-indigo-500/60'}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex-1 bg-surface/50 rounded-lg p-4 border border-border">
                        <h4 className="text-xs font-bold text-text-secondary uppercase mb-4 tracking-wider flex items-center gap-1.5"><Activity size={12} className="text-amber-400"/> Market Cap</h4>
                        <div className="space-y-3">
                          {Object.entries(allocationData.marketCaps)
                            .sort((a, b) => b[1].value - a[1].value)
                            .map(([mc, data], i) => (
                            <ProgressBar 
                              key={mc}
                              label={mc}
                              value={data.value}
                              max={totalValue}
                              assets={data.assets}
                              color={i === 0 ? 'bg-amber-500' : 'bg-amber-500/60'}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-text-secondary/50">
                      <PieChartIcon size={48} className="mb-3 opacity-20" />
                      <p className="text-xs">Add holdings to see asset allocation</p>
                    </div>
                  )
               ) : chartMode === 'stress' ? (
                 /* Macro Stress-Test */
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={stressTestData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }} layout="vertical">
                     <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                     <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'Projected Impact (%)', position: 'bottom', offset: 5, style: { fontSize: 10, fill: '#64748b' } }} />
                     <YAxis type="category" dataKey="event" stroke="#64748b" tick={{ fontSize: 10 }} width={90} />
                     <RechartsTooltip
                       cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                       content={({ active, payload }) => {
                         if (active && payload && payload.length) {
                           const data = payload[0].payload;
                           return (
                             <div className="bg-[#1e222d] border border-[#2a2e39] p-3 rounded shadow-xl text-xs min-w-[300px] z-50">
                               <div className="font-bold text-white mb-2">{data.event}</div>
                               <div className="flex justify-between text-text-secondary mb-1">
                                 <span>Portfolio Return:</span>
                                 <span className={`font-bold ${data.combined >= 0 ? 'text-alpha' : 'text-red-400'}`}>{data.combined}%</span>
                               </div>
                               <div className="flex justify-between text-text-secondary mb-3 pb-2 border-b border-border">
                                 <span>Benchmark:</span>
                                 <span className={`font-bold ${data.benchmark >= 0 ? 'text-alpha' : 'text-red-400'}`}>{data.benchmark}%</span>
                               </div>
                             </div>
                           );
                         }
                         return null;
                       }}
                     />
                     <Bar dataKey="combined" fill="#06b6d4" fillOpacity={0.8} name="Portfolio" radius={[0, 4, 4, 0]} />
                     <Bar dataKey="benchmark" fill="#64748b" fillOpacity={0.4} name="Benchmark" radius={[0, 4, 4, 0]} />
                   </BarChart>
                 </ResponsiveContainer>
               ) : chartMode === 'performance' ? (
                  /* Performance Matrix */
                  performanceData.length > 0 ? (
                    <div className="w-full h-full overflow-y-auto px-2 pb-6">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border text-[10px] text-text-secondary uppercase tracking-wider sticky top-0 bg-[#161821] z-10">
                            <th className="p-3 font-bold">Asset</th>
                            <th className="p-3 font-bold text-right">Value (₹)</th>
                            <th className="p-3 font-bold text-right">1M Ret</th>
                            <th className="p-3 font-bold text-right">6M Ret</th>
                            <th className="p-3 font-bold text-right">1Y Ret</th>
                          </tr>
                        </thead>
                        <tbody>
                          {performanceData.map((d, i) => {
                            const fmt = (val: number | null) => {
                              if (val == null) return '-';
                              const pct = val * 100;
                              return <span className={pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{pct > 0 ? '+' : ''}{pct.toFixed(1)}%</span>;
                            };
                            return (
                              <tr key={i} className="border-b border-border/30 hover:bg-surface-hover/30 transition-colors">
                                <td className="p-3">
                                  <div className="text-sm font-bold text-text-primary whitespace-nowrap truncate max-w-[150px]">{d.name}</div>
                                  <div className="text-[10px] text-text-secondary capitalize">{d.type}</div>
                                </td>
                                <td className="p-3 text-right text-sm text-text-primary">
                                  ₹{d.value.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                </td>
                                <td className="p-3 text-right text-sm">{fmt(d.ret1m)}</td>
                                <td className="p-3 text-right text-sm">{fmt(d.ret6m)}</td>
                                <td className="p-3 text-right text-sm">{fmt(d.ret1y)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-text-secondary/50 text-center px-6">
                       <List size={48} className="mb-3 opacity-20" />
                       <p className="text-xs">Add holdings to see historical performance.</p>
                    </div>
                  )
               ) : (
                 /* Drawdown Profile */
                 drawdownData.length > 0 ? (
                   <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={drawdownData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                       <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                       <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9 }} tickFormatter={(d: string) => { const parts = d.split('-'); return parts.length >= 2 ? `${parts[1]}/${parts[0]?.slice(2)}` : d; }} />
                       <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={['auto', 0]} label={{ value: 'Drawdown %', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#64748b' } }} />
                       <RechartsTooltip
                         contentStyle={{ backgroundColor: '#1e222d', borderColor: '#2a2e39', fontSize: 11 }}
                         formatter={(val: any, name: any) => [`${val}%`, String(name).toLowerCase() === 'portfolio' ? 'Portfolio' : 'Nifty 50']}
                       />
                       <ReferenceLine y={0} stroke="#64748b" strokeOpacity={0.3} />
                       <Area type="monotone" dataKey="portfolio" stroke="#ef4444" fillOpacity={0.2} fill="#ef4444" name="Portfolio" />
                       <Area type="monotone" dataKey="benchmark" stroke="#64748b" fillOpacity={0.1} fill="#64748b" name="Benchmark" />
                     </AreaChart>
                   </ResponsiveContainer>
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center text-text-secondary/50">
                     <TrendingDown size={48} className="mb-3 opacity-20" />
                     <p className="text-xs">Drawdown data requires OHLCV history (loading…)</p>
                   </div>
                 )
               )}
             </div>
           </div>
           
           {/* 3 Action Cards */}
           <div className="h-[220px] lg:h-[240px] flex gap-3 shrink-0">
             {/* CARD 1: Concentration X-Ray */}
             <div className="flex-1 bg-canvas rounded-lg border border-border p-3 flex flex-col overflow-hidden">
               <div className="flex items-center gap-1.5 mb-2 shrink-0">
                 <Eye size={12} className="text-amber-400" />
                 <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">True Concentration</span>
               </div>
               {concentrationData.length === 0 ? (
                 <div className="flex-1 flex items-center justify-center text-text-secondary/50 text-[10px]">Add holdings to analyze</div>
               ) : (
                 <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto hide-scrollbar">
                   {concentrationData.map((item, i) => (
                     <div key={i} className={`flex flex-col gap-0.5 p-1.5 rounded ${item.hasOverlap ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-surface/50'}`}>
                       <div className="flex justify-between items-center">
                         <span className="text-[10px] font-bold text-text-primary truncate pr-2">{item.ticker || item.name}</span>
                         <span className={`text-[10px] font-bold font-mono ${item.hasOverlap ? 'text-amber-400' : 'text-text-primary'}`}>{item.totalPct}%</span>
                       </div>
                       <div className="flex gap-2">
                         {item.directPct > 0 && <span className="text-[8px] text-[#8b5cf6]">Direct: {item.directPct}%</span>}
                         {item.mfPct > 0 && <span className="text-[8px] text-[#06b6d4]">via Funds: {item.mfPct}%</span>}
                       </div>
                       {item.hasOverlap && (
                          <div className="flex flex-col gap-1 mt-1">
                            <span className="text-[8px] text-amber-400/80 flex items-center gap-0.5"><AlertTriangle size={8} /> Overlap detected</span>
                            <div className="flex flex-col gap-0.5 ml-2">
                              {item.mfSources?.map((src: any, idx: number) => (
                                <span key={idx} className="text-[7px] text-text-secondary truncate">
                                  • {src.name} (<span className="text-[#06b6d4]">{src.pct}%</span>)
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                       {/* Progress bar */}
                       <div className="h-0.5 w-full bg-border/50 rounded-full overflow-hidden mt-0.5">
                         <div className="h-full rounded-full flex">
                           <div className="bg-[#8b5cf6]" style={{ width: `${Math.min(item.directPct * 3, 100)}%` }}></div>
                           <div className="bg-[#06b6d4]" style={{ width: `${Math.min(item.mfPct * 3, 100)}%` }}></div>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>

             {/* CARD 2: Defense Engine */}
             <div className="flex-1 bg-canvas rounded-lg border border-border p-3 flex flex-col overflow-hidden">
               <div className="flex items-center gap-1.5 mb-2 shrink-0">
                 <Shield size={12} className="text-blue-400" />
                 <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Defense Engine</span>
               </div>
               {totalAssets === 0 ? (
                 <div className="flex-1 flex items-center justify-center text-text-secondary/50 text-[10px]">Add holdings to analyze</div>
               ) : (
                 <div className="flex-1 flex flex-col gap-2">
                   {/* VaR */}
                   <div className="p-2 bg-surface/50 rounded border border-border">
                     <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">95% Weekly VaR</span>
                     <span className="text-lg font-bold font-mono text-beta">
                       {defenseMetrics.var95 === 'N/A' ? 'N/A' : `₹${defenseMetrics.var95.toLocaleString()}`}
                     </span>
                     <span className="text-[8px] text-text-secondary block mt-0.5">Max expected weekly loss (95% confidence)</span>
                   </div>
                   {/* Beta */}
                   <div className="flex gap-2">
                     <div className="flex-1 p-2 bg-surface/50 rounded border border-border">
                       <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Portfolio Beta</span>
                       <span className={`text-base font-bold font-mono ${defenseMetrics.beta !== 'N/A' && (defenseMetrics.beta as number) > 1.1 ? 'text-beta' : defenseMetrics.beta !== 'N/A' && (defenseMetrics.beta as number) < 0.8 ? 'text-alpha' : 'text-text-primary'}`}>
                         {defenseMetrics.beta}
                       </span>
                     </div>
                     <div className="flex-1 p-2 bg-surface/50 rounded border border-border">
                       <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Rating</span>
                       <span className={`text-xs font-bold ${defenseMetrics.defensiveRating === 'Strong' ? 'text-alpha' : defenseMetrics.defensiveRating === 'Moderate' ? 'text-amber-400' : 'text-beta'}`}>
                         {defenseMetrics.defensiveRating}
                       </span>
                     </div>
                   </div>
                   {/* Capture Ratios */}
                   {defenseMetrics.upCapture !== null && (
                     <div className="flex gap-2">
                       <div className="flex-1 p-1.5 bg-surface/50 rounded border border-border text-center">
                         <span className="text-[8px] text-text-secondary uppercase font-bold block">Up Capture</span>
                         <span className="text-xs font-bold font-mono text-alpha">{defenseMetrics.upCapture}%</span>
                       </div>
                       <div className="flex-1 p-1.5 bg-surface/50 rounded border border-border text-center">
                         <span className="text-[8px] text-text-secondary uppercase font-bold block">Down Capture</span>
                         <span className="text-xs font-bold font-mono text-beta">{defenseMetrics.downCapture}%</span>
                       </div>
                     </div>
                   )}
                 </div>
               )}
             </div>

             {/* CARD 3: Yield & Valuation */}
             <div className="flex-1 bg-canvas rounded-lg border border-border p-3 flex flex-col overflow-hidden">
               <div className="flex items-center gap-1.5 mb-2 shrink-0">
                 <Wallet size={12} className="text-emerald-400" />
                 <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Yield & Valuation</span>
               </div>
               {totalAssets === 0 ? (
                 <div className="flex-1 flex items-center justify-center text-text-secondary/50 text-[10px]">Add holdings to analyze</div>
               ) : (
                 <div className="flex-1 flex flex-col gap-2">
                   {/* Forward Yield */}
                   <div className="p-2 bg-surface/50 rounded border border-border">
                     <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Forward Dividend Yield</span>
                     <div className="flex items-baseline gap-2">
                       <span className="text-lg font-bold font-mono text-alpha">₹{yieldValuation.projectedYield.toLocaleString()}<span className="text-[10px] text-text-secondary">/yr</span></span>
                       <span className="text-xs font-bold text-text-secondary">({yieldValuation.aggYield}%)</span>
                     </div>
                   </div>
                   {/* P/E */}
                   {/* P/E */}
                   <div className="p-2 bg-surface/50 rounded border border-border">
                     <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Aggregate P/E</span>
                     <div className="flex items-baseline gap-2">
                       <span className="text-base font-bold font-mono text-text-primary">{yieldValuation.aggPE}x</span>
                       <span className={`text-[10px] font-bold ${yieldValuation.pePremium > 0 ? 'text-amber-400' : 'text-alpha'}`}>
                         {yieldValuation.pePremium > 0 ? '+' : ''}{yieldValuation.pePremium}% vs Market
                       </span>
                     </div>
                   </div>
                   {/* Benchmark comparison */}
                   <div className="flex gap-2">
                     <div className="flex-1 p-1.5 bg-surface/50 rounded border border-border text-center group relative">
                       <span className="text-[8px] text-text-secondary uppercase font-bold block">Portfolio P/E</span>
                       <span className="text-xs font-bold font-mono text-text-primary">{yieldValuation.aggPE}x</span>
                     </div>
                     <div className="flex-1 p-1.5 bg-surface/50 rounded border border-border text-center group relative">
                       <div className="flex items-center justify-center gap-1">
                          <span className="text-[8px] text-text-secondary uppercase font-bold block">Sector Avg P/E</span>
                          <Info size={8} className="text-text-secondary opacity-50" />
                       </div>
                       <span className="text-xs font-bold font-mono text-text-secondary">{yieldValuation.benchmarkPE}x</span>
                       <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 border border-gray-700 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          The value-weighted average of the Industry P/E for every holding in your portfolio. This ensures accurate peer comparison based on your exact capital allocation.
                       </div>
                     </div>
                   </div>
                 </div>
               )}
             </div>
           </div>
        </div>
      </div>

      {/* AI Slide-out Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setIsAiModalOpen(false)}></div>
          
          {/* Panel */}
          <div className={`relative bg-surface border-l border-indigo-500/30 flex flex-col transition-all duration-300 shadow-[0_0_50px_rgba(99,102,241,0.1)] h-full ${isMaximized ? 'w-full' : 'w-[500px] lg:w-[600px]'}`}>
            
            {/* Header */}
            <div className="bg-surface border-b border-border p-4 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-3 font-bold text-indigo-400">
                <BrainCircuit size={20} /> CIO AI Analysis
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsMaximized(!isMaximized)} className="p-1.5 text-text-secondary hover:text-white transition-colors">
                  {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button onClick={() => setIsAiModalOpen(false)} className="p-1.5 text-text-secondary hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* AI Controls */}
            {totalAssets > 0 && (
              <div className="bg-canvas border-b border-border p-3 shrink-0 flex flex-wrap items-center gap-3">
                <button 
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="px-4 py-1.5 bg-indigo-500 text-white text-xs font-bold rounded hover:bg-indigo-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Run Analysis
                </button>
                <div className="flex items-center gap-2 bg-surface px-2 py-1 rounded border border-border">
                  <span className="text-[10px] text-text-secondary font-bold uppercase">Stock Risk</span>
                  <select value={stockRiskTolerance} onChange={e => setStockRiskTolerance(e.target.value)} className="bg-transparent text-xs text-text-primary focus:outline-none">
                    <option>Conservative</option><option>Moderate</option><option>Aggressive</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-surface px-2 py-1 rounded border border-border">
                  <span className="text-[10px] text-text-secondary font-bold uppercase">MF Risk</span>
                  <select value={mfRiskTolerance} onChange={e => setMfRiskTolerance(e.target.value)} className="bg-transparent text-xs text-text-primary focus:outline-none">
                    <option>Conservative</option><option>Moderate</option><option>Aggressive</option>
                  </select>
                </div>
              </div>
            )}

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 hide-scrollbar flex flex-col relative">
              {aiError && (
                <div className="bg-beta/10 border border-beta/30 text-beta text-xs p-3 mb-6 rounded flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} />
                    <span>{aiError}</span>
                  </div>
                  <button onClick={handleAnalyze} className="underline font-bold whitespace-nowrap ml-4 hover:text-beta/80">Refresh</button>
                </div>
              )}
              
              {!aiAnalysis && !isAnalyzing && (
                 <div className="flex-1 flex flex-col items-center justify-center text-indigo-400/50">
                   <BrainCircuit size={64} className="mb-4 opacity-20" />
                   <p className="text-sm">Run Analysis to generate a unified institutional report.</p>
                 </div>
              )}
              
              {isAnalyzing && !aiAnalysis && (
                 <div className="flex-1 flex flex-col items-center justify-center text-indigo-400">
                   <Loader2 size={48} className="mb-4 animate-spin opacity-50" />
                   <p className="text-sm animate-pulse">Running advanced unified risk modeling...</p>
                 </div>
              )}

              {aiAnalysis && (
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 shrink-0">
                  {/* Score & Verdict Card */}
                  <div className="p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-xl flex flex-col gap-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full translate-x-10 -translate-y-10"></div>
                    <div className="flex justify-between items-start z-10 gap-6">
                      <div className="flex-1">
                        <span className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase mb-3 block">Strategic Verdict</span>
                        <div className="prose prose-invert prose-indigo max-w-none text-sm leading-relaxed [&>p]:mb-4 last:[&>p]:mb-0 [&>ul]:list-disc [&>ul]:ml-5 [&>h3]:text-base [&>h3]:font-bold [&>h3]:mt-4 [&>h3]:mb-2 [&>strong]:text-white">
                          <ReactMarkdown>
                            {aiAnalysis.strategic_verdict}
                          </ReactMarkdown>
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-[10px] font-bold tracking-widest text-text-secondary uppercase">Risk Score</span>
                        <span className={`text-4xl font-black tabular-nums tracking-tighter ${aiAnalysis.portfolio_risk_score > 60 ? 'text-beta' : aiAnalysis.portfolio_risk_score > 30 ? 'text-warning' : 'text-alpha'}`}>
                          {aiAnalysis.portfolio_risk_score}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold bg-surface w-fit px-3 py-1.5 rounded-full border border-border mt-2">
                      <Activity size={14} className={aiAnalysis.profile_alignment === 'MATCH' ? 'text-alpha' : 'text-warning'} />
                      Profile: {aiAnalysis.profile_alignment}
                    </div>
                  </div>

                  {/* Macro & Concentration */}
                  <div className="grid grid-cols-2 gap-4">
                     <div className="bg-canvas border border-border rounded-xl p-4 flex flex-col gap-3">
                       <span className="text-xs font-bold uppercase tracking-widest text-text-secondary flex items-center gap-2">
                         <AlertTriangle size={14} /> Concentration
                       </span>
                       <div className="text-sm font-bold text-white">Risk: <span className={aiAnalysis.concentration_analysis.risk_level === 'HIGH' ? 'text-beta' : 'text-warning'}>{aiAnalysis.concentration_analysis.risk_level}</span></div>
                       <div className="flex flex-wrap gap-2">
                         {aiAnalysis.concentration_analysis.vulnerable_sectors.map((s: string, i: number) => (
                           <span key={i} className="text-[10px] font-bold px-2 py-1 bg-surface rounded border border-border">{s}</span>
                         ))}
                       </div>
                     </div>
                     <div className="bg-canvas border border-border rounded-xl p-4 flex flex-col gap-3">
                       <span className="text-xs font-bold uppercase tracking-widest text-text-secondary flex items-center gap-2">
                         <Globe size={14} /> Macro Exposure
                       </span>
                       <div className="flex flex-col gap-2">
                         {aiAnalysis.macro_exposures.map((m: any, i: number) => (
                           <div key={i} className="text-xs flex justify-between items-center border-b border-border/50 pb-1 last:border-0 last:pb-0">
                             <span className="text-text-secondary">{m.factor}</span>
                             <span className="font-bold text-white text-right w-1/2 text-[10px] leading-tight" title={m.impact}>{m.impact}</span>
                           </div>
                         ))}
                       </div>
                     </div>
                  </div>

                  {/* Asset Action Plan */}
                  <div className="flex flex-col gap-3">
                     <span className="text-xs font-bold uppercase tracking-widest text-text-secondary flex items-center gap-2">
                       <List size={14} /> Asset Action Plan
                     </span>
                     <div className="bg-canvas border border-border rounded-xl overflow-hidden divide-y divide-border/50">
                       {aiAnalysis.asset_action_plan.map((plan: any, i: number) => (
                         <div key={i} className="p-4 flex flex-col gap-2 hover:bg-surface-hover/30 transition-colors">
                           <div className="flex justify-between items-center">
                             <span className="font-bold text-text-primary text-sm">{plan.asset}</span>
                             <span className={`text-[10px] font-bold px-2 py-1 rounded border ${getActionColor(plan.action)}`}>
                               {plan.action}
                             </span>
                           </div>
                           <p className="text-xs text-text-secondary leading-relaxed">{plan.justification}</p>
                         </div>
                       ))}
                     </div>
                  </div>
                </div>
              )}

              {/* Chat History */}
              {chatHistory.length > 0 && (
                <div className="flex flex-col gap-4 mt-6 pt-6 border-t border-border shrink-0 pb-4">
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`text-[10px] font-bold mb-1 opacity-50 ${msg.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                        {msg.role === 'user' ? 'You' : 'CIO AI'}
                      </div>
                      <div className={`p-3 rounded-xl max-w-[85%] text-sm ${
                        msg.role === 'user' 
                          ? 'bg-alpha/10 border border-alpha/20 text-text-primary rounded-tr-sm' 
                          : 'bg-canvas border border-border text-text-secondary rounded-tl-sm'
                      }`}>
                        <div className="prose prose-invert prose-sm max-w-none [&>p]:mb-2 last:[&>p]:mb-0 [&>ul]:list-disc [&>ul]:ml-4 [&>ol]:list-decimal [&>ol]:ml-4 [&>li]:mb-1">
                          <ReactMarkdown>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                  {isChatting && (
                    <div className="flex flex-col items-start">
                      <div className="p-3 rounded-xl bg-canvas border border-border rounded-tl-sm flex gap-1 items-center">
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-100"></div>
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-200"></div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} className="h-4" />
                </div>
              )}
            </div>

            {/* Persistent Chat Input */}
            <div className="p-4 border-t border-border bg-surface shrink-0">
              <div className="relative">
                <input 
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSendChat();
                  }}
                  disabled={!aiAnalysis || isChatting}
                  placeholder={aiAnalysis ? "Ask follow-up questions..." : "Analyze portfolio to start chatting..."}
                  className="w-full pl-4 pr-12 py-3 bg-canvas border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 shadow-inner"
                />
                <button 
                  onClick={handleSendChat}
                  disabled={!aiAnalysis || isChatting || !chatInput.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors bg-surface rounded-lg border border-border/50"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
