import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks, fetchMutualFunds, fetchPortfolioAIAnalysis, sendPortfolioChat } from '../api';
import { Search, X, PieChart as PieChartIcon, BrainCircuit, AlertTriangle, Send, Loader2, Globe, Zap, List, Activity, Maximize2, Minimize2, TrendingUp, TrendingDown } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
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

        {/* Right: Rest of UI (2/3rds width) */}
        <div className={`lg:col-span-2 bg-surface rounded-lg border border-border flex flex-col p-6 gap-6 min-h-0 relative`}>
           {/* Chart Area */}
           <div className="flex-1 border border-dashed border-border/50 rounded-lg bg-surface-hover/10 flex items-center justify-center text-text-secondary font-bold tracking-widest text-xs uppercase relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-t from-canvas to-transparent opacity-20 pointer-events-none"></div>
             Chart Placeholder
           </div>
           
           {/* Cards Area */}
           <div className="h-[200px] lg:h-1/3 flex gap-4">
             <div className="flex-1 border border-dashed border-border/50 rounded-lg bg-surface-hover/10 flex items-center justify-center text-text-secondary font-bold tracking-widest text-[10px] uppercase">
               Card Placeholder 1
             </div>
             <div className="flex-1 border border-dashed border-border/50 rounded-lg bg-surface-hover/10 flex items-center justify-center text-text-secondary font-bold tracking-widest text-[10px] uppercase">
               Card Placeholder 2
             </div>
             <div className="flex-1 border border-dashed border-border/50 rounded-lg bg-surface-hover/10 flex items-center justify-center text-text-secondary font-bold tracking-widest text-[10px] uppercase">
               Card Placeholder 3
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
