import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks, fetchMutualFunds, fetchPortfolioAIAnalysis, sendPortfolioChat, fetchBatchStockData, fetchMutualFundByCode, fetchCaptureRatios } from '../api';
import { Search, X, PieChart as PieChartIcon, BrainCircuit, AlertTriangle, Send, Loader2, Globe, Zap, List, Activity, Maximize2, Minimize2, TrendingUp, TrendingDown, Shield, Eye, Wallet, Crosshair, Waves, BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, BarChart, Bar, AreaChart, Area, ReferenceLine } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { StockLogo } from '../components/StockLogo';

interface LocalHolding {
  slug: string;
  units: number;
}

export const PortfolioTracker = ({ isPanel = false }: { isPanel?: boolean }) => {
  const [activeTab, setActiveTab] = useState<'STOCKS' | 'MUTUAL_FUNDS'>('STOCKS');
  
  const [stockHoldings, setStockHoldings] = useState<LocalHolding[]>(() => {
    const saved = localStorage.getItem('portfolio_stock_holdings');
    try {
      const parsed = saved ? JSON.parse(saved) : [];
      if (parsed.length > 0 && parsed[0].amount !== undefined && parsed[0].units === undefined) return [];
      return parsed;
    } catch { return []; }
  });
  const [mfHoldings, setMfHoldings] = useState<LocalHolding[]>(() => {
    const saved = localStorage.getItem('portfolio_mf_holdings');
    try {
      const parsed = saved ? JSON.parse(saved) : [];
      if (parsed.length > 0 && parsed[0].amount !== undefined && parsed[0].units === undefined) return [];
      return parsed;
    } catch { return []; }
  });
  
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [unitsInput, setUnitsInput] = useState<string>('');
  
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

  useEffect(() => { localStorage.setItem('portfolio_stock_holdings', JSON.stringify(stockHoldings)); }, [stockHoldings]);
  useEffect(() => { localStorage.setItem('portfolio_mf_holdings', JSON.stringify(mfHoldings)); }, [mfHoldings]);
  useEffect(() => { localStorage.setItem('portfolio_stock_risk', stockRiskTolerance); }, [stockRiskTolerance]);
  useEffect(() => { localStorage.setItem('portfolio_mf_risk', mfRiskTolerance); }, [mfRiskTolerance]);
  useEffect(() => { localStorage.setItem('portfolio_holding_period', holdingPeriod); }, [holdingPeriod]);
  useEffect(() => { localStorage.setItem('portfolio_chat', JSON.stringify(chatHistory)); }, [chatHistory]);

  const { data: allStocks } = useQuery({ queryKey: ['allStocks'], queryFn: fetchAllStocks });
  const { data: mfData } = useQuery({ queryKey: ['allMFs'], queryFn: () => fetchMutualFunds({ limit: 500 }) });
  const allMFs = mfData?.data || [];

  // Chart mode toggle
  const [chartMode, setChartMode] = useState<'alpha' | 'stress' | 'shap' | 'drawdown'>('alpha');

  // Fetch detailed batch stock data (OHLCV, relative_data) for portfolio holdings
  const stockSlugs = useMemo(() => stockHoldings.map(h => h.slug), [stockHoldings]);
  const { data: batchStockData } = useQuery({
    queryKey: ['batchStocks', stockSlugs],
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

  const getLivePrice = (slug: string, tab: 'STOCKS' | 'MUTUAL_FUNDS'): number => {
    if (tab === 'STOCKS') {
      const stock = allStocks?.find((s: any) => s.slug === slug);
      let price = stock?.livePrice;
      if (typeof price === 'string') {
        price = parseFloat(price.replace(/[^0-9.-]+/g, ""));
      }
      return (price && !isNaN(price)) ? price : (stock?.peRatio || 100);
    } else {
      const mf = allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === slug);
      if (mf && mf.historical_navs && mf.historical_navs.length > 0) {
        return mf.historical_navs[mf.historical_navs.length - 1][1];
      }
      return 100;
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
    const mf = allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === slug);
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
    if (activeTab === 'STOCKS') {
      return allStocks 
        ? allStocks.filter((s: any) => 
            !stockHoldings.find(h => h.slug === s.slug) && 
            ((s.ticker && s.ticker.toLowerCase().includes(query.toLowerCase())) || 
             (s.name && s.name.toLowerCase().includes(query.toLowerCase())))
          ).slice(0, 8)
        : [];
    } else {
      return allMFs
        ? allMFs.filter((m: any) => 
            !mfHoldings.find(h => h.slug === (m.scheme_code || m.direct_search_id)) && 
            ((m.scheme_name && m.scheme_name.toLowerCase().includes(query.toLowerCase())) || 
             (m.fund_name && m.fund_name.toLowerCase().includes(query.toLowerCase())))
          ).slice(0, 8)
        : [];
    }
  }, [query, activeTab, allStocks, allMFs, stockHoldings, mfHoldings]);

  const addAsset = (slug: string) => {
    const unts = parseFloat(unitsInput);
    if (!unts || isNaN(unts) || unts <= 0) return;
    
    if (activeTab === 'STOCKS') {
      setStockHoldings([...stockHoldings, { slug, units: unts }]);
    } else {
      const price = getLivePrice(slug, 'MUTUAL_FUNDS');
      const units = price > 0 ? unts / price : 0;
      setMfHoldings([...mfHoldings, { slug, units }]);
    }
    
    setQuery('');
    setUnitsInput('');
    setIsOpen(false);
  };

  const removeAsset = (slug: string, type: 'STOCKS' | 'MUTUAL_FUNDS') => {
    if (type === 'STOCKS') {
      setStockHoldings(stockHoldings.filter(h => h.slug !== slug));
    } else {
      setMfHoldings(mfHoldings.filter(h => h.slug !== slug));
    }
  };

  let totalStockPnL = 0;
  let totalMfPnL = 0;

  const stockTotalValue = stockHoldings.reduce((sum, h) => {
    const val = h.units * getLivePrice(h.slug, 'STOCKS');
    const stock = allStocks?.find((s: any) => s.slug === h.slug);
    const change = extractStockDayChange(stock?.day_change || "");
    totalStockPnL += h.units * change.amount;
    return sum + val;
  }, 0);

  const mfTotalValue = mfHoldings.reduce((sum, h) => {
    const val = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
    const change = getMfDayChange(h.slug);
    totalMfPnL += h.units * change.amount;
    return sum + val;
  }, 0);

  const totalValue = stockTotalValue + mfTotalValue;
  const totalAssets = stockHoldings.length + mfHoldings.length;

  const totalPnL = totalStockPnL + totalMfPnL;
  const totalPnLPct = (totalValue - totalPnL) > 0 ? (totalPnL / (totalValue - totalPnL)) * 100 : 0;

  const stockPnLPct = (stockTotalValue - totalStockPnL) > 0 ? (totalStockPnL / (stockTotalValue - totalStockPnL)) * 100 : 0;
  const mfPnLPct = (mfTotalValue - totalMfPnL) > 0 ? (totalMfPnL / (mfTotalValue - totalMfPnL)) * 100 : 0;

  const stocksPie = useMemo(() => {
    return stockHoldings.map(h => {
      const stock = allStocks?.find((s: any) => s.slug === h.slug);
      return { name: stock?.ticker || h.slug, slug: h.slug, ticker: stock?.ticker, value: h.units * getLivePrice(h.slug, 'STOCKS') };
    }).sort((a, b) => b.value - a.value);
  }, [stockHoldings, allStocks]);

  const mfsPie = useMemo(() => {
    return mfHoldings.map(h => {
      const mf = allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
      const val = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
      return { name: (mf?.fund_name || h.slug).substring(0, 15) + '...', slug: h.slug, ticker: h.slug, logoUrl: mf?.logo_url, value: val };
    }).sort((a, b) => b.value - a.value);
  }, [mfHoldings, allMFs]);

  const overallPie = [
    { name: 'Stocks', value: stockTotalValue, slug: 'stocks' },
    { name: 'Mutual Funds', value: mfTotalValue, slug: 'mfs' }
  ];

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#64748b'];

  // ═══════════════════════════════════════════════════════════════════
  // ANALYTICS ENGINE: All computed data for charts and cards
  // ═══════════════════════════════════════════════════════════════════

  // CHART 1: Alpha-Risk Scatter Plot Data
  const scatterData = useMemo(() => {
    const points: any[] = [];
    stockHoldings.forEach(h => {
      const stock = allStocks?.find((s: any) => s.slug === h.slug);
      if (!stock) return;
      const val = h.units * getLivePrice(h.slug, 'STOCKS');
      const risk = stock.v_squeeze != null ? Math.abs(stock.v_squeeze) * 100 : 50;
      const alpha = stock.alpha_score != null ? stock.alpha_score * 100 : 50;
      points.push({
        name: stock.ticker || h.slug,
        risk: parseFloat(risk.toFixed(1)),
        alpha: parseFloat(alpha.toFixed(1)),
        value: val,
        type: 'stock',
        industry: stock.industry || 'Unknown'
      });
    });
    // For MFs, use advanced_stats if available
    mfHoldings.forEach(h => {
      const mf = allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
      if (!mf) return;
      const val = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
      const detail = mfDetails[h.slug];
      let beta = 1.0;
      let alpha = 50;
      if (detail?.advanced_stats) {
        const stats = typeof detail.advanced_stats === 'string' ? JSON.parse(detail.advanced_stats) : detail.advanced_stats;
        const betaStat = stats?.find?.((s: any) => s.type?.toLowerCase()?.includes('beta'));
        const alphaStat = stats?.find?.((s: any) => s.type?.toLowerCase()?.includes('alpha'));
        if (betaStat?.stat_1y) beta = parseFloat(betaStat.stat_1y);
        if (alphaStat?.stat_1y) alpha = parseFloat(alphaStat.stat_1y);
      }
      points.push({
        name: (mf.fund_name || h.slug).substring(0, 20),
        risk: parseFloat((beta * 50).toFixed(1)),
        alpha: parseFloat(alpha.toFixed(1)),
        value: val,
        type: 'fund',
        industry: mf.category || 'Mutual Fund'
      });
    });
    return points;
  }, [stockHoldings, mfHoldings, allStocks, allMFs, mfDetails]);

  // CHART 2: Macro Stress-Test Data
  const stressTestData = useMemo(() => {
    const scenarios = [
      { event: 'Nifty -10%', marketDrop: -10 },
      { event: 'Nifty -20%', marketDrop: -20 },
      { event: 'Rate Hike +50bps', marketDrop: -5 },
      { event: 'Crude $100', marketDrop: -8 },
      { event: 'FII Exodus', marketDrop: -15 },
    ];
    return scenarios.map(s => {
      let stockDrawdown = 0;
      let mfDrawdown = 0;
      // Weighted stock drawdown based on beta proxy (v_squeeze / rs_rating)
      stockHoldings.forEach(h => {
        const stock = allStocks?.find((st: any) => st.slug === h.slug);
        if (!stock) return;
        const val = h.units * getLivePrice(h.slug, 'STOCKS');
        const weight = totalValue > 0 ? val / totalValue : 0;
        // Use rs_rating as a beta proxy: high RS = high beta
        const betaProxy = stock.rs_rating != null ? Math.max(0.5, stock.rs_rating / 50) : 1.0;
        stockDrawdown += s.marketDrop * betaProxy * weight * 100;
      });
      // MF drawdown from advanced_stats beta or risk category
      mfHoldings.forEach(h => {
        const mf = allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
        if (!mf) return;
        const val = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
        const weight = totalValue > 0 ? val / totalValue : 0;
        let beta = 1.0;
        const detail = mfDetails[h.slug];
        if (detail?.advanced_stats) {
          const stats = typeof detail.advanced_stats === 'string' ? JSON.parse(detail.advanced_stats) : detail.advanced_stats;
          const betaStat = stats?.find?.((s: any) => s.type?.toLowerCase()?.includes('beta'));
          if (betaStat?.stat_1y) beta = parseFloat(betaStat.stat_1y);
        }
        // Debt/balanced funds have lower beta
        if (mf.category?.toLowerCase()?.includes('debt') || mf.category?.toLowerCase()?.includes('liquid')) beta = 0.2;
        mfDrawdown += s.marketDrop * beta * weight * 100;
      });
      return {
        event: s.event,
        stocks: parseFloat(stockDrawdown.toFixed(1)),
        funds: parseFloat(mfDrawdown.toFixed(1)),
        combined: parseFloat((stockDrawdown + mfDrawdown).toFixed(1)),
        benchmark: s.marketDrop,
      };
    });
  }, [stockHoldings, mfHoldings, allStocks, allMFs, totalValue, mfDetails]);

  // CHART 3: SHAP Waterfall Data (aggregate top factor reasons)
  const shapWaterfallData = useMemo(() => {
    const reasonCounts: Record<string, { count: number, weightedAlpha: number }> = {};
    stockHoldings.forEach(h => {
      const stock = allStocks?.find((s: any) => s.slug === h.slug);
      if (!stock) return;
      const val = h.units * getLivePrice(h.slug, 'STOCKS');
      const weight = totalValue > 0 ? val / totalValue : 0;
      const alpha = stock.alpha_score || 0;
      [stock.shap_reason_1, stock.shap_reason_2, stock.shap_reason_3].forEach((reason: string) => {
        if (!reason) return;
        // Clean the reason string (e.g., "pe_ratio: +0.12" → "pe_ratio")
        const cleanReason = reason.split(':')[0].trim().replace(/_/g, ' ');
        if (!reasonCounts[cleanReason]) reasonCounts[cleanReason] = { count: 0, weightedAlpha: 0 };
        reasonCounts[cleanReason].count += 1;
        reasonCounts[cleanReason].weightedAlpha += alpha * weight;
      });
    });
    return Object.entries(reasonCounts)
      .map(([name, { count, weightedAlpha }]) => ({
        name: name.length > 18 ? name.substring(0, 18) + '…' : name,
        impact: parseFloat((weightedAlpha * 100).toFixed(2)),
        count,
      }))
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
      .slice(0, 8);
  }, [stockHoldings, allStocks, totalValue]);

  // CHART 4: Drawdown Data (from OHLCV for stocks, historical_navs for MFs)
  const drawdownData = useMemo(() => {
    // Compute portfolio-level drawdown from stock OHLCV data
    if (!batchStockData && mfHoldings.length === 0) return [];

    // Collect all available time series and compute weighted returns
    const dateReturns: Record<string, number> = {};
    const benchmarkReturns: Record<string, number> = {};
    let benchmarkOhlcv: any[] = [];

    // Process stocks
    stockHoldings.forEach(h => {
      const detail = batchStockData?.[h.slug];
      if (!detail?.absolute?.OHLCV) return;
      const ohlcv = detail.absolute.OHLCV;
      if (!benchmarkOhlcv.length && detail.benchmark_ohlcv) benchmarkOhlcv = detail.benchmark_ohlcv;
      const val = h.units * getLivePrice(h.slug, 'STOCKS');
      const weight = totalValue > 0 ? val / totalValue : 0;
      for (let i = 1; i < ohlcv.length; i++) {
        const date = ohlcv[i][0];
        const ret = (ohlcv[i][4] - ohlcv[i - 1][4]) / ohlcv[i - 1][4];
        dateReturns[date] = (dateReturns[date] || 0) + ret * weight;
      }
    });

    // Process MF NAVs
    mfHoldings.forEach(h => {
      const mf = allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
      if (!mf?.historical_navs?.length) return;
      const navs = mf.historical_navs;
      const val = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
      const weight = totalValue > 0 ? val / totalValue : 0;
      for (let i = 1; i < navs.length; i++) {
        const date = navs[i][0];
        const ret = (navs[i][1] - navs[i - 1][1]) / navs[i - 1][1];
        dateReturns[date] = (dateReturns[date] || 0) + ret * weight;
      }
    });

    // Benchmark returns
    for (let i = 1; i < benchmarkOhlcv.length; i++) {
      const date = benchmarkOhlcv[i][0];
      const ret = (benchmarkOhlcv[i][4] - benchmarkOhlcv[i - 1][4]) / benchmarkOhlcv[i - 1][4];
      benchmarkReturns[date] = ret;
    }

    // Convert to sorted drawdown series
    const dates = Object.keys(dateReturns).sort();
    let portfolioPeak = 100;
    let portfolioCumValue = 100;
    let benchmarkPeak = 100;
    let benchmarkCumValue = 100;

    return dates.slice(-252).map(d => { // Last ~1 year
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
  }, [batchStockData, stockHoldings, mfHoldings, allMFs, totalValue]);

  // ═══ CARD 1: True Concentration X-Ray ═══
  const concentrationData = useMemo(() => {
    // Map: stock_name → { directPct, mfPct, totalPct }
    const exposureMap: Record<string, { directPct: number, mfPct: number, directTicker: string }> = {};

    // Direct stock holdings
    stockHoldings.forEach(h => {
      const stock = allStocks?.find((s: any) => s.slug === h.slug);
      if (!stock) return;
      const val = h.units * getLivePrice(h.slug, 'STOCKS');
      const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
      const key = stock.name || stock.ticker || h.slug;
      if (!exposureMap[key]) exposureMap[key] = { directPct: 0, mfPct: 0, directTicker: stock.ticker || '' };
      exposureMap[key].directPct += pct;
    });

    // MF look-through holdings
    mfHoldings.forEach(h => {
      const detail = mfDetails[h.slug];
      if (!detail?.detailed_holdings) return;
      const holdings = typeof detail.detailed_holdings === 'string' ? JSON.parse(detail.detailed_holdings) : detail.detailed_holdings;
      if (!Array.isArray(holdings)) return;
      const mfVal = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
      const mfWeight = totalValue > 0 ? mfVal / totalValue : 0;
      holdings.forEach((holding: any) => {
        if (!holding.company_name || holding.nature_name === 'CASH') return;
        const key = holding.company_name;
        const corpusPct = parseFloat(holding.corpus_per) || 0;
        if (!exposureMap[key]) exposureMap[key] = { directPct: 0, mfPct: 0, directTicker: '' };
        exposureMap[key].mfPct += corpusPct * mfWeight;
      });
    });

    return Object.entries(exposureMap)
      .map(([name, { directPct, mfPct, directTicker }]) => ({
        name: name.length > 25 ? name.substring(0, 25) + '…' : name,
        ticker: directTicker,
        directPct: parseFloat(directPct.toFixed(2)),
        mfPct: parseFloat(mfPct.toFixed(2)),
        totalPct: parseFloat((directPct + mfPct).toFixed(2)),
        hasOverlap: directPct > 0 && mfPct > 0,
      }))
      .sort((a, b) => b.totalPct - a.totalPct)
      .slice(0, 5);
  }, [stockHoldings, mfHoldings, allStocks, mfDetails, totalValue]);

  // ═══ CARD 2: Defense Engine (VaR, Beta, Up/Down Capture) ═══
  const defenseMetrics = useMemo(() => {
    // Weighted portfolio beta
    let weightedBeta = 0;
    let coveredWeight = 0;

    stockHoldings.forEach(h => {
      const stock = allStocks?.find((s: any) => s.slug === h.slug);
      if (!stock) return;
      const val = h.units * getLivePrice(h.slug, 'STOCKS');
      const weight = totalValue > 0 ? val / totalValue : 0;
      // Use rs_rating as beta proxy (higher RS = higher beta)
      const betaProxy = stock.rs_rating != null ? Math.max(0.6, stock.rs_rating / 50) : 1.0;
      weightedBeta += betaProxy * weight;
      coveredWeight += weight;
    });

    // MF beta from advanced_stats
    let upCapture = 0, downCapture = 0, captureCnt = 0;
    mfHoldings.forEach(h => {
      const mf = allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
      if (!mf) return;
      const val = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
      const weight = totalValue > 0 ? val / totalValue : 0;
      let beta = 1.0;
      const detail = mfDetails[h.slug];
      if (detail?.advanced_stats) {
        const stats = typeof detail.advanced_stats === 'string' ? JSON.parse(detail.advanced_stats) : detail.advanced_stats;
        const betaStat = stats?.find?.((s: any) => s.type?.toLowerCase()?.includes('beta'));
        if (betaStat?.stat_1y) beta = parseFloat(betaStat.stat_1y);
      }
      if (mf.category?.toLowerCase()?.includes('debt') || mf.category?.toLowerCase()?.includes('liquid')) beta = 0.2;
      weightedBeta += beta * weight;
      coveredWeight += weight;

      // Capture ratios from capture_ratios.parquet
      const cr = captureRatiosData?.find?.((c: any) => c.search_id === (mf.search_id || mf.scheme_code || mf.direct_search_id));
      if (cr) {
        upCapture += (cr.up_1Y || 100) * weight;
        downCapture += (cr.down_1Y || 100) * weight;
        captureCnt++;
      }
    });

    const portfolioBeta = coveredWeight > 0 ? weightedBeta / coveredWeight : 1.0;

    // 95% Weekly VaR (parametric) = Portfolio Value × Beta × Weekly Market Sigma × Z(95%)
    // Using Nifty historical weekly sigma ≈ 2.5%, Z(95%) = 1.645
    const weeklyVaR = totalValue * portfolioBeta * 0.025 * 1.645;

    return {
      beta: parseFloat(portfolioBeta.toFixed(2)),
      var95: Math.round(weeklyVaR),
      upCapture: captureCnt > 0 ? parseFloat((upCapture / (captureCnt > 0 ? coveredWeight : 1)).toFixed(0)) : null,
      downCapture: captureCnt > 0 ? parseFloat((downCapture / (captureCnt > 0 ? coveredWeight : 1)).toFixed(0)) : null,
      defensiveRating: portfolioBeta < 0.8 ? 'Strong' : portfolioBeta < 1.1 ? 'Moderate' : 'Weak',
    };
  }, [stockHoldings, mfHoldings, allStocks, allMFs, mfDetails, captureRatiosData, totalValue]);

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

    // Use Nifty P/E as benchmark (from any stock's sector data)
    stockHoldings.forEach(h => {
      const detail = batchStockData?.[h.slug];
      const sectorPe = detail?.absolute?.sectorPe || detail?.absolute?.industryPe;
      if (sectorPe && parseFloat(sectorPe) > 0) {
        sectorPeSum += parseFloat(sectorPe);
        sectorPeCount++;
      }
    });

    const aggPE = peCoveredWeight > 0 ? weightedPE / peCoveredWeight : 0;
    const benchmarkPE = sectorPeCount > 0 ? sectorPeSum / sectorPeCount : 22.5; // Nifty long-term avg
    const pePremium = benchmarkPE > 0 ? ((aggPE - benchmarkPE) / benchmarkPE) * 100 : 0;
    const aggYield = yieldCoveredWeight > 0 ? weightedDivYield / yieldCoveredWeight : 0;
    const projectedAnnualYield = totalValue * (aggYield / 100);

    return {
      aggPE: parseFloat(aggPE.toFixed(1)),
      benchmarkPE: parseFloat(benchmarkPE.toFixed(1)),
      pePremium: parseFloat(pePremium.toFixed(1)),
      aggYield: parseFloat(aggYield.toFixed(2)),
      projectedYield: Math.round(projectedAnnualYield),
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
          <button 
            onClick={() => setIsAiModalOpen(true)}
            className="px-6 py-2.5 bg-indigo-500 text-white font-bold rounded-lg hover:bg-indigo-600 transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
          >
            <BrainCircuit size={18} />
            CIO AI Analysis
          </button>
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
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={14} />
                <input 
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
                  onFocus={() => setIsOpen(true)}
                  onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                  placeholder={activeTab === 'STOCKS' ? "Ticker..." : "Fund..."}
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-canvas border border-border rounded-md text-text-primary focus:outline-none focus:border-alpha"
                />
              </div>
              {isOpen && filtered.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-surface border border-border rounded-md shadow-xl overflow-hidden z-50">
                  {filtered.map((item: any) => {
                    const slug = activeTab === 'STOCKS' ? item.slug : (item.scheme_code || item.direct_search_id);
                    const title = activeTab === 'STOCKS' ? item.ticker : (item.fund_name || item.scheme_name);
                    const subtitle = activeTab === 'STOCKS' ? item.name : item.category;
                    return (
                      <div 
                        key={slug}
                        className="px-3 py-2 hover:bg-surface-hover cursor-pointer border-b border-border last:border-0"
                        onMouseDown={() => {
                          setQuery(title);
                          setIsOpen(false);
                        }}
                      >
                        <div className="font-bold text-text-primary text-xs">{title}</div>
                        <div className="text-[10px] text-text-secondary truncate">{subtitle}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-[10px] text-text-secondary font-bold uppercase mb-1 tracking-widest">{activeTab === 'STOCKS' ? 'UNITS/SHARES' : 'HOLDING VALUE (₹)'}</label>
                <input 
                  type="number"
                  value={unitsInput}
                  onChange={e => setUnitsInput(e.target.value)}
                  placeholder={activeTab === 'STOCKS' ? "e.g. 100" : "e.g. 15000"}
                  className="w-full px-3 py-1.5 text-sm bg-canvas border border-border rounded-md text-text-primary focus:outline-none focus:border-alpha"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const s = filtered.find((st: any) => {
                        const title = activeTab === 'STOCKS' ? st.ticker : (st.fund_name || st.scheme_name);
                        return title === query || st.slug === query || (st.scheme_code || st.direct_search_id) === query;
                      });
                      if (s) addAsset(activeTab === 'STOCKS' ? s.slug : (s.scheme_code || s.direct_search_id));
                    }
                  }}
                />
              </div>
              <button 
                onClick={() => {
                  const s = filtered.find((st: any) => {
                    const title = activeTab === 'STOCKS' ? st.ticker : (st.fund_name || st.scheme_name);
                    return title === query || st.slug === query || (st.scheme_code || st.direct_search_id) === query;
                  });
                  if (s) addAsset(activeTab === 'STOCKS' ? s.slug : (s.scheme_code || s.direct_search_id));
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
                          <Pie data={mfsPie} innerRadius={22} outerRadius={32} paddingAngle={2} dataKey="value" stroke="none">
                            {mfsPie.map((_e, i) => <Cell key={i} fill={COLORS[(i+2) % COLORS.length]} />)}
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
                    const mf = allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
                    title = mf?.fund_name || mf?.scheme_name || h.slug;
                    tickerForLogo = h.slug;
                    logoUrlForMF = mf?.logo_url;
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
                      <button onClick={() => removeAsset(h.slug, activeTab)} className="absolute top-2 right-2 text-text-secondary hover:text-beta opacity-0 group-hover:opacity-100 transition-all z-10">
                        <X size={12} />
                      </button>
                      
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          {logoUrlForMF 
                            ? <img src={logoUrlForMF} alt="AMC Logo" className="w-8 h-8 rounded-full bg-white object-contain border border-border shrink-0" />
                            : <StockLogo ticker={tickerForLogo} name={title} className="w-8 h-8 rounded-full shrink-0" />
                          }
                          <div className="flex flex-col gap-0.5">
                             <span className="font-bold text-text-primary text-sm truncate max-w-[240px] pr-4">{title}</span>
                             <span className="text-[10px] text-text-secondary">{activeTab === 'STOCKS' ? h.units : h.units.toFixed(2)} Units • ₹{price.toLocaleString(undefined, {maximumFractionDigits: 2})} • {weight}%</span>
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-end shrink-0 pr-4 group-hover:pr-6 transition-all">
                           <span className="font-mono text-sm font-bold tabular-nums text-white">₹{val.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                           <span className={`text-[10px] font-bold ${isPositive ? 'text-alpha' : 'text-beta'}`}>
                             {isPositive ? '+' : ''}{dayAmt.toFixed(2)} ({isPositive ? '+' : ''}{dayPct.toFixed(2)}%)
                           </span>
                        </div>
                      </div>
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
                 {chartMode === 'alpha' && <><Crosshair size={12} className="text-indigo-400" /> Alpha-Risk X-Ray</>}
                 {chartMode === 'stress' && <><Waves size={12} className="text-amber-400" /> Macro Stress Test</>}
                 {chartMode === 'shap' && <><BarChart3 size={12} className="text-emerald-400" /> Factor Attribution</>}
                 {chartMode === 'drawdown' && <><TrendingDown size={12} className="text-red-400" /> Drawdown Profile</>}
               </span>
               <div className="flex bg-surface rounded-md p-0.5 border border-border gap-0.5">
                 {[
                   { key: 'alpha' as const, label: 'X-Ray', color: 'indigo' },
                   { key: 'stress' as const, label: 'Stress', color: 'amber' },
                   { key: 'shap' as const, label: 'SHAP', color: 'emerald' },
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
               ) : chartMode === 'alpha' ? (
                 /* Alpha-Risk Scatter Plot */
                 <ResponsiveContainer width="100%" height="100%">
                   <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                     <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                     <XAxis type="number" dataKey="risk" name="Risk" stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'Risk (Volatility)', position: 'bottom', offset: 5, style: { fontSize: 10, fill: '#64748b' } }} />
                     <YAxis type="number" dataKey="alpha" name="Alpha" stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'Alpha Score', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#64748b' } }} />
                     <ZAxis type="number" dataKey="value" range={[40, 400]} />
                     <RechartsTooltip
                       content={({ active, payload }: any) => {
                         if (!active || !payload?.length) return null;
                         const d = payload[0].payload;
                         return (
                           <div className="bg-[#1e222d] border border-[#2a2e39] p-2.5 rounded-lg text-xs">
                             <div className="font-bold text-white mb-1">{d.name}</div>
                             <div className="text-text-secondary">{d.industry}</div>
                             <div className="mt-1.5 flex flex-col gap-0.5">
                               <span>Risk: <b className="text-white">{d.risk}</b></span>
                               <span>Alpha: <b className={d.alpha >= 50 ? 'text-alpha' : 'text-beta'}>{d.alpha}</b></span>
                               <span>Value: <b className="text-white">₹{d.value.toLocaleString(undefined, {maximumFractionDigits: 0})}</b></span>
                             </div>
                           </div>
                         );
                       }}
                     />
                     <Scatter data={scatterData.filter(d => d.type === 'stock')} fill="#8b5cf6" fillOpacity={0.7} name="Stocks" />
                     <Scatter data={scatterData.filter(d => d.type === 'fund')} fill="#06b6d4" fillOpacity={0.7} name="Funds" />
                     {/* Quadrant reference lines */}
                     <ReferenceLine y={50} stroke="#64748b" strokeDasharray="5 5" strokeOpacity={0.3} />
                     <ReferenceLine x={50} stroke="#64748b" strokeDasharray="5 5" strokeOpacity={0.3} />
                   </ScatterChart>
                 </ResponsiveContainer>
               ) : chartMode === 'stress' ? (
                 /* Macro Stress-Test */
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={stressTestData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }} layout="vertical">
                     <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                     <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'Projected Impact (%)', position: 'bottom', offset: 5, style: { fontSize: 10, fill: '#64748b' } }} />
                     <YAxis type="category" dataKey="event" stroke="#64748b" tick={{ fontSize: 10 }} width={90} />
                     <RechartsTooltip
                       contentStyle={{ backgroundColor: '#1e222d', borderColor: '#2a2e39', fontSize: 11 }}
                       formatter={(val: any, name: any) => [`${val}%`, name === 'stocks' ? 'Stocks Impact' : name === 'funds' ? 'Funds Buffer' : 'Benchmark']}
                     />
                     <Bar dataKey="stocks" fill="#ef4444" fillOpacity={0.8} name="Stocks" radius={[0, 4, 4, 0]} />
                     <Bar dataKey="funds" fill="#06b6d4" fillOpacity={0.8} name="Funds" radius={[0, 4, 4, 0]} />
                     <Bar dataKey="benchmark" fill="#64748b" fillOpacity={0.4} name="Benchmark" radius={[0, 4, 4, 0]} />
                   </BarChart>
                 </ResponsiveContainer>
               ) : chartMode === 'shap' ? (
                 /* SHAP Factor Waterfall */
                 shapWaterfallData.length > 0 ? (
                   <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={shapWaterfallData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }} layout="vertical">
                       <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                       <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'Weighted Alpha Impact', position: 'bottom', offset: 5, style: { fontSize: 10, fill: '#64748b' } }} />
                       <YAxis type="category" dataKey="name" stroke="#64748b" tick={{ fontSize: 9 }} width={100} />
                       <RechartsTooltip
                         contentStyle={{ backgroundColor: '#1e222d', borderColor: '#2a2e39', fontSize: 11 }}
                         formatter={(val: any, _name: any, entry: any) => [`Impact: ${val}`, `Appears in ${entry.payload.count} holdings`]}
                       />
                       <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
                         {shapWaterfallData.map((entry, i) => (
                           <Cell key={i} fill={entry.impact >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.8} />
                         ))}
                       </Bar>
                       <ReferenceLine x={0} stroke="#64748b" strokeOpacity={0.5} />
                     </BarChart>
                   </ResponsiveContainer>
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center text-text-secondary/50">
                     <BarChart3 size={48} className="mb-3 opacity-20" />
                     <p className="text-xs">Add stock holdings to see SHAP factor attribution</p>
                   </div>
                 )
               ) : (
                 /* Drawdown Profile */
                 drawdownData.length > 0 ? (
                   <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={drawdownData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                       <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                       <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9 }} tickFormatter={(d: string) => { const parts = d.split('-'); return parts.length >= 2 ? `${parts[1]}/${parts[0]?.slice(2)}` : d; }} />
                       <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={['auto', 0]} label={{ value: 'Drawdown %', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#64748b' } }} />
                       <RechartsTooltip
                         contentStyle={{ backgroundColor: '#1e222d', borderColor: '#2a2e39', fontSize: 11 }}
                         formatter={(val: any, name: any) => [`${val}%`, name === 'portfolio' ? 'Portfolio' : 'Nifty 50']}
                       />
                       <ReferenceLine y={0} stroke="#64748b" strokeOpacity={0.3} />
                       <Area type="monotone" dataKey="portfolio" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} name="portfolio" />
                       <Area type="monotone" dataKey="benchmark" stroke="#64748b" fill="#64748b" fillOpacity={0.05} strokeWidth={1} strokeDasharray="4 4" name="benchmark" />
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
                         <span className="text-[8px] text-amber-400/80 flex items-center gap-0.5"><AlertTriangle size={8} /> Overlap detected</span>
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
                     <span className="text-lg font-bold font-mono text-beta">₹{defenseMetrics.var95.toLocaleString()}</span>
                     <span className="text-[8px] text-text-secondary block mt-0.5">Max expected weekly loss (95% confidence)</span>
                   </div>
                   {/* Beta */}
                   <div className="flex gap-2">
                     <div className="flex-1 p-2 bg-surface/50 rounded border border-border">
                       <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Portfolio β</span>
                       <span className={`text-base font-bold font-mono ${defenseMetrics.beta > 1.1 ? 'text-beta' : defenseMetrics.beta < 0.8 ? 'text-alpha' : 'text-text-primary'}`}>{defenseMetrics.beta}</span>
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
                     <div className="flex-1 p-1.5 bg-surface/50 rounded border border-border text-center">
                       <span className="text-[8px] text-text-secondary uppercase font-bold block">Portfolio P/E</span>
                       <span className="text-xs font-bold font-mono text-text-primary">{yieldValuation.aggPE}x</span>
                     </div>
                     <div className="flex-1 p-1.5 bg-surface/50 rounded border border-border text-center">
                       <span className="text-[8px] text-text-secondary uppercase font-bold block">Sector Avg P/E</span>
                       <span className="text-xs font-bold font-mono text-text-secondary">{yieldValuation.benchmarkPE}x</span>
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
