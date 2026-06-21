import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks, fetchPortfolioAIAnalysis, sendPortfolioChat, type PortfolioHolding } from '../api';
import { Search, X, PieChart as PieChartIcon, BrainCircuit, AlertTriangle, Send, Loader2, ChevronRight, Activity, Globe, Zap, List } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

export const PortfolioTracker = ({ isPanel = false }: { isPanel?: boolean }) => {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [amountInput, setAmountInput] = useState<string>('');
  const [riskTolerance, setRiskTolerance] = useState<string>('Moderate');
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: string, content: string}[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: allStocks } = useQuery({ queryKey: ['allStocks'], queryFn: fetchAllStocks });

  const filtered = query.length > 0 && allStocks 
    ? allStocks.filter((s: any) => 
        !holdings.find(h => h.slug === s.slug) && 
        ((s.ticker && s.ticker.toLowerCase().includes(query.toLowerCase())) || 
         (s.name && s.name.toLowerCase().includes(query.toLowerCase())))
      ).slice(0, 8)
    : [];

  const addStock = (slug: string) => {
    const amt = parseFloat(amountInput);
    if (!amt || isNaN(amt) || amt <= 0) return;
    setHoldings([...holdings, { slug, amount: amt }]);
    setQuery('');
    setAmountInput('');
    setIsOpen(false);
  };

  const removeStock = (slug: string) => {
    setHoldings(holdings.filter(h => h.slug !== slug));
  };

  const totalValue = holdings.reduce((sum, h) => sum + h.amount, 0);

  const pieData = useMemo(() => {
    if (!allStocks) return [];
    return holdings.map(h => {
      const stock = allStocks.find((s: any) => s.slug === h.slug);
      return {
        name: stock?.ticker || h.slug,
        value: h.amount,
        fullName: stock?.name || h.slug
      };
    }).sort((a, b) => b.value - a.value);
  }, [holdings, allStocks]);

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#64748b'];

  const handleAnalyze = async () => {
    if (holdings.length === 0) return;
    setIsAnalyzing(true);
    try {
      const result = await fetchPortfolioAIAnalysis(holdings, riskTolerance);
      setAiAnalysis(result);
    } catch (err) {
      console.error("AI Analysis failed", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || holdings.length === 0) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    const newHistory = [...chatHistory, { role: 'user', content: userMsg }];
    setChatHistory(newHistory);
    setIsChatting(true);
    try {
      const res = await sendPortfolioChat(holdings, riskTolerance, userMsg, chatHistory);
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
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <label className="block text-xs text-text-secondary font-bold uppercase mb-2 tracking-widest">Search Asset</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
                  <input 
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                    placeholder="Search ticker..."
                    className="w-full pl-10 pr-4 py-2 bg-canvas border border-border rounded-md text-text-primary focus:outline-none focus:border-alpha"
                  />
                </div>
                {isOpen && filtered.length > 0 && (
                  <div className="absolute top-full mt-2 w-full bg-surface border border-border rounded-md shadow-xl overflow-hidden z-50">
                    {filtered.map((stock: any) => (
                      <div 
                        key={stock.slug}
                        className="px-4 py-3 hover:bg-surface-hover cursor-pointer border-b border-border last:border-0"
                        onMouseDown={() => {
                          setQuery(stock.ticker);
                          setIsOpen(false);
                        }}
                      >
                        <div className="font-bold text-text-primary">{stock.ticker}</div>
                        <div className="text-xs text-text-secondary truncate">{stock.name}</div>
                      </div>
                    ))}
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
                      const s = allStocks?.find((st: any) => st.ticker === query || st.slug === query);
                      if (s) addStock(s.slug);
                    }
                  }}
                />
              </div>
            </div>
            
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-xs text-text-secondary font-bold uppercase mb-2 tracking-widest">Risk Tolerance</label>
                <select 
                  value={riskTolerance}
                  onChange={e => setRiskTolerance(e.target.value)}
                  className="w-full px-4 py-2 bg-canvas border border-border rounded-md text-text-primary focus:outline-none focus:border-alpha appearance-none"
                >
                  <option>Conservative</option>
                  <option>Moderate</option>
                  <option>Aggressive</option>
                </select>
              </div>
              <button 
                onClick={() => {
                  const s = allStocks?.find((st: any) => st.ticker === query || st.slug === query);
                  if (s) addStock(s.slug);
                }}
                className="px-6 py-2 bg-surface-hover border border-border rounded-md font-bold hover:bg-border transition-colors text-sm"
              >
                Add
              </button>
            </div>
          </div>

          <div className="h-px bg-border w-full my-2"></div>

          {holdings.length > 0 ? (
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-center bg-canvas p-4 rounded-lg border border-border">
                <div className="flex flex-col">
                  <span className="text-xs text-text-secondary font-bold uppercase tracking-widest">Total Value</span>
                  <span className="text-2xl font-bold text-text-primary">₹{totalValue.toLocaleString()}</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-xs text-text-secondary font-bold uppercase tracking-widest">Holdings</span>
                  <span className="text-xl font-bold text-alpha">{holdings.length} Assets</span>
                </div>
              </div>

              <div className="h-[250px] w-full bg-canvas rounded-lg border border-border p-4 flex flex-col">
                <span className="text-xs text-text-secondary font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                  <PieChartIcon size={14} /> Allocation
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
                {holdings.map((h, i) => {
                  const stock = allStocks?.find((s: any) => s.slug === h.slug);
                  const weight = ((h.amount / totalValue) * 100).toFixed(1);
                  return (
                    <div key={h.slug} className="flex justify-between items-center p-3 rounded bg-canvas border border-border group hover:border-alpha/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                        <div className="flex flex-col">
                          <span className="font-bold text-text-primary">{stock?.ticker || h.slug}</span>
                          <span className="text-xs text-text-secondary">{weight}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-sm">₹{h.amount.toLocaleString()}</span>
                        <button onClick={() => removeStock(h.slug)} className="text-text-secondary hover:text-beta opacity-0 group-hover:opacity-100 transition-all">
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
          {/* Glass Header */}
          <div className="absolute top-0 left-0 right-0 h-14 bg-surface/80 backdrop-blur-md border-b border-border z-10 flex items-center justify-between px-6">
            <div className="flex items-center gap-2 font-bold text-indigo-400">
              <BrainCircuit size={18} /> Chief Investment Officer AI
            </div>
            {holdings.length > 0 && (
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

          <div className="flex-1 overflow-y-auto pt-14 pb-20 px-6 hide-scrollbar flex flex-col">
            {!aiAnalysis && !isAnalyzing && (
               <div className="flex-1 flex flex-col items-center justify-center text-indigo-400/50">
                 <BrainCircuit size={64} className="mb-4 opacity-20" />
                 <p className="text-sm">Click Analyze Portfolio to generate an institutional report.</p>
               </div>
            )}
            
            {isAnalyzing && !aiAnalysis && (
               <div className="flex-1 flex flex-col items-center justify-center text-indigo-400">
                 <Loader2 size={48} className="mb-4 animate-spin opacity-50" />
                 <p className="text-sm animate-pulse">Running advanced risk modeling...</p>
               </div>
            )}

            {aiAnalysis && (
              <div className="py-6 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Score & Verdict Card */}
                <div className="p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-xl flex flex-col gap-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full translate-x-10 -translate-y-10"></div>
                  <div className="flex justify-between items-start z-10">
                    <div>
                      <span className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase">Strategic Verdict</span>
                      <h3 className="text-lg font-bold text-white mt-1 leading-snug">{aiAnalysis.strategic_verdict}</h3>
                    </div>
                    <div className="flex flex-col items-end">
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
                           <span className="font-bold text-white text-right max-w-[50%] truncate" title={m.impact}>{m.impact}</span>
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
                      {msg.content}
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
