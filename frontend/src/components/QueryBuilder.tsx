import React, { useState, useRef, useEffect } from 'react';
import { Search, X, CornerDownLeft } from 'lucide-react';

export interface QueryToken {
  type: 'bracket' | 'metric' | 'operator' | 'value' | 'logic';
  value: string;
  label?: string;
  options?: string[]; // for metric tokens
  metricType?: string; // for metric tokens ('numeric', 'string', 'flag')
}

interface QueryBuilderProps {
  tokens: QueryToken[];
  onChange: (tokens: QueryToken[]) => void;
  metrics: { key: string; label: string; group: string; type: string; options?: string[] }[];
  groupColors: Record<string, string>;
}

const OPS = ['>', '<', '>=', '<=', '=', '!='];

export const QueryBuilder: React.FC<QueryBuilderProps> = ({ tokens, onChange, metrics, groupColors }) => {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const lastToken = tokens[tokens.length - 1];
  
  // State Machine logic
  let expectedType: 'metric_or_bracket' | 'operator' | 'value' | 'logic_or_bracket' = 'metric_or_bracket';
  if (lastToken) {
    if (lastToken.type === 'bracket' && lastToken.value === '(') expectedType = 'metric_or_bracket';
    else if (lastToken.type === 'bracket' && lastToken.value === ')') expectedType = 'logic_or_bracket';
    else if (lastToken.type === 'logic') expectedType = 'metric_or_bracket';
    else if (lastToken.type === 'metric') expectedType = 'operator';
    else if (lastToken.type === 'operator') expectedType = 'value';
    else if (lastToken.type === 'value') expectedType = 'logic_or_bracket';
  }

  // Handle outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addToken = (token: QueryToken) => {
    onChange([...tokens, token]);
    setSearch('');
    inputRef.current?.focus();
    if (token.type === 'metric' || token.type === 'operator' || token.type === 'bracket') {
        setShowDropdown(true); // Keep dropdown open for next logical step
    } else {
        setShowDropdown(false);
    }
  };

  const removeLast = () => {
    if (tokens.length > 0) onChange(tokens.slice(0, -1));
  };

  const removeAt = (index: number) => {
    onChange(tokens.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && search === '') {
      removeLast();
    }
    
    if (expectedType === 'metric_or_bracket') {
      if (e.key === '(') {
        e.preventDefault();
        addToken({ type: 'bracket', value: '(' });
      }
    }
    
    if (expectedType === 'logic_or_bracket') {
      if (e.key === ')') {
        e.preventDefault();
        addToken({ type: 'bracket', value: ')' });
      }
    }

    if (expectedType === 'value' && e.key === 'Enter' && search) {
      e.preventDefault();
      addToken({ type: 'value', value: search });
    }
  };

  // Render suggestion dropdown based on expected type
  const renderDropdown = () => {
    if (!showDropdown) return null;

    if (expectedType === 'metric_or_bracket') {
      const filtered = metrics.filter(m => 
        m.label.toLowerCase().includes(search.toLowerCase()) || 
        m.key.toLowerCase().includes(search.toLowerCase())
      );
      
      const grouped = filtered.reduce((acc, m) => {
        if (!acc[m.group]) acc[m.group] = [];
        acc[m.group].push(m);
        return acc;
      }, {} as Record<string, typeof metrics>);

      return (
        <div className="absolute top-full left-0 mt-2 w-80 bg-[#17171d] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto custom-scrollbar">
          {search === '' && (
            <div className="px-3 py-2 border-b border-white/[0.05] flex gap-2">
               <button onClick={() => addToken({ type: 'bracket', value: '(' })} className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded font-mono text-white/50 hover:text-white transition-colors">(</button>
            </div>
          )}
          {Object.entries(grouped).map(([group, ms]) => (
            <div key={group}>
              <div className={`px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider ${groupColors[group] ?? 'text-white/30'}`}>
                {group}
              </div>
              {ms.map(m => (
                <button
                  key={m.key}
                  onClick={() => {
                    addToken({ type: 'metric', value: m.key, label: m.label, options: m.options, metricType: m.type });
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {m.label}
                </button>
              ))}
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
             <div className="p-4 text-xs text-white/30 text-center">No metrics found.</div>
          )}
        </div>
      );
    }

    if (expectedType === 'operator') {
      const prevMetric = tokens[tokens.length - 1];
      const validOps = prevMetric.metricType === 'string' ? ['=', '!='] : OPS;
      return (
        <div className="absolute top-full left-0 mt-2 w-32 bg-[#17171d] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-2 py-1.5 text-[9px] uppercase font-bold text-white/30 tracking-widest border-b border-white/5">Operator</div>
          <div className="p-1 flex flex-col gap-0.5">
            {validOps.map(op => (
              <button
                key={op}
                onClick={() => addToken({ type: 'operator', value: op })}
                className="w-full text-left px-3 py-1.5 text-xs font-mono font-bold text-alpha hover:bg-alpha/10 rounded transition-colors"
              >
                {op}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (expectedType === 'value') {
      const prevMetric = tokens[tokens.length - 2];
      if (prevMetric?.options && prevMetric.options.length > 0) {
        return (
          <div className="absolute top-full left-0 mt-2 w-48 bg-[#17171d] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50 max-h-64 overflow-y-auto">
             <div className="px-2 py-1.5 text-[9px] uppercase font-bold text-white/30 tracking-widest border-b border-white/5">Select Value</div>
             <div className="p-1 flex flex-col gap-0.5">
               {prevMetric.options.filter(o => o.toLowerCase().includes(search.toLowerCase())).map(opt => (
                  <button
                    key={opt}
                    onClick={() => addToken({ type: 'value', value: opt })}
                    className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
                  >
                    {opt}
                  </button>
               ))}
             </div>
          </div>
        );
      } else {
        return (
           <div className="absolute top-full left-0 mt-2 w-48 bg-[#17171d] border border-white/[0.08] rounded-xl shadow-2xl p-3 z-50">
              <div className="text-[10px] text-white/40 font-medium mb-1">Type a {prevMetric?.metricType === 'string' ? 'value' : 'number'} and press Enter</div>
              <div className="flex items-center gap-1.5 text-xs text-alpha">
                <CornerDownLeft size={12} /> Press Enter
              </div>
           </div>
        );
      }
    }

    if (expectedType === 'logic_or_bracket') {
      return (
        <div className="absolute top-full left-0 mt-2 w-32 bg-[#17171d] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="p-1 flex flex-col gap-0.5">
            <button onClick={() => addToken({ type: 'logic', value: 'AND' })} className="w-full text-left px-3 py-1.5 text-xs font-bold text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors">AND</button>
            <button onClick={() => addToken({ type: 'logic', value: 'OR' })} className="w-full text-left px-3 py-1.5 text-xs font-bold text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors">OR</button>
            <div className="h-px bg-white/10 my-0.5" />
            <button onClick={() => addToken({ type: 'bracket', value: ')' })} className="w-full text-left px-3 py-1.5 text-xs font-mono text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors">)</button>
          </div>
        </div>
      );
    }

    return null;
  };

  const getPlaceholder = () => {
    if (expectedType === 'metric_or_bracket') return 'Search metric or type ( ...';
    if (expectedType === 'operator') return 'Select operator...';
    if (expectedType === 'value') return 'Enter value...';
    if (expectedType === 'logic_or_bracket') return 'Select AND/OR or type )...';
    return '';
  };

  return (
    <div className="flex-1 min-h-[44px] flex items-center bg-[#0d0d12] border border-white/[0.06] rounded-xl px-2.5 py-1.5 gap-1.5 flex-wrap" ref={containerRef}>
      <Search size={14} className="text-white/30 shrink-0 ml-1" />
      
      {/* Tokens */}
      {tokens.map((t, i) => (
        <div 
          key={i} 
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium cursor-pointer group ${
            t.type === 'bracket' ? 'text-white/50 font-mono text-sm' :
            t.type === 'logic' ? 'text-white/40 uppercase text-[10px] tracking-widest bg-white/5' :
            t.type === 'metric' ? 'bg-alpha/10 text-white/80 border border-alpha/20' :
            t.type === 'operator' ? 'text-alpha font-mono' :
            'text-alpha bg-alpha/5 border border-alpha/10'
          }`}
          onClick={() => removeAt(i)}
          title="Click to remove"
        >
          {t.label || t.value}
          <X size={10} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-white/40 hover:text-red-400" />
        </div>
      ))}

      {/* Input box */}
      <div className="relative flex-1 min-w-[150px]">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={tokens.length === 0 ? "Build query (e.g. ROE > 15 AND Live Price > 100)" : getPlaceholder()}
          className="w-full bg-transparent text-sm text-white outline-none placeholder-white/20 px-1 py-1"
        />
        {renderDropdown()}
      </div>
      
      {tokens.length > 0 && (
         <button onClick={() => onChange([])} className="ml-auto text-[10px] text-white/30 hover:text-white uppercase font-bold tracking-wider px-2 py-1 rounded bg-white/5 transition-colors">
            Clear
         </button>
      )}
    </div>
  );
};
