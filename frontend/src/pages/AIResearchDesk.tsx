import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../store/aiStore';
import { useAIStore } from '../store/aiStore';
import { useAgentStream } from '../hooks/useAgentStream';
import { Search, Loader2, AlertTriangle, ExternalLink, ShieldCheck, ShieldAlert, Cpu, SquarePen } from 'lucide-react';
import { InfoTooltip } from '../components/InfoTooltip';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, 
  LineChart, Line, CartesianGrid, ReferenceLine, ScatterChart, Scatter, ZAxis
} from 'recharts';

export const AIResearchDesk: React.FC = () => {
  const { isProcessing, messages, activeTicker, setActiveTicker, clearWorkspace } = useAIStore();
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
    // Look for explicitly typed tickers (all caps, 3-10 chars)
    const words = query.split(' ');
    const foundTicker = words.find(w => /^[A-Z]{3,10}$/.test(w));
    
    // If we didn't find an explicit ticker, maintain the existing activeTicker
    // If there is no activeTicker yet, default to a fallback or let backend handle it
    const newTicker = foundTicker || activeTicker || "UNKNOWN";
    
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
    <div className={`w-full ${isHero ? 'max-w-3xl mx-auto' : 'bg-[#0A0A0A] border-t border-gray-800 p-4 sticky bottom-0 z-30'}`}>
      <form onSubmit={handleSubmit} className={`max-w-4xl mx-auto flex gap-4 ${isHero ? '' : 'items-center'}`}>
        {!isHero && (
          <button 
            type="button" 
            onClick={handleNewChat}
            className="p-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
            title="New Chat"
          >
            <SquarePen className="w-5 h-5" />
          </button>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies, macro events, or ask a specific question. (e.g., Why did SBIN drop today?)..."
            className={`w-full bg-[#1A1A1A] border border-gray-700 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-inner ${isHero ? 'text-xs' : ''}`}
            disabled={isProcessing}
          />
        </div>
        <button
          type="submit"
          disabled={isProcessing || !query.trim()}
          className="px-8 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-medium transition-colors disabled:opacity-50 flex items-center"
        >
          {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
          {isProcessing ? 'Routing...' : 'Analyze'}
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-gray-200 font-sans flex flex-col pt-16 relative">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 -mt-20">
          <div className="flex items-center justify-center space-x-4 mb-8">
            <h1 className="text-4xl md:text-5xl font-light text-white tracking-tight text-center">
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
                    <div className="bg-[#1E1E1E] border border-gray-800 text-gray-100 px-6 py-4 rounded-3xl rounded-tr-sm max-w-2xl text-lg font-light leading-relaxed">
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
            <div ref={bottomRef} />
          </div>
          {renderSearchBar(false)}
        </div>
      )}
    </div>
  );
};

// Component Router
const AssistantMessage = ({ payload }: { payload: ChatMessage }) => {
  const { parsedData, isStreaming, error, rawString } = payload;

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
  if (isStreaming && !rawString) {
    return (
      <div className="flex items-center text-xs font-mono text-blue-400 bg-blue-900/10 border border-blue-900/30 px-4 py-2 rounded-full w-max animate-pulse transition-all duration-300">
        <Cpu className="w-4 h-4 mr-2" />
        {loadingText}
      </div>
    );
  }

  // Fallback for raw text if JSON parser fully fails and it's not empty
  if (!parsedData && !isStreaming && rawString.length > 0) {
    return (
      <div className="bg-[#151515] border border-gray-800 text-gray-300 px-6 py-4 rounded-2xl rounded-tl-sm max-w-3xl font-mono text-xs overflow-x-auto">
        {rawString}
      </div>
    );
  }

  if (!parsedData) return null;

  // Graceful Degradation: Filter out metadata and any keys that the LLM returned as null, undefined, or empty structures
  const keys = Object.keys(parsedData).filter(k => {
    if (k === 'metadata') return false;
    const val = parsedData[k];
    if (val === null || val === undefined) return false;
    if (Array.isArray(val) && val.length === 0) return false;
    if (typeof val === 'object' && Object.keys(val).length === 0) return false;
    return true;
  });
  
  if (keys.length === 0) {
     return (
        <div className="flex items-center text-xs font-mono text-gray-400 bg-gray-900 border border-gray-800 px-4 py-2 rounded-full w-max animate-pulse">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          [ STATUS: GENERATING ARTIFACTS ]
        </div>
     )
  }

  const isDense = keys.length >= 3;

  return (
    <div className={`w-full bg-[#111] border border-gray-800 rounded-xl overflow-hidden shadow-2xl transition-all duration-500 ${isStreaming ? 'shadow-blue-900/10' : ''}`}>
      {/* Header Strip if metadata is present */}
      {parsedData.metadata && (
        <div className="bg-[#151515] border-b border-gray-800 p-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <span className="font-bold text-white text-lg tracking-widest">{parsedData.metadata.ticker || '---'}</span>
            <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-400 uppercase">{parsedData.metadata.industry || '---'}</span>
          </div>
          <div className="flex space-x-6">
            <div className="text-right">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest block">Stance</span>
              <span className="text-sm font-bold text-gray-300">{parsedData.metadata.recommendation || '---'}</span>
            </div>
            {parsedData.metadata.current_price && (
              <div className="text-right">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest block">Price</span>
                <span className="text-sm font-mono text-white">{parsedData.metadata.current_price}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`p-6 ${isDense ? 'flex flex-col' : 'flex flex-col space-y-6'}`}>
        {isDense ? (
          <TabbedLayout data={parsedData} keys={keys} isStreaming={isStreaming} />
        ) : (
          <StackedLayout data={parsedData} keys={keys} isStreaming={isStreaming} />
        )}
      </div>
    </div>
  );
};

// ---------------- Layouts ---------------- //

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
      <div className="flex space-x-1 border-b border-gray-800 mb-6">
        {keys.map((key, idx) => (
          <button
            key={key}
            onClick={() => setActiveIdx(idx)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
              activeIdx === idx ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
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
  if (!data) return <div className="h-32 bg-gray-900/50 rounded-lg animate-pulse" />; // Skeleton

  switch (componentKey) {
    case 'narrative_insight':
      return <NarrativeInsight data={data} />;
    case 'technical_levels':
      return <TechnicalLevels data={data} />;
    case 'catalyst_feed':
      return <CatalystFeed data={data} />;
    case 'financial_matrix':
      return <FinancialMatrix data={data} />;
    case 'peer_valuation':
      return <PeerValuation data={data} />;
    case 'macro_stress_test':
      return <MacroStressTest data={data} />;
    case 'institutional_accumulation_trend':
      return <InstitutionalAccumulationTrend data={data} />;
    case 'promoter_pledge_delta_alert':
      return <PromoterPledgeDeltaAlert data={data} />;
    case 'quantitative_earnings_quality_scorecard':
      return <QuantitativeEarningsQualityScorecard data={data} />;
    case 'shap_global_feature_driver_plot':
      return <ShapGlobalFeatureDriverPlot data={data} />;
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
            <div key={i} className="bg-black/20 p-3 rounded border border-gray-800/50">
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
              <span className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">{formatKey(k)}</span>
              <div className="text-sm text-gray-300 overflow-x-auto">{renderValue(v)}</div>
            </div>
          ))}
        </div>
      );
    }
    return <span className="font-mono whitespace-pre-wrap">{String(val)}</span>;
  };

  return (
    <div className="bg-[#151515] border border-gray-800 rounded-xl p-6 h-full overflow-y-auto">
      <h3 className="text-sm font-bold text-gray-400 mb-6 uppercase tracking-wider">{formatKey(componentKey)}</h3>
      {renderValue(data)}
    </div>
  );
};

// 1. Narrative Insight
const NarrativeInsight = ({ data }: { data: any }) => (
  <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed">
    <p>{data.text || data}</p>
  </div>
);

// 2. Technical Levels
const TechnicalLevels = ({ data }: { data: any }) => (
  <div className="grid grid-cols-2 gap-6">
    <div className="bg-[#151515] border border-gray-800 rounded-lg p-5">
      <h4 className="text-xs text-gray-500 uppercase tracking-widest mb-4">Support & Resistance</h4>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex justify-between bg-black/40 px-3 py-2 rounded text-sm border border-gray-800">
          <span className="text-gray-500">S1</span><span className="font-mono text-emerald-400">{data?.levels?.S1 || '---'}</span>
        </div>
        <div className="flex justify-between bg-black/40 px-3 py-2 rounded text-sm border border-gray-800">
          <span className="text-gray-500">R1</span><span className="font-mono text-red-400">{data?.levels?.R1 || '---'}</span>
        </div>
        <div className="flex justify-between bg-black/40 px-3 py-2 rounded text-sm border border-gray-800">
          <span className="text-gray-500">S2</span><span className="font-mono text-emerald-400">{data?.levels?.S2 || '---'}</span>
        </div>
        <div className="flex justify-between bg-black/40 px-3 py-2 rounded text-sm border border-gray-800">
          <span className="text-gray-500">R2</span><span className="font-mono text-red-400">{data?.levels?.R2 || '---'}</span>
        </div>
      </div>
    </div>
    <div className="bg-blue-900/10 border border-blue-900/30 rounded-lg p-5 flex flex-col justify-center">
      <h4 className="text-xs text-blue-400 uppercase tracking-widest mb-4">Execution Triggers</h4>
      <div className="flex justify-between items-end mb-2">
        <span className="text-gray-400 text-sm">Stop-Loss</span>
        <span className="font-mono text-xl text-white">{data?.execution?.stop_loss || '---'}</span>
      </div>
      <div className="flex justify-between items-end">
        <span className="text-gray-400 text-sm">Re-Entry Range</span>
        <span className="font-mono text-xl text-white">{data?.execution?.re_entry_range || '---'}</span>
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
        <div key={i} className="bg-[#151515] border border-gray-800 p-4 rounded-lg hover:border-gray-700 transition-colors">
          <h4 className="text-sm font-semibold text-gray-200 mb-1 leading-snug">{c.title}</h4>
          <p className="text-xs text-gray-500 leading-relaxed mb-3">{c.summary}</p>
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
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-500 uppercase bg-[#151515] border-b border-gray-800">
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
            <tr key={i} className="border-b border-gray-800/50 hover:bg-[#1A1A1A]/50 transition-colors">
              <td className="px-4 py-2.5 font-medium text-gray-300">{row.quarter}</td>
              <td className="px-4 py-2.5 text-gray-400">{row.metric_name}</td>
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

// 5. Peer Valuation
const PeerValuation = ({ data }: { data: any[] }) => {
  const items = Array.isArray(data) ? data : [];
  return (
    <div className="h-64 bg-[#151515] border border-gray-800 rounded-lg p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
          <XAxis type="number" stroke="#444" />
          <YAxis dataKey="ticker" type="category" stroke="#888" fontSize={12} />
          <Tooltip cursor={{fill: '#1A1A1A'}} contentStyle={{backgroundColor: '#000', borderColor: '#333'}} />
          <Bar dataKey="alpha_score" radius={[0, 4, 4, 0]}>
            {items.map((entry: any, index: number) => (
              <Cell key={`cell-${index}`} fill={entry.alpha_score > 0 ? '#3b82f6' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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
              <h3 className="text-sm font-bold text-white leading-tight w-2/3">{sim.shock_type}</h3>
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
        <div className="bg-black/30 p-5 rounded-lg border border-gray-800/50 flex flex-col items-center justify-center">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Net Flow Strength</p>
          <p className="text-xl font-bold text-emerald-400">{data.net_flow_str}</p>
        </div>
        <div className="bg-black/30 p-5 rounded-lg border border-gray-800/50 flex flex-col items-center justify-center">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Overall Trend</p>
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
      <div className="flex items-center justify-between bg-black/40 p-5 rounded-lg border border-gray-800/50">
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-1">Total Pledged (%)</p>
          <p className="text-2xl font-bold text-gray-100">{data.pledged_pct}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-1">Recent Change (%)</p>
          <p className={`text-2xl font-bold ${data.change_pct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {data.change_pct > 0 ? '+' : ''}{data.change_pct}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-1">Risk Level</p>
          <p className={`text-lg font-bold px-3 py-1 rounded-full ${isHighRisk ? 'bg-red-900/50 text-red-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
            {data.risk_level}
          </p>
        </div>
      </div>
    </div>
  );
};

const QuantitativeEarningsQualityScorecard = ({ data }: { data: any }) => {
  return (
    <div className="bg-gray-900/30 p-6 rounded-xl border border-gray-800 relative">
      <div className="absolute top-6 right-6">
        <InfoTooltip text="QES (Quantitative Earnings Quality Score) measures how much of a company's reported earnings are backed by actual cash flow versus accounting adjustments. A higher score means higher quality, more reliable earnings." />
      </div>
      <h3 className="text-sm font-semibold text-purple-400 mb-6 flex items-center uppercase tracking-wider">
        <Cpu className="w-4 h-4 mr-2" />
        Quantitative Earnings Quality
      </h3>
      <p className="text-xs text-gray-500 mb-6 w-3/4 leading-relaxed">
        Measures the sustainability and cash-conversion of reported earnings. High quality indicates earnings are backed by hard cash flow rather than accounting accruals.
      </p>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-gray-500 mb-1">QES Score</p>
          <p className="text-4xl font-black text-gray-100">{data.qes_score}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-1">Quality Tier</p>
          <p className="text-xl font-semibold text-purple-300">{data.quality_tier}</p>
        </div>
      </div>
      {Array.isArray(data?.flags) && data.flags.length > 0 && (
        <div className="bg-red-900/20 border border-red-900/30 p-4 rounded-lg">
          <p className="text-xs text-red-400 font-semibold mb-2">RED FLAGS DETECTED</p>
          <ul className="list-disc list-inside text-sm text-red-300/80 space-y-1">
            {data.flags.map((flag: string, i: number) => <li key={i}>{flag}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

const ShapGlobalFeatureDriverPlot = ({ data }: { data: any }) => {
  const chartData = Array.isArray(data) ? data : [];
  return (
    <div className="bg-black/20 p-6 rounded-xl border border-gray-800/50">
      <h3 className="text-sm font-semibold text-indigo-400 mb-6 uppercase tracking-wider">
        SHAP Global Feature Driver Plot
      </h3>
      
      {chartData.length === 0 ? (
        <div className="h-64 w-full flex flex-col items-center justify-center border border-dashed border-gray-800 rounded-lg bg-black/10">
          <p className="text-gray-500 font-medium">No ML feature driver data available for this equity.</p>
          <p className="text-gray-600 text-xs mt-2">The quantitative pipeline did not generate SHAP values for this ticker.</p>
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <XAxis type="number" stroke="#4B5563" fontSize={12} tickFormatter={(val) => val.toFixed(2)} />
            <YAxis dataKey="feature" type="category" width={120} stroke="#9CA3AF" fontSize={11} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
              itemStyle={{ color: '#E5E7EB' }}
            />
            <ReferenceLine x={0} stroke="#4B5563" />
            <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.contribution > 0 ? '#10B981' : '#EF4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
};

const CrossSectionalPeerMultiplesTable = ({ data }: { data: any }) => {
  const peers = Array.isArray(data) ? data : [];
  return (
    <div className="bg-gray-900/20 rounded-xl border border-gray-800 overflow-hidden">
      <h3 className="text-sm font-semibold text-gray-300 p-5 border-b border-gray-800 uppercase tracking-wider">
        Cross-Sectional Peer Multiples
      </h3>
      <table className="w-full text-sm text-left">
        <thead className="bg-black/40 text-gray-400 uppercase text-xs">
          <tr>
            <th className="px-6 py-3">Ticker</th>
            <th className="px-6 py-3">P/E Ratio</th>
            <th className="px-6 py-3">Alpha Score (if any)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {peers.map((peer, i) => (
            <tr key={i} className="hover:bg-white/5 transition-colors">
              <td className="px-6 py-4 font-medium text-blue-400">{peer.ticker}</td>
              <td className="px-6 py-4 text-gray-300">{peer.pe_ratio || peer.pb_ratio || 'N/A'}</td>
              <td className="px-6 py-4 text-gray-300">{peer.alpha_score !== undefined ? peer.alpha_score : 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

