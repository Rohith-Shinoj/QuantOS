import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../store/aiStore';
import { useAIStore } from '../store/aiStore';
import { useAgentStream } from '../hooks/useAgentStream';
import { Search, Loader2, AlertTriangle, ExternalLink, ShieldCheck, ShieldAlert, Cpu, SquarePen, X } from 'lucide-react';
import { InfoTooltip } from '../components/InfoTooltip';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, 
  LineChart, Line, CartesianGrid, ReferenceLine, ScatterChart, Scatter, ZAxis
} from 'recharts';
import ReactMarkdown from 'react-markdown';

const AI_Analysis_debug = false;

export const AIResearchDesk: React.FC = () => {
  const { 
    isProcessing, messages, activeTicker, setActiveTicker, clearWorkspace, 
    chatHistory, activeSessionId, loadSession, deleteSession 
  } = useAIStore();
  const { streamQuery } = useAgentStream();
  const [query, setQuery] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isProcessing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isProcessing) return;
    
    // Smart Ticker Extraction
    // Look for explicitly typed tickers (all caps, 3-10 chars), but ignore common acronyms
    const ignoreList = ['CAGR', 'ROE', 'ROCE', 'PEG', 'EBITDA', 'YOY', 'QOQ', 'EPS', 'PAT', 'P/E', 'P/B'];
    const words = query.split(/[\s,]+/);
    const foundTicker = words.find(w => /^[A-Z]{3,10}$/.test(w) && !ignoreList.includes(w));
    
    // If we didn't find an explicit ticker, maintain the existing activeTicker
    // If there is no activeTicker yet, default to "SCREEN" to represent a global database screen
    const newTicker = foundTicker || activeTicker || "SCREEN";
    
    if (newTicker !== activeTicker) {
      setActiveTicker(newTicker);
    }
    
    const currentQuery = query;
    setQuery('');
    await streamQuery(newTicker, currentQuery);
  };

  const handleNewChat = () => {
    clearWorkspace();
    setActiveTicker(null);
  };

  const renderSearchBar = (isHero: boolean) => (
    <div className={`w-full ${isHero ? 'max-w-3xl mx-auto' : 'bg-canvas border-t border-border p-4 sticky bottom-0 z-30'}`}>
      <form onSubmit={handleSubmit} className={`max-w-4xl mx-auto flex gap-4 ${isHero ? '' : 'items-center'}`}>
        {!isHero && (
          <button 
            type="button" 
            onClick={handleNewChat}
            className="p-3 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-full transition-colors"
            title="New Chat"
          >
            <SquarePen className="w-5 h-5" />
          </button>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary w-5 h-5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies, macro events, or ask a specific question. (e.g., Why did SBIN drop today?)..."
            className={`w-full bg-surface-hover border border-border rounded-2xl py-4 pl-12 pr-4 text-text-primary placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-inner ${isHero ? 'text-xs' : ''}`}
            disabled={isProcessing}
          />
        </div>
        <button
          type="submit"
          disabled={isProcessing || !query.trim()}
          className="px-8 bg-blue-600 hover:bg-blue-500 text-text-primary rounded-2xl font-medium transition-colors disabled:opacity-50 flex items-center"
        >
          {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
          {isProcessing ? 'Routing...' : 'Analyze'}
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas text-text-primary font-sans flex pt-16 relative overflow-hidden">
      
      {/* Sidebar - Chat History */}
      {chatHistory.length > 0 && (
        <div className="w-64 border-r border-border bg-[#0F0F0F] flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h2 className="text-xs font-bold text-text-secondary uppercase tracking-widest">Recent Chats</h2>
            <button 
              onClick={handleNewChat}
              className="text-text-secondary hover:text-text-primary hover:bg-surface-hover p-1.5 rounded transition-colors"
              title="New Chat"
            >
              <SquarePen className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {chatHistory.map((session) => (
              <div 
                key={session.id}
                onClick={() => loadSession(session.id)}
                className={`w-full text-left px-3 py-3 rounded-lg text-sm transition-all cursor-pointer group flex justify-between items-center ${
                  activeSessionId === session.id 
                    ? 'bg-indigo-500/10 border border-indigo-500/30 text-indigo-300' 
                    : 'hover:bg-surface-hover/50 text-text-secondary border border-transparent hover:border-border'
                }`}
              >
                <div className="truncate pr-2 flex-1 flex flex-col">
                  <span className="truncate">{session.title}</span>
                  {session.ticker && (
                    <span className="text-[10px] mt-1 font-mono uppercase text-text-secondary">{session.ticker}</span>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative h-[calc(100vh-64px)] overflow-hidden">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 -mt-20">
          <div className="flex items-center justify-center space-x-4 mb-8">
            <h1 className="text-4xl md:text-5xl font-light text-text-primary tracking-tight text-center">
              What would you like to analyze?
            </h1>
          </div>
          {renderSearchBar(true)}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
          <div className="flex-1 w-full max-w-5xl mx-auto p-6 space-y-12 pb-8">
            {messages.map((msg) => (
              <div key={msg.id} className="w-full">
                {msg.role === 'user' ? (
                  <div className="flex justify-end mb-4">
                    <div className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-100 px-5 py-3 rounded-2xl max-w-xl text-sm leading-relaxed shadow-[0_0_15px_rgba(79,70,229,0.1)]">
                      {msg.rawString}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col w-full">
                    <AssistantMessage payload={msg} />
                  </div>
                )}
              </div>
            ))}
            {messages.length > 0 && (
              <div className="mt-8 text-[10px] text-text-secondary text-center px-4 leading-relaxed">
                Recommendations involve a hybrid analysis of real metrics and AI output which may be prone to hallucinations. This is not investment advice, always consult your registered investment advisor.
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {renderSearchBar(false)}
        </div>
      )}
      </div>
    </div>
  );
};

// Component Router
const AssistantMessage = ({ payload }: { payload: ChatMessage }) => {
  const { parsedData, isStreaming, error, rawString, hybridData, hybridLogs, debugLogs } = payload;

  if (error) {
    return (
      <div className="bg-red-900/20 border-l-4 border-red-500 p-4 rounded text-red-400 max-w-3xl">
        <AlertTriangle className="inline w-5 h-5 mr-2" /> {error}
      </div>
    );
  }

  const [loadingText, setLoadingText] = useState('[ THINKING ]');
  
  useEffect(() => {
    if (isStreaming && !rawString) {
      const timer = setTimeout(() => setLoadingText('[ COMPILING RESULTS ]'), 2000);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, rawString]);

  // Phase 1: Intent Routing (Empty String)
  if (isStreaming && !rawString && !hybridData && (!hybridLogs || hybridLogs.length === 0)) {
    return (
      <div className="flex items-center text-xs font-mono text-blue-400 bg-blue-900/10 border border-blue-900/30 px-4 py-2 rounded-full w-max animate-pulse transition-all duration-300">
        <Cpu className="w-4 h-4 mr-2" />
        {loadingText}
      </div>
    );
  }

  // Connection lost check
  if (!parsedData && !isStreaming && rawString.length === 0 && !hybridData) {
     return (
        <div className="w-full flex flex-col space-y-4">
           <div className="bg-red-900/20 border-l-4 border-red-500 p-4 rounded text-red-400 max-w-3xl">
             <AlertTriangle className="inline w-5 h-5 mr-2" /> 
             Connection lost or no data returned from the server. Please try again.
           </div>
           
           {AI_Analysis_debug && debugLogs && debugLogs.length > 0 && (
             <div className="bg-black border border-red-900/50 p-4 rounded-xl font-mono text-[10px] text-text-secondary overflow-y-auto max-h-96 w-full mt-4">
               <h4 className="text-red-500 uppercase font-bold mb-2 tracking-widest flex items-center">
                 <AlertTriangle className="w-4 h-4 mr-2" />
                 AI Analysis Debug Trace
               </h4>
               {debugLogs.map((log, i) => (
                 <div key={i} className="mb-1 hover:text-text-primary transition-colors">
                   {log}
                 </div>
               ))}
             </div>
           )}
        </div>
     );
  }

  // Fallback for raw text if JSON parser fully fails
  if (!parsedData && !isStreaming && rawString.length > 0 && !hybridData) {
    return (
       <div className="w-full flex flex-col space-y-4">
          <div className="bg-surface/90 backdrop-blur-md border border-indigo-500/30 text-text-primary px-8 py-6 rounded-2xl max-w-4xl shadow-[0_0_20px_rgba(79,70,229,0.1)]">
             <ReactMarkdown
                components={{
                  h2: ({node, ...props}) => <h2 className="text-lg font-bold text-indigo-400 mt-6 mb-4 pb-2 border-b border-indigo-500/30 uppercase tracking-wider" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-base font-bold text-text-primary mt-5 mb-2" {...props} />,
                  p: ({node, ...props}) => <p className="text-text-primary leading-relaxed mb-4 text-sm" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-2 text-text-primary text-sm" {...props} />,
                  li: ({node, ...props}) => <li className="marker:text-indigo-500" {...props} />,
                  strong: ({node, ...props}) => <strong className="text-indigo-200 font-semibold" {...props} />,
                }}
             >
                {rawString}
             </ReactMarkdown>
          </div>
       </div>
    );
  }

  let validKeys: string[] = [];
  if (parsedData) {
    validKeys = Object.keys(parsedData).filter(k => {
      if (k === 'metadata' || k === 'validated_stocks') return false;
      const val = (parsedData as any)[k];
      if (val === null || val === undefined) return false;
      if (Array.isArray(val) && val.length === 0) return false;
      if (typeof val === 'object' && Object.keys(val).length === 0) return false;
      return true;
    });
  }

  const isDense = validKeys.length >= 3;

  return (
    <div className="w-full flex flex-col space-y-6">
      {/* 1. Quantitative Grid (if present) */}
      {hybridData && (
        <NativeDataGrid data={hybridData as any[]} logs={hybridLogs || []} isStreaming={isStreaming} unverified={payload.unverified} parseFailed={payload.parseFailed} rawString={rawString} />
      )}

      {/* NEW: Tear Down V2 Dashboard Widgets */}
      {parsedData?.teardown_sections && (
        <div className={`w-full bg-surface border border-border rounded-xl overflow-hidden shadow-2xl transition-all duration-500 ${isStreaming ? 'shadow-blue-900/10' : ''}`}>
           {parsedData.final_verdict && (
             <div className="bg-surface border-b border-border p-4 flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <span className={`font-bold text-lg tracking-widest px-3 py-1 rounded-sm ${parsedData.final_verdict.rating === 'BUY' ? 'bg-emerald-900/50 text-emerald-400' : parsedData.final_verdict.rating === 'SELL' || parsedData.final_verdict.rating === 'AVOID' ? 'bg-red-900/50 text-red-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                     {parsedData.final_verdict.rating}
                  </span>
                  <span className="text-xs bg-surface-hover px-2 py-1 rounded text-text-secondary uppercase font-mono">Conviction: {parsedData.final_verdict.conviction}/10</span>
                </div>
                <div className="flex space-x-6">
                  {parsedData.final_verdict.target_entry_price && (
                    <div className="text-right">
                      <span className="text-[10px] text-text-secondary uppercase tracking-widest block">Target Entry</span>
                      <span className="text-sm font-mono text-text-primary">{parsedData.final_verdict.target_entry_price}</span>
                    </div>
                  )}
                </div>
             </div>
           )}

           {parsedData.final_verdict?.summary && (
              <div className="p-5 bg-black border-b border-border/50 text-text-primary font-medium text-sm leading-relaxed border-l-4 border-blue-500">
                  {parsedData.final_verdict.summary}
              </div>
           )}

           <div className={`p-6 flex flex-col space-y-6`}>
             <div className="grid grid-cols-1 gap-6">
               {parsedData.teardown_sections.map((sec: any, idx: number) => (
                 <div key={idx} className="bg-black/40 p-5 rounded-lg border border-border/50">
                    <h3 className="text-sm font-bold text-text-secondary mb-4 uppercase tracking-wider flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2"></span>
                      {sec.dimension}
                    </h3>
                    <div className="prose prose-invert prose-sm max-w-none text-text-primary leading-relaxed">
                      <ReactMarkdown>{sec.verdict}</ReactMarkdown>
                    </div>
                 </div>
               ))}
             </div>
             
             {parsedData.ui_components && parsedData.ui_components.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 border-t border-border pt-6">
                   {parsedData.ui_components.map((comp: any, idx: number) => (
                      <ComponentRegistry key={idx} componentKey={comp.type} data={comp.data} />
                   ))}
                </div>
             )}
           </div>
        </div>
      )}

      {/* 2. Qualitative Dashboard Widgets (Legacy) */}
      {parsedData && validKeys.length > 0 && !parsedData.teardown_sections && (
        <div className={`w-full bg-surface border border-border rounded-xl overflow-hidden shadow-2xl transition-all duration-500 ${isStreaming ? 'shadow-blue-900/10' : ''}`}>
           {/* Header Strip if metadata is present */}
           {parsedData.metadata && (
             <div className="bg-surface border-b border-border p-4 flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <span className="font-bold text-text-primary text-lg tracking-widest">{parsedData.metadata.ticker || '---'}</span>
                  <span className="text-xs bg-surface-hover px-2 py-0.5 rounded text-text-secondary uppercase">{parsedData.metadata.industry || '---'}</span>
                </div>
                <div className="flex space-x-6">
                  <div className="text-right">
                    <span className="text-[10px] text-text-secondary uppercase tracking-widest block">Stance</span>
                    <span className="text-sm font-bold text-text-primary">{parsedData.metadata.recommendation || '---'}</span>
                  </div>
                  {parsedData.metadata.current_price && (
                    <div className="text-right">
                      <span className="text-[10px] text-text-secondary uppercase tracking-widest block">Price</span>
                      <span className="text-sm font-mono text-text-primary">{parsedData.metadata.current_price}</span>
                    </div>
                  )}
                </div>
             </div>
           )}

           <div className={`p-6 ${isDense ? 'flex flex-col' : 'flex flex-col space-y-6'}`}>
             {isDense ? (
               <TabbedLayout data={parsedData} keys={validKeys} isStreaming={isStreaming} />
             ) : (
               <StackedLayout data={parsedData} keys={validKeys} isStreaming={isStreaming} />
             )}
           </div>
        </div>
      )}

      {/* VERBOSE DEBUG TRACE TERMINAL */}
      {AI_Analysis_debug && debugLogs && debugLogs.length > 0 && (
        <div className="bg-black border border-red-900/50 p-4 rounded-xl font-mono text-[10px] text-text-secondary overflow-y-auto max-h-96 w-full">
           <h4 className="text-red-500 uppercase font-bold mb-2 tracking-widest flex items-center">
             <AlertTriangle className="w-4 h-4 mr-2" />
             AI Analysis Debug Trace
           </h4>
           {debugLogs.map((log, i) => (
             <div key={i} className="mb-1 hover:text-text-primary transition-colors">
               {log}
             </div>
           ))}
        </div>
      )}
    </div>
  );
};

// ---------------- Layouts ---------------- //

const NativeDataGrid = ({ data, logs, isStreaming, unverified, parseFailed, rawString }: { data: any[], logs: string[], isStreaming: boolean, unverified?: boolean, parseFailed?: boolean, rawString?: string }) => {
  const cols = data.length > 0 ? Object.keys(data[0]) : [];
  
  return (
    <div className="w-full space-y-4">
      {/* Intelligent Loading Log */}
      {logs.length > 0 && (
        <div className="bg-black/60 border border-border rounded-lg p-4 font-mono text-xs text-emerald-500/80">
          <div className="flex items-center mb-2">
            {isStreaming ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-emerald-500" /> : <ShieldCheck className="w-4 h-4 mr-2 text-emerald-500" />}
            <span className="text-text-primary font-semibold tracking-wider">
              {isStreaming ? "GENERATING ANALYSIS..." : "ANALYSIS COMPLETE"}
            </span>
          </div>
          <div className="space-y-1 ml-6 text-text-secondary">
            <div><span className="text-emerald-700">{'>'}</span> Parsed Intention: <span className="text-text-secondary">Quantitative Filter</span></div>
            {logs.map((l, i) => (
              <div key={i}><span className="text-emerald-700">{'>'}</span> Extraction: <span className="text-emerald-400">{l}</span></div>
            ))}
          </div>
        </div>
      )}

      {unverified && (
        <div className="bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded text-yellow-400 max-w-3xl mb-4">
          <AlertTriangle className="inline w-5 h-5 mr-2" /> ⚠️ UNVERIFIED — AI validation unavailable. Showing raw database results.
        </div>
      )}
      
      {parseFailed && !unverified && (
        <div className="bg-orange-900/20 border-l-4 border-orange-500 p-4 rounded text-orange-400 max-w-3xl mb-4">
          <AlertTriangle className="inline w-5 h-5 mr-2" /> ⚠️ AI responded but output was malformed. Showing raw database results.
          {AI_Analysis_debug && rawString && rawString.length > 0 && (
            <div className="mt-4 p-4 bg-black/60 border border-orange-900/50 rounded-lg font-mono text-xs whitespace-pre-wrap overflow-x-auto text-orange-200/80">
              <div className="text-orange-500 font-bold mb-2 uppercase tracking-widest text-[10px]">[DEBUG] Raw LLM Output:</div>
              {rawString}
            </div>
          )}
        </div>
      )}

      {/* Native Data Grid */}
      <div className="bg-black/40 backdrop-blur-md border border-border/50 rounded-xl overflow-x-auto shadow-2xl">
        {data.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">No stocks matched your criteria.</div>
        ) : (
          <table className="w-full text-sm text-left relative">
            <thead className="text-xs text-text-secondary uppercase bg-black/60 border-b border-border/50">
              {!unverified && !parseFailed && !isStreaming && (
                <tr>
                  <th colSpan={cols.length} className="px-6 py-2 bg-surface-hover/50 text-right">
                    <span className="inline-flex items-center text-[10px] font-bold text-emerald-400 bg-emerald-900/20 border border-emerald-900/50 px-2 py-1 rounded">
                      <ShieldCheck className="w-3 h-3 mr-1" /> AI-VALIDATED
                    </span>
                  </th>
                </tr>
              )}
              <tr>
                {cols.map(c => <th key={c} className="px-6 py-4 font-medium tracking-wide">{c}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  {cols.map(c => (
                    <td key={c} className="px-6 py-3 text-text-primary">
                      {c.toLowerCase() === 'ticker' || c.toLowerCase() === 'slug' ? (
                        <a href={`/stocks/${row[c]}`} className="text-blue-400 hover:text-blue-300 hover:underline font-medium">
                          {row[c]}
                        </a>
                      ) : (
                        row[c]
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const StackedLayout = ({ data, keys, isStreaming }: { data: any, keys: string[], isStreaming: boolean }) => (
  <div className="flex flex-col space-y-6">
    {keys.map(key => (
      <div key={key} className={isStreaming ? 'animate-pulse' : ''}>
        <ComponentRegistry componentKey={key} data={data[key]} />
      </div>
    ))}
  </div>
);

const TabbedLayout = ({ data, keys, isStreaming }: { data: any, keys: string[], isStreaming: boolean }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  
  // Format keys into clean tab titles
  const formatKey = (key: string) => key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return (
    <div className="flex flex-col h-[500px]">
      <div className="flex space-x-1 border-b border-border mb-6">
        {keys.map((key, idx) => (
          <button
            key={key}
            onClick={() => setActiveIdx(idx)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
              activeIdx === idx ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-hover/30'
            }`}
          >
            {formatKey(key)}
            {isStreaming && activeIdx === idx && <Loader2 className="inline w-3 h-3 ml-2 animate-spin text-blue-500" />}
          </button>
        ))}
      </div>
      <div className={`flex-1 overflow-y-auto custom-scrollbar pr-2 ${isStreaming ? 'opacity-80' : 'opacity-100'} transition-opacity duration-500`}>
        <ComponentRegistry componentKey={keys[activeIdx]} data={data[keys[activeIdx]]} />
      </div>
    </div>
  );
};

// ---------------- Component Registry ---------------- //

const ComponentRegistry = ({ componentKey, data }: { componentKey: string, data: any }) => {
  if (!data) return <div className="h-32 bg-surface/50 rounded-lg animate-pulse" />; // Skeleton

  switch (componentKey) {
    case 'narrative_insight':
      return <NarrativeInsight data={data} />;
    case 'technical_levels':
      return <TechnicalLevels data={data} />;
    case 'catalyst_feed':
      return <CatalystFeed data={data} />;
    case 'financial_matrix':
      return <FinancialMatrix data={data} />;

    case 'macro_stress_test':
      return <MacroStressTest data={data} />;
    case 'institutional_accumulation_trend':
      return <InstitutionalAccumulationTrend data={data} />;
    case 'promoter_pledge_delta_alert':
      return <PromoterPledgeDeltaAlert data={data} />;

    case 'cross_sectional_peer_multiples_table':
      return <CrossSectionalPeerMultiplesTable data={data} />;
    default:
      return <GenericDataRenderer componentKey={componentKey} data={data} />;
  }
};

const GenericDataRenderer = ({ componentKey, data }: { componentKey: string, data: any }) => {
  const formatKey = (k: string) => k.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const renderValue = (val: any): React.ReactNode => {
    if (Array.isArray(val)) {
      return (
        <div className="space-y-2 mt-2 w-full">
          {val.map((item, i) => (
            <div key={i} className="bg-black/20 p-3 rounded border border-border/50">
              {renderValue(item)}
            </div>
          ))}
        </div>
      );
    }
    if (typeof val === 'object' && val !== null) {
      return (
        <div className="grid grid-cols-1 gap-4">
          {Object.entries(val).map(([k, v]) => (
            <div key={k} className="border-l-2 border-blue-900/50 pl-3">
              <span className="text-[10px] text-text-secondary uppercase tracking-widest block mb-1">{formatKey(k)}</span>
              <div className="text-sm text-text-primary overflow-x-auto">{renderValue(v)}</div>
            </div>
          ))}
        </div>
      );
    }
    return <span className="font-mono whitespace-pre-wrap">{String(val)}</span>;
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-6 h-full overflow-y-auto">
      <h3 className="text-sm font-bold text-text-secondary mb-6 uppercase tracking-wider">{formatKey(componentKey)}</h3>
      {renderValue(data)}
    </div>
  );
};

// 1. Narrative Insight
const NarrativeInsight = ({ data }: { data: any }) => {
  const content = typeof data === 'string' ? data : (data?.summary || data?.text || JSON.stringify(data));
  return (
    <div className="prose prose-invert prose-sm max-w-none [&>p]:mb-2 last:[&>p]:mb-0 [&>ul]:list-disc [&>ul]:ml-4 [&>ol]:list-decimal [&>ol]:ml-4 [&>li]:mb-1">
      {data?.title && <h3 className="text-lg font-bold mb-2 text-text-primary">{data.title}</h3>}
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
};

// 2. Technical Levels
const TechnicalLevels = ({ data }: { data: any }) => (
  <div className="grid grid-cols-2 gap-6">
    <div className="bg-surface border border-border rounded-lg p-5">
      <h4 className="text-xs text-text-secondary uppercase tracking-widest mb-4">Support & Resistance</h4>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex justify-between bg-black/40 px-3 py-2 rounded text-sm border border-border">
          <span className="text-text-secondary">S1</span><span className="font-mono text-emerald-400">{data?.levels?.S1 || '---'}</span>
        </div>
        <div className="flex justify-between bg-black/40 px-3 py-2 rounded text-sm border border-border">
          <span className="text-text-secondary">R1</span><span className="font-mono text-red-400">{data?.levels?.R1 || '---'}</span>
        </div>
        <div className="flex justify-between bg-black/40 px-3 py-2 rounded text-sm border border-border">
          <span className="text-text-secondary">S2</span><span className="font-mono text-emerald-400">{data?.levels?.S2 || '---'}</span>
        </div>
        <div className="flex justify-between bg-black/40 px-3 py-2 rounded text-sm border border-border">
          <span className="text-text-secondary">R2</span><span className="font-mono text-red-400">{data?.levels?.R2 || '---'}</span>
        </div>
      </div>
    </div>
    <div className="bg-blue-900/10 border border-blue-900/30 rounded-lg p-5 flex flex-col justify-center">
      <h4 className="text-xs text-blue-400 uppercase tracking-widest mb-4">Execution Triggers</h4>
      <div className="flex justify-between items-end mb-2">
        <span className="text-text-secondary text-sm">Stop-Loss</span>
        <span className="font-mono text-xl text-text-primary">{data?.execution?.stop_loss || '---'}</span>
      </div>
      <div className="flex justify-between items-end">
        <span className="text-text-secondary text-sm">Re-Entry Range</span>
        <span className="font-mono text-xl text-text-primary">{data?.execution?.re_entry_range || '---'}</span>
      </div>
    </div>
  </div>
);

// 3. Catalyst Feed
const CatalystFeed = ({ data }: { data: any[] }) => {
  const items = Array.isArray(data) ? data : [];
  return (
    <div className="space-y-4">
      {items.map((c: any, i: number) => (
        <div key={i} className="bg-surface border border-border p-4 rounded-lg hover:border-border transition-colors">
          <h4 className="text-sm font-semibold text-text-primary mb-1 leading-snug">{c.title}</h4>
          <p className="text-xs text-text-secondary leading-relaxed mb-3">{c.summary}</p>
          {c.source_url && (
            <a href={c.source_url} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-blue-500/70 hover:text-blue-400 transition-colors flex items-center w-max">
              <ExternalLink className="w-3 h-3 mr-1" /> Source
            </a>
          )}
        </div>
      ))}
      {items.length === 0 && <p className="text-xs text-gray-600">No catalysts found.</p>}
    </div>
  );
};

// 4. Financial Matrix
const FinancialMatrix = ({ data }: { data: any[] }) => {
  const items = Array.isArray(data) ? data : [];
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-text-secondary uppercase bg-surface border-b border-border">
          <tr>
            <th className="px-4 py-3">Quarter</th>
            <th className="px-4 py-3">Metric</th>
            <th className="px-4 py-3">Value</th>
            <th className="px-4 py-3">QoQ</th>
            <th className="px-4 py-3">YoY</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row: any, i: number) => (
            <tr key={i} className="border-b border-border/50 hover:bg-surface-hover/50 transition-colors">
              <td className="px-4 py-2.5 font-medium text-text-primary">{row.quarter}</td>
              <td className="px-4 py-2.5 text-text-secondary">{row.metric_name}</td>
              <td className="px-4 py-2.5 font-mono">{row.value}</td>
              <td className={`px-4 py-2.5 font-mono ${String(row.qoq_delta).includes('-') ? 'text-red-400' : 'text-emerald-400'}`}>{row.qoq_delta}</td>
              <td className={`px-4 py-2.5 font-mono ${String(row.yoy_delta).includes('-') ? 'text-red-400' : 'text-emerald-400'}`}>{row.yoy_delta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};


// 6. Macro Stress Test
const MacroStressTest = ({ data }: { data: any[] }) => {
  const items = Array.isArray(data) ? data : [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {items.map((sim: any, idx: number) => {
        const colors = {
          VULNERABLE: 'border-red-500/50 bg-red-900/10 text-red-400',
          NEUTRAL: 'border-yellow-500/50 bg-yellow-900/10 text-yellow-400',
          BENEFICIARY: 'border-emerald-500/50 bg-emerald-900/10 text-emerald-400',
        };
        const colorClass = colors[sim.risk_level as keyof typeof colors] || colors.NEUTRAL;
        
        return (
          <div key={idx} className={`border rounded-lg p-5 flex flex-col ${colorClass}`}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-bold text-text-primary leading-tight w-2/3">{sim.shock_type}</h3>
              <span className="text-[10px] font-mono font-bold tracking-widest bg-black/40 px-2 py-1 rounded">{sim.risk_level}</span>
            </div>
            <p className="text-xs opacity-80 leading-relaxed mt-auto">{sim.justification}</p>
          </div>
        );
      })}
    </div>
  );
};

// ---------------- Newly Added Quantitative Components ---------------- //

const InstitutionalAccumulationTrend = ({ data }: { data: any }) => {
  return (
    <div className="bg-gradient-to-br from-blue-900/20 to-black/40 p-6 rounded-xl border border-blue-900/30">
      <h3 className="text-sm font-semibold text-blue-400 mb-6 flex items-center uppercase tracking-wider">
        <ShieldCheck className="w-4 h-4 mr-2" />
        Institutional Accumulation Trend
      </h3>
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-black/30 p-5 rounded-lg border border-border/50 flex flex-col items-center justify-center">
          <p className="text-xs text-text-secondary mb-2 uppercase tracking-wide">Net Flow Strength</p>
          <p className="text-xl font-bold text-emerald-400">{data.net_flow_str}</p>
        </div>
        <div className="bg-black/30 p-5 rounded-lg border border-border/50 flex flex-col items-center justify-center">
          <p className="text-xs text-text-secondary mb-2 uppercase tracking-wide">Overall Trend</p>
          <p className="text-xl font-bold text-blue-300">{data.trend}</p>
        </div>
      </div>
    </div>
  );
};

const PromoterPledgeDeltaAlert = ({ data }: { data: any }) => {
  const isHighRisk = data.risk_level?.toLowerCase().includes('high') || data.risk_level?.toLowerCase().includes('critical');
  return (
    <div className={`p-6 rounded-xl border ${isHighRisk ? 'bg-red-900/10 border-red-900/50' : 'bg-emerald-900/10 border-emerald-900/30'}`}>
      <h3 className={`text-sm font-semibold mb-6 flex items-center uppercase tracking-wider ${isHighRisk ? 'text-red-400' : 'text-emerald-400'}`}>
        {isHighRisk ? <ShieldAlert className="w-4 h-4 mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
        Promoter Pledge Delta Alert
      </h3>
      <div className="flex items-center justify-between bg-black/40 p-5 rounded-lg border border-border/50">
        <div className="text-center">
          <p className="text-xs text-text-secondary mb-1">Total Pledged (%)</p>
          <p className="text-2xl font-bold text-gray-100">{data.pledged_pct}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-text-secondary mb-1">Recent Change (%)</p>
          <p className={`text-2xl font-bold ${data.change_pct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {data.change_pct > 0 ? '+' : ''}{data.change_pct}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-text-secondary mb-1">Risk Level</p>
          <p className={`text-lg font-bold px-3 py-1 rounded-full ${isHighRisk ? 'bg-red-900/50 text-red-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
            {data.risk_level}
          </p>
        </div>
      </div>
    </div>
  );
};



const CrossSectionalPeerMultiplesTable = ({ data }: { data: any }) => {
  const peers = Array.isArray(data) ? data : [];
  return (
    <div className="bg-surface/20 rounded-xl border border-border overflow-hidden">
      <h3 className="text-sm font-semibold text-text-primary p-5 border-b border-border uppercase tracking-wider">
        Cross-Sectional Peer Multiples
      </h3>
      <table className="w-full text-sm text-left">
        <thead className="bg-black/40 text-text-secondary uppercase text-xs">
          <tr>
            <th className="px-6 py-3">Ticker</th>
            <th className="px-6 py-3">P/E Ratio</th>
            <th className="px-6 py-3">P/B Ratio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {peers.map((peer, i) => (
            <tr key={i} className="hover:bg-white/5 transition-colors">
              <td className="px-6 py-4 font-medium">
                <a href={`/stocks/${peer.ticker}`} className="text-blue-400 hover:text-blue-300 hover:underline">
                  {peer.ticker}
                </a>
              </td>
              <td className="px-6 py-4 text-text-primary font-mono">{peer.pe_ratio || 'N/A'}</td>
              <td className="px-6 py-4 text-text-primary font-mono">{peer.pb_ratio || 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

