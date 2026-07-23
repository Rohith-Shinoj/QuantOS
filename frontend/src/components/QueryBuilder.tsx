import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, CornerDownLeft, Info } from 'lucide-react';
import { InfoTooltip } from './InfoTooltip'; // We will create this

export interface QueryToken {
  type: 'bracket' | 'metric' | 'operator' | 'value' | 'logic';
  value: string;
  label?: string;
  options?: string[]; // for metric tokens
  metricType?: string; // for metric tokens ('numeric', 'string', 'flag')
  description?: string; // New field from backend
}

interface QueryBuilderProps {
  tokens: QueryToken[];
  onChange: (tokens: QueryToken[]) => void;
  metrics: { key: string; label: string; group: string; type: string; options?: string[], description?: string }[];
  groupColors: Record<string, string>;
}

const OPS = ['>', '<', '>=', '<=', '=', '!='];

export const QueryBuilder: React.FC<QueryBuilderProps> = ({ tokens, onChange, metrics, groupColors }) => {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(tokens.length); // Cursor position
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep active index in bounds
  useEffect(() => {
    if (activeIndex > tokens.length) setActiveIndex(tokens.length);
  }, [tokens.length, activeIndex]);

  const tokenBeforeCursor = tokens[activeIndex - 1];

  // State Machine logic (based on token just before cursor)
  let expectedType: 'metric_or_bracket' | 'operator' | 'value_or_metric' | 'logic_or_bracket' = 'metric_or_bracket';
  if (tokenBeforeCursor) {
    if (tokenBeforeCursor.type === 'bracket' && tokenBeforeCursor.value === '(') expectedType = 'metric_or_bracket';
    else if (tokenBeforeCursor.type === 'bracket' && tokenBeforeCursor.value === ')') expectedType = 'logic_or_bracket';
    else if (tokenBeforeCursor.type === 'logic') expectedType = 'metric_or_bracket';
    else if (tokenBeforeCursor.type === 'metric') expectedType = 'operator';
    else if (tokenBeforeCursor.type === 'operator') expectedType = 'value_or_metric';
    else if (tokenBeforeCursor.type === 'value') expectedType = 'logic_or_bracket';
  }

  // Handle outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setActiveIndex(tokens.length); // reset cursor to end on outside click
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tokens.length]);

  const addToken = (token: QueryToken) => {
    const newTokens = [...tokens];
    newTokens.splice(activeIndex, 0, token);

    // Graphic calculator visual auto-bracket balancing:
    // If a value token is added inside an unclosed '(', auto-append ')' right after the value!
    let nextIndex = activeIndex + 1;
    if (token.type === 'value') {
      const openCount = newTokens.filter(t => t.type === 'bracket' && t.value === '(').length;
      const closeCount = newTokens.filter(t => t.type === 'bracket' && t.value === ')').length;
      if (openCount > closeCount) {
        newTokens.splice(nextIndex, 0, { type: 'bracket', value: ')' });
        nextIndex += 1;
      }
    }

    onChange(newTokens);
    setSearch('');
    setActiveIndex(nextIndex);
    inputRef.current?.focus();
    if (token.type === 'metric' || token.type === 'operator' || (token.type === 'bracket' && token.value === '(')) {
        setShowDropdown(true); // Keep dropdown open for next logical step
    } else {
        setShowDropdown(false);
    }
  };

  const removeLast = () => {
    if (activeIndex > 0) {
      const newTokens = [...tokens];
      newTokens.splice(activeIndex - 1, 1);
      onChange(newTokens);
      setActiveIndex(activeIndex - 1);
    }
  };

  const removeAt = (index: number) => {
    const newTokens = [...tokens];
    newTokens.splice(index, 1);
    onChange(newTokens);
    if (activeIndex > index) setActiveIndex(activeIndex - 1);
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

    if (expectedType === 'value_or_metric' && e.key === 'Enter' && search) {
      e.preventDefault();
      addToken({ type: 'value', value: search });
    }
  };

  // ── GROUPING LOGIC FOR MERGED LABELS ──
  const visualGroups = useMemo(() => {
    const groups: { type: 'token' | 'group', startIndex: number, endIndex: number, label: string }[] = [];
    let i = 0;
    while (i < tokens.length) {
      // Check for ( metric op value/metric )
      if (
        i + 4 < tokens.length &&
        tokens[i].type === 'bracket' && tokens[i].value === '(' &&
        tokens[i+1].type === 'metric' &&
        tokens[i+2].type === 'operator' &&
        (tokens[i+3].type === 'value' || tokens[i+3].type === 'metric') &&
        tokens[i+4].type === 'bracket' && tokens[i+4].value === ')'
      ) {
        if (activeIndex >= i && activeIndex <= i + 5) {
          // Cursor is touching this group, break it apart so user can edit
          groups.push({ type: 'token', startIndex: i, endIndex: i, label: '' });
          i++;
        } else {
          groups.push({
            type: 'group', startIndex: i, endIndex: i + 4,
            label: `( ${tokens[i+1].label} ${tokens[i+2].value} ${tokens[i+3].label || tokens[i+3].value} )`
          });
          i += 5;
        }
        continue;
      }
      
      // Check for metric op value/metric
      if (
        i + 2 < tokens.length &&
        tokens[i].type === 'metric' &&
        tokens[i+1].type === 'operator' &&
        (tokens[i+2].type === 'value' || tokens[i+2].type === 'metric')
      ) {
        if (activeIndex >= i && activeIndex <= i + 3) {
           groups.push({ type: 'token', startIndex: i, endIndex: i, label: '' });
           i++;
        } else {
           groups.push({
            type: 'group', startIndex: i, endIndex: i + 2,
            label: `${tokens[i].label} ${tokens[i+1].value} ${tokens[i+2].label || tokens[i+2].value}`
          });
          i += 3;
        }
        continue;
      }
      
      groups.push({ type: 'token', startIndex: i, endIndex: i, label: '' });
      i++;
    }
    return groups;
  }, [tokens, activeIndex]);


  const renderDropdown = () => {
    if (!showDropdown) return null;

    if (expectedType === 'metric_or_bracket' || expectedType === 'value_or_metric') {
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
        <div className="absolute top-full left-0 mt-2 w-80 bg-surface-hover border border-border rounded-xl shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto custom-scrollbar">
          {search === '' && expectedType === 'metric_or_bracket' && (
            <div className="px-3 py-2 border-b border-white/[0.05] flex gap-2">
               <button onClick={() => addToken({ type: 'bracket', value: '(' })} className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded font-mono text-text-primary/50 hover:text-text-primary transition-colors">(</button>
            </div>
          )}
          {expectedType === 'value_or_metric' && (
            <div className="p-3 border-b border-white/[0.05]">
                <div className="text-[10px] text-text-primary/40 font-medium mb-1">Type a value and press Enter, OR select a metric below:</div>
                <div className="flex items-center gap-1.5 text-xs text-alpha">
                  <CornerDownLeft size={12} /> Press Enter for raw value
                </div>
            </div>
          )}
          {Object.entries(grouped).map(([group, ms]) => (
            <div key={group}>
              <div className={`px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider ${groupColors[group] ?? 'text-text-primary/30'}`}>
                {group}
              </div>
              {ms.map(m => (
                <div key={m.key} className="flex items-center w-full px-3 py-1.5 hover:bg-white/10 transition-colors group/item">
                  <button
                    onClick={() => {
                      addToken({ type: 'metric', value: m.key, label: m.label, options: m.options, metricType: m.type, description: m.description });
                    }}
                    className="flex-1 text-left text-xs text-text-primary/70 group-hover/item:text-text-primary"
                  >
                    {m.label}
                  </button>
                  {m.description && (
                    <InfoTooltip text={m.description} position="right" />
                  )}
                </div>
              ))}
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
             <div className="p-4 text-xs text-text-primary/30 text-center">No metrics found.</div>
          )}
        </div>
      );
    }

    if (expectedType === 'operator') {
      const prevMetric = tokens[activeIndex - 1];
      const validOps = prevMetric.metricType === 'string' ? ['=', '!='] : OPS;
      return (
        <div className="absolute top-full left-0 mt-2 w-32 bg-surface-hover border border-border rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-2 py-1.5 text-[9px] uppercase font-bold text-text-primary/30 tracking-widest border-b border-border">Operator</div>
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

    if (expectedType === 'logic_or_bracket') {
      return (
        <div className="absolute top-full left-0 mt-2 w-32 bg-surface-hover border border-border rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="p-1 flex flex-col gap-0.5">
            <button onClick={() => addToken({ type: 'logic', value: 'AND' })} className="w-full text-left px-3 py-1.5 text-xs font-bold text-text-primary/70 hover:text-text-primary hover:bg-white/10 rounded transition-colors">AND</button>
            <button onClick={() => addToken({ type: 'logic', value: 'OR' })} className="w-full text-left px-3 py-1.5 text-xs font-bold text-text-primary/70 hover:text-text-primary hover:bg-white/10 rounded transition-colors">OR</button>
            <div className="h-px bg-white/10 my-0.5" />
            <button onClick={() => addToken({ type: 'bracket', value: ')' })} className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-primary/50 hover:text-text-primary hover:bg-white/10 rounded transition-colors">)</button>
          </div>
        </div>
      );
    }

    return null;
  };

  const getPlaceholder = () => {
    if (expectedType === 'metric_or_bracket') return 'Search metric or type ( ...';
    if (expectedType === 'operator') return 'Select operator...';
    if (expectedType === 'value_or_metric') return 'Enter value or metric...';
    if (expectedType === 'logic_or_bracket') return 'Select AND/OR or type )...';
    return '';
  };

  const renderInputBox = () => (
    <div className="relative flex-1 min-w-[150px]" key="input-box">
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        onKeyDown={handleKeyDown}
        placeholder={tokens.length === 0 ? "Build query (e.g. ROE > 15 AND Live Price > 100)" : getPlaceholder()}
        className="w-full bg-transparent text-sm text-text-primary outline-none placeholder-white/20 px-1 py-1"
      />
      {renderDropdown()}
    </div>
  );

  return (
    <div className="flex-1 min-h-[44px] flex items-center bg-surface-hover border border-border rounded-xl px-2.5 py-1.5 gap-1.5 flex-wrap" ref={containerRef}>
      <Search size={14} className="text-text-primary/30 shrink-0 ml-1" />
      
      {/* Dynamic Token Render with cursor insertion */}
      {visualGroups.map((vg) => {
        // Render input BEFORE this token if activeIndex matches
        const renderInputBefore = activeIndex === vg.startIndex;
        
        const removeGroup = (e: React.MouseEvent) => {
           e.stopPropagation();
           const newTokens = [...tokens];
           newTokens.splice(vg.startIndex, vg.endIndex - vg.startIndex + 1);
           onChange(newTokens);
           if (activeIndex > vg.endIndex) {
              setActiveIndex(activeIndex - (vg.endIndex - vg.startIndex + 1));
           } else if (activeIndex >= vg.startIndex && activeIndex <= vg.endIndex) {
              setActiveIndex(vg.startIndex); // fallback
           }
        };

        const renderItem = () => {
          if (vg.type === 'group') {
            return (
              <div 
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer group bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                onClick={() => {
                   // Click to edit
                   setActiveIndex(vg.startIndex);
                   inputRef.current?.focus();
                   setShowDropdown(true);
                }}
                title="Click to edit"
              >
                {vg.label}
                <div onClick={removeGroup} className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-400/50 hover:text-red-400">
                  <X size={12} />
                </div>
              </div>
            );
          } else {
            const t = tokens[vg.startIndex];
            return (
              <div 
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium cursor-pointer group ${
                  t.type === 'bracket' ? 'text-text-primary/50 font-mono text-sm' :
                  t.type === 'logic' ? 'text-text-primary/40 uppercase text-[10px] tracking-widest bg-white/5' :
                  t.type === 'metric' ? 'bg-alpha/10 text-text-primary/80 border border-alpha/20' :
                  t.type === 'operator' ? 'text-alpha font-mono' :
                  'text-alpha bg-alpha/5 border border-alpha/10'
                }`}
                onClick={() => {
                  setActiveIndex(vg.startIndex + 1);
                  inputRef.current?.focus();
                  setShowDropdown(true);
                }}
              >
                {t.label || t.value}
                <div onClick={(e) => { e.stopPropagation(); removeAt(vg.startIndex); }} className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-text-primary/40 hover:text-red-400">
                   <X size={10} />
                </div>
              </div>
            );
          }
        };

        return (
          <React.Fragment key={vg.startIndex}>
            {renderInputBefore && renderInputBox()}
            {renderItem()}
          </React.Fragment>
        );
      })}
      
      {/* If activeIndex is at the very end */}
      {activeIndex === tokens.length && renderInputBox()}

      {tokens.length > 0 && (
         <button onClick={() => { onChange([]); setActiveIndex(0); }} className="ml-auto text-[10px] text-text-primary/30 hover:text-text-primary uppercase font-bold tracking-wider px-2 py-1 rounded bg-white/5 transition-colors">
            Clear
         </button>
      )}
    </div>
  );
};
