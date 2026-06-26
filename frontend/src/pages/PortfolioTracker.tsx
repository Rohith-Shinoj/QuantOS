import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks, fetchMutualFunds, fetchPortfolioAIAnalysis, sendPortfolioChat, type PortfolioHolding } from '../api';
import { Search, X, PieChart as PieChartIcon, BrainCircuit, AlertTriangle, Send, Loader2, Globe, Zap, List, Activity } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import ReactMarkdown from 'react-markdown';

export const PortfolioTracker = ({ isPanel = false }: { isPanel?: boolean }) => {
  const [activeTab, setActiveTab] = useState<'STOCKS' | 'MUTUAL_FUNDS'>('STOCKS');
  
  const [stockHoldings, setStockHoldings] = useState<PortfolioHolding[]>(() => {
    const saved = localStorage.getItem('portfolio_stock_holdings');
    return saved ? JSON.parse(saved) : [];
  });
  const [mfHoldings, setMfHoldings] = useState<PortfolioHolding[]>(() => {
    const saved = localStorage.getItem('portfolio_mf_holdings');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [amountInput, setAmountInput] = useState<string>('');
  
  const [stockRiskTolerance, setStockRiskTolerance] = useState<string>(() => localStorage.getItem('portfolio_stock_risk') || 'Moderate');
  const [mfRiskTolerance, setMfRiskTolerance] = useState<string>(() => localStorage.getItem('portfolio_mf_risk') || 'Moderate');
  const [holdingPeriod, setHoldingPeriod] = useState<string>(() => localStorage.getItem('portfolio_holding_period') || 'Long Term');
  
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
    const amt = parseFloat(amountInput);
    if (!amt || isNaN(amt) || amt <= 0) return;
    
    if (activeTab === 'STOCKS') {
      setStockHoldings([...stockHoldings, { slug, amount: amt }]);
    } else {
      setMfHoldings([...mfHoldings, { slug, amount: amt }]);
    }
    
    setQuery('');
    setAmountInput('');
    setIsOpen(false);
  };

  const removeAsset = (slug: string, type: 'STOCKS' | 'MUTUAL_FUNDS') => {
    if (type === 'STOCKS') {
      setStockHoldings(stockHoldings.filter(h => h.slug !== slug));
    } else {
      setMfHoldings(mfHoldings.filter(h => h.slug !== slug));
    }
  };

  const totalValue = stockHoldings.reduce((sum, h) => sum + h.amount, 0) + mfHoldings.reduce((sum, h) => sum + h.amount, 0);
  const totalAssets = stockHoldings.length + mfHoldings.length;

  const pieData = useMemo(() => {
    const data: any[] = [];
    if (allStocks) {
      stockHoldings.forEach(h => {
        const stock = allStocks.find((s: any) => s.slug === h.slug);
        data.push({ name: stock?.ticker || h.slug, value: h.amount, fullName: stock?.name || h.slug });
      });
    }
    if (allMFs) {
      mfHoldings.forEach(h => {
        const mf = allMFs.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
        data.push({ name: (mf?.fund_name || mf?.scheme_name || h.slug).substring(0, 15) + '...', value: h.amount, fullName: mf?.fund_name || h.slug });
      });
    }
    return data.sort((a, b) => b.value - a.value);
  }, [stockHoldings, mfHoldings, allStocks, allMFs]);

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#64748b'];

  const handleAnalyze = async () => {
    if (totalAssets === 0) return;
    setIsAnalyzing(true);
    setAiError(null);
    try {
      const result = await fetchPortfolioAIAnalysis({
        stockHoldings,
        mfHoldings,
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
      const res = await sendPortfolioChat({
        stockHoldings,
        mfHoldings,
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
  }, [chatHistory, isChatting]);

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
        <div>
          <h2 className="text-3xl font-bold text-text-primary">Portfolio Analyzer</h2>
          <p className="text-text-secondary mt-1">Dual-approach financial data aggregation powered by Chief Investment Officer AI.</p>
        </div>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-2 ${isPanel ? 'gap-4 h-full' : 'gap-6'} min-h-0`}>
        {/* Left: Inputs & Visual Data */}
        <div className={`bg-surface rounded-lg border border-border flex flex-col min-h-0 ${isPanel ? 'p-4 gap-4' : 'p-6 gap-6'} overflow-y-auto hide-scrollbar`}>
          
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
              Mutual Funds
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1 relative">
                <label className="block text-xs text-text-secondary font-bold uppercase mb-2 tracking-widest">Search {activeTab === 'STOCKS' ? 'Stock' : 'Mutual Fund'}</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
                  <input 
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                    placeholder={activeTab === 'STOCKS' ? "Search ticker..." : "Search fund..."}
                    className="w-full pl-10 pr-4 py-2 bg-canvas border border-border rounded-md text-text-primary focus:outline-none focus:border-alpha"
                  />
                </div>
                {isOpen && filtered.length > 0 && (
                  <div className="absolute top-full mt-2 w-full bg-surface border border-border rounded-md shadow-xl overflow-hidden z-50">
                    {filtered.map((item: any) => {
                      const slug = activeTab === 'STOCKS' ? item.slug : (item.scheme_code || item.direct_search_id);
                      const title = activeTab === 'STOCKS' ? item.ticker : (item.fund_name || item.scheme_name);
                      const subtitle = activeTab === 'STOCKS' ? item.name : item.category;
                      return (
                        <div 
                          key={slug}
                          className="px-4 py-3 hover:bg-surface-hover cursor-pointer border-b border-border last:border-0"
                          onMouseDown={() => {
                            setQuery(title);
                            setIsOpen(false);
                          }}
                        >
                          <div className="font-bold text-text-primary">{title}</div>
                          <div className="text-xs text-text-secondary truncate">{subtitle}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="w-1/3">
                <label className="block text-xs text-text-secondary font-bold uppercase mb-2 tracking-widest">Amount (INR)</label>
                <input 
                  type="number"
                  value={amountInput}
                  onChange={e => setAmountInput(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full px-4 py-2 bg-canvas border border-border rounded-md text-text-primary focus:outline-none focus:border-alpha"
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
                className="px-6 py-2 h-10 bg-surface-hover border border-border rounded-md font-bold hover:bg-border transition-colors text-sm"
              >
                Add
              </button>
            </div>
          </div>

          <div className="h-px bg-border w-full my-2"></div>

          {totalAssets > 0 ? (
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-center bg-canvas p-4 rounded-lg border border-border">
                <div className="flex flex-col">
                  <span className="text-xs text-text-secondary font-bold uppercase tracking-widest">Total Value</span>
                  <span className="text-2xl font-bold text-text-primary">₹{totalValue.toLocaleString()}</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-xs text-text-secondary font-bold uppercase tracking-widest">Total Holdings</span>
                  <span className="text-xl font-bold text-alpha">{totalAssets} Assets</span>
                </div>
              </div>

              <div className="h-[250px] w-full bg-canvas rounded-lg border border-border p-4 flex flex-col">
                <span className="text-xs text-text-secondary font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                  <PieChartIcon size={14} /> Overall Allocation
                </span>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((_entry, index) => (
                         <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#1e222d', borderColor: '#2a2e39', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                      formatter={(val: any) => [`₹${Number(val).toLocaleString()}`, 'Value']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs text-text-secondary font-bold uppercase tracking-widest mt-2">{activeTab} HOLDINGS</span>
                {currentHoldings.length === 0 && (
                  <div className="text-sm text-text-secondary text-center py-4">No {activeTab.toLowerCase()} added yet.</div>
                )}
                {currentHoldings.map((h, i) => {
                  let title = h.slug;
                  if (activeTab === 'STOCKS') {
                    const stock = allStocks?.find((s: any) => s.slug === h.slug);
                    title = stock?.ticker || h.slug;
                  } else {
                    const mf = allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
                    title = mf?.fund_name || mf?.scheme_name || h.slug;
                  }

                  const weight = ((h.amount / totalValue) * 100).toFixed(1);
                  return (
                    <div key={h.slug} className="flex justify-between items-center p-3 rounded bg-canvas border border-border group hover:border-alpha/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                        <div className="flex flex-col">
                          <span className="font-bold text-text-primary text-sm truncate max-w-[200px]">{title}</span>
                          <span className="text-xs text-text-secondary">{weight}% of Total Portfolio</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="font-mono text-sm">₹{h.amount.toLocaleString()}</span>
                        <button onClick={() => removeAsset(h.slug, activeTab)} className="text-text-secondary hover:text-beta opacity-0 group-hover:opacity-100 transition-all">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-text-secondary p-8 text-center border border-dashed border-border rounded-lg bg-canvas/50">
              <PieChartIcon size={48} className="mb-4 opacity-20" />
              <p>Add assets and monetary values to build your portfolio.</p>
            </div>
          )}
        </div>

        {/* Right: AI Panel & Chat */}
        <div className={`bg-surface rounded-lg border border-indigo-500/30 flex flex-col min-h-0 relative overflow-hidden shadow-[0_0_30px_rgba(99,102,241,0.05)]`}>
          {/* Solid Header to prevent scroll overlap */}
          <div className="absolute top-0 left-0 right-0 bg-surface border-b border-border z-10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-bold text-indigo-400">
                <BrainCircuit size={18} /> Chief Investment Officer AI
              </div>
              {totalAssets > 0 && (
                <button 
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="px-4 py-1.5 bg-indigo-500 text-white text-xs font-bold rounded hover:bg-indigo-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Analyze Portfolio
                </button>
              )}
            </div>
            {totalAssets > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 bg-canvas px-2 py-1 rounded border border-border">
                  <span className="text-[10px] text-text-secondary font-bold uppercase">Stock Risk</span>
                  <select value={stockRiskTolerance} onChange={e => setStockRiskTolerance(e.target.value)} className="bg-transparent text-xs text-text-primary focus:outline-none">
                    <option>Conservative</option><option>Moderate</option><option>Aggressive</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-canvas px-2 py-1 rounded border border-border">
                  <span className="text-[10px] text-text-secondary font-bold uppercase">MF Risk</span>
                  <select value={mfRiskTolerance} onChange={e => setMfRiskTolerance(e.target.value)} className="bg-transparent text-xs text-text-primary focus:outline-none">
                    <option>Conservative</option><option>Moderate</option><option>Aggressive</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-canvas px-2 py-1 rounded border border-border ml-auto">
                  <span className="text-[10px] text-text-secondary font-bold uppercase">Horizon</span>
                  <select value={holdingPeriod} onChange={e => setHoldingPeriod(e.target.value)} className="bg-transparent text-xs text-text-primary focus:outline-none">
                    <option>Short Term</option><option>Long Term</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pt-[110px] pb-20 px-6 hide-scrollbar flex flex-col">
            {aiError && (
              <div className="bg-beta/10 border border-beta/30 text-beta text-xs p-3 mt-6 rounded flex justify-between items-center">
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
                 <p className="text-sm">Click Analyze Portfolio to generate a unified institutional report.</p>
               </div>
            )}
            
            {isAnalyzing && !aiAnalysis && (
               <div className="flex-1 flex flex-col items-center justify-center text-indigo-400">
                 <Loader2 size={48} className="mb-4 animate-spin opacity-50" />
                 <p className="text-sm animate-pulse">Running advanced unified risk modeling...</p>
               </div>
            )}

            {aiAnalysis && (
              <div className="py-6 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Score & Verdict Card */}
                <div className="p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-xl flex flex-col gap-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full translate-x-10 -translate-y-10"></div>
                  <div className="flex justify-between items-start z-10 gap-6">
                    <div className="flex-1">
                      <span className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase mb-3 block">Strategic Verdict</span>
                      <div className="prose prose-invert prose-indigo max-w-none text-sm md:text-base leading-relaxed [&>p]:mb-4 last:[&>p]:mb-0 [&>ul]:list-disc [&>ul]:ml-5 [&>h3]:text-lg [&>h3]:font-bold [&>h3]:mt-4 [&>h3]:mb-2 [&>strong]:text-white">
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
                  <div className="flex items-center gap-2 text-xs font-bold bg-canvas w-fit px-3 py-1.5 rounded-full border border-border">
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
                           <span className="font-bold text-white text-right w-1/2 text-xs leading-tight" title={m.impact}>{m.impact}</span>
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
                           <span className="font-bold text-text-primary">{plan.asset}</span>
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
              <div className="flex flex-col gap-4 mt-6 pt-6 border-t border-border">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`text-xs font-bold mb-1 opacity-50 ${msg.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                      {msg.role === 'user' ? 'You' : 'CIO AI'}
                    </div>
                    <div className={`p-3 rounded-xl max-w-[85%] text-sm ${
                      msg.role === 'user' 
                        ? 'bg-alpha/10 border border-alpha/20 text-text-primary rounded-tr-sm' 
                        : 'bg-surface border border-border text-text-secondary rounded-tl-sm'
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
                    <div className="p-3 rounded-xl bg-surface border border-border rounded-tl-sm text-text-secondary flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-100"></div>
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-200"></div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
            
            {/* AI Footnote */}
            {(aiAnalysis || chatHistory.length > 0) && (
              <div className="mt-8 text-[10px] text-text-secondary/50 text-center px-4 leading-relaxed">
                Recommendations involve a hybrid analysis of real metrics and AI output which may be prone to hallucinations. This is not investment advice, always consult your registered investment advisor.
              </div>
            )}
          </div>

          {/* Persistent Chat Input */}
          <div className="absolute bottom-0 left-0 right-0 bg-surface p-4 border-t border-border z-20">
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
                className="w-full pl-4 pr-12 py-3 bg-canvas border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
              />
              <button 
                onClick={handleSendChat}
                disabled={!aiAnalysis || isChatting || !chatInput.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
