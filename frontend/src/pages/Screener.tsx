import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SlidersHorizontal, Plus, X, Settings2, ChevronDown,
  Search, Layers, BarChart2, RefreshCw, TrendingUp
} from 'lucide-react';
import { ScreenerResultsTable } from '../components/ScreenerResultsTable';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Metric { key: string; label: string; group: string; type: string; options?: string[]; }
interface FilterClause { field: string; op: string; value: string; logic?: 'AND'|'OR'; op2?: string; value2?: string; outerLogic?: 'AND'|'OR'; }

// ─── Default columns per mode ─────────────────────────────────────────────────
const DEFAULT_STOCK_COLS  = ['market_cap', 'live_price', 'day_change_pct', 'pe_ratio', 'roe', 'rs_rating', 'debt_to_equity', 'piotroski_f'];
const DEFAULT_MF_COLS     = ['aum', 'nav', 'return1y', 'return3y', 'return5y', 'sip_return3y', 'expense_ratio', 'groww_rating'];
const DEFAULT_STOCK_SORT  = 'market_cap';
const DEFAULT_MF_SORT     = 'aum';

const OPS = ['>', '<', '>=', '<=', '=', '!='];

// ─── Group display order ──────────────────────────────────────────────────────
const GROUP_ORDER_STOCKS = [
  'Identity','Price','Valuation','Profitability','Dividends','Per-Share',
  'Health','Sector Relative','Moving Averages','Technical','Price Levels',
  'Growth','Shareholding','Health Scores','Forensic','Quant','Macro',
];
const GROUP_ORDER_MF = [
  'Identity','Size & Cost','Returns (Lump Sum)','Returns (SIP)','Benchmark','Availability',
];

// ─── Group accent colours ─────────────────────────────────────────────────────
const GROUP_COLORS: Record<string, string> = {
  'Identity':         'text-sky-400',
  'Price':            'text-yellow-400',
  'Valuation':        'text-purple-400',
  'Profitability':    'text-emerald-400',
  'Dividends':        'text-pink-400',
  'Per-Share':        'text-cyan-400',
  'Health':           'text-red-400',
  'Sector Relative':  'text-indigo-400',
  'Moving Averages':  'text-blue-400',
  'Technical':        'text-orange-400',
  'Price Levels':     'text-teal-400',
  'Growth':           'text-lime-400',
  'Shareholding':     'text-amber-400',
  'Health Scores':    'text-violet-400',
  'Forensic':         'text-rose-400',
  'Quant':            'text-fuchsia-400',
  'Macro':            'text-slate-400',
  'Size & Cost':      'text-sky-400',
  'Returns (Lump Sum)':'text-emerald-400',
  'Returns (SIP)':    'text-teal-400',
  'Benchmark':        'text-purple-400',
  'Availability':     'text-slate-400',
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const Screener: React.FC = () => {
  const [mode, setMode]   = useState<'stocks' | 'mutual_funds'>('stocks');
  const [filters, setFilters]   = useState<FilterClause[]>([]);
  const [columns, setColumns]   = useState<string[]>(DEFAULT_STOCK_COLS);
  const [sortBy, setSortBy]     = useState(DEFAULT_STOCK_SORT);
  const [sortOrder, setSortOrder] = useState<'asc'|'desc'>('desc');
  const [page, setPage]         = useState(1);
  const [results, setResults]   = useState<any[]>([]);
  const [total, setTotal]       = useState(0);
  const [allMetrics, setAllMetrics]   = useState<Metric[]>([]);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState<string|null>(null);

  // Panel state
  const [filterPanelOpen, setFilterPanelOpen]   = useState<string | null>(null);
  const [columnPanelOpen, setColumnPanelOpen]   = useState(false);
  const [filterSearch, setFilterSearch]         = useState('');
  const [colSearch, setColSearch]               = useState('');
  const [pendingLogic, setPendingLogic]         = useState<'AND'|'OR'|null>(null);

  const filterPanelRef = useRef<HTMLDivElement>(null);
  const colPanelRef    = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node))
        setFilterPanelOpen(null);
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node))
        setColumnPanelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset on mode switch
  useEffect(() => {
    setFilters([]);
    setColumns(mode === 'stocks' ? DEFAULT_STOCK_COLS : DEFAULT_MF_COLS);
    setSortBy(mode === 'stocks' ? DEFAULT_STOCK_SORT : DEFAULT_MF_SORT);
    setSortOrder('desc');
    setPage(1);
    setAllMetrics([]);
    setPendingLogic(null);
  }, [mode]);

  // Fetch
  const latestReqRef = useRef(0);
  const fetchResults = useCallback(async () => {
    const reqId = ++latestReqRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const endpoint = mode === 'stocks'
        ? 'http://127.0.0.1:8000/api/screener/stocks'
        : 'http://127.0.0.1:8000/api/screener/mutual-funds';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: filters.map(f => ({
            field: f.field, op: f.op,
            value: isNaN(Number(f.value)) ? f.value : Number(f.value),
            ...(f.logic && f.op2 && f.value2 ? {
              logic: f.logic,
              op2: f.op2,
              value2: isNaN(Number(f.value2)) ? f.value2 : Number(f.value2)
            } : {}),
            ...(f.outerLogic ? { outerLogic: f.outerLogic } : {})
          })),
          sort_by: sortBy,
          sort_order: sortOrder,
          columns,
          page,
          limit: 100,
        }),
      });
      if (reqId !== latestReqRef.current) return;
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Screener API error');
      }
      const json = await res.json();
      setResults(json.data ?? []);
      setTotal(json.total ?? 0);
      if (json.available_metrics?.length) setAllMetrics(json.available_metrics);
    } catch (e: any) {
      if (reqId === latestReqRef.current) {
        setError(e.message);
      }
    } finally {
      if (reqId === latestReqRef.current) {
        setIsLoading(false);
      }
    }
  }, [mode, filters, columns, sortBy, sortOrder, page]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  // ── Grouped metrics for panels ──────────────────────────────────────────────
  const groupOrder = mode === 'stocks' ? GROUP_ORDER_STOCKS : GROUP_ORDER_MF;
  const grouped = groupOrder.reduce((acc, g) => {
    const ms = allMetrics.filter(m => m.group === g);
    if (ms.length) acc[g] = ms;
    return acc;
  }, {} as Record<string, Metric[]>);

  const filteredGrouped = (search: string) =>
    Object.fromEntries(
      Object.entries(grouped).map(([g, ms]) => [
        g, ms.filter(m => m.label.toLowerCase().includes(search.toLowerCase()) ||
                          m.key.toLowerCase().includes(search.toLowerCase()))
      ]).filter(([, ms]) => ms.length > 0)
    );

  const labelOf = (key: string) => allMetrics.find(m => m.key === key)?.label ?? key;

  // ── Filter handlers ─────────────────────────────────────────────────────────
  const addFilter = (field: string, op: string, value: string, logic?: 'AND'|'OR', op2?: string, value2?: string) => {
    if (!value.trim()) return;
    setFilters(prev => [...prev, { field, op, value, logic, op2, value2, outerLogic: prev.length > 0 ? (pendingLogic || 'AND') : undefined }]);
    setPendingLogic(null);
    setPage(1);
    setFilterPanelOpen(null);
  };
  const removeFilter = (i: number) => { setFilters(f => f.filter((_, j) => j !== i)); setPage(1); };

  // ── Column handlers ─────────────────────────────────────────────────────────
  const toggleCol = (key: string) => {
    setColumns(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  };

  // ── Sort handler ────────────────────────────────────────────────────────────
  const handleSort = (key: string) => {
    if (sortBy === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortOrder('desc'); }
    setPage(1);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#09090c] text-white overflow-hidden">

      {/* ── TOP HEADER BAR ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/[0.06] bg-[#0c0c10] shrink-0">
        {/* Icon + Title */}
        <div className="flex items-center gap-3 mr-2">
          <div className="w-9 h-9 rounded-lg border border-alpha/25 bg-alpha/10 flex items-center justify-center">
            <SlidersHorizontal size={18} className="text-alpha" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Screener Engine</h1>
            <p className="text-[11px] text-white/30 leading-tight">
              {total.toLocaleString()} {mode === 'stocks' ? 'stocks' : 'funds'} · {allMetrics.length} metrics
            </p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-white/[0.05] p-0.5 rounded-lg border border-white/[0.08]">
          {(['stocks', 'mutual_funds'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                mode === m
                  ? 'bg-alpha text-white shadow-lg shadow-alpha/20'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {m === 'stocks' ? '📊 Stocks' : '📈 Mutual Funds'}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Sort indicator */}
        {sortBy && (
          <div className="flex items-center gap-1.5 text-xs text-white/30 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5">
            <BarChart2 size={12} className="text-alpha" />
            Sorted by <span className="text-white/60 font-medium">{labelOf(sortBy)}</span>
            <span className="text-alpha font-bold">{sortOrder === 'desc' ? '↓' : '↑'}</span>
          </div>
        )}

        {/* Column picker */}
        <div className="relative" ref={colPanelRef}>
          <button
            onClick={() => { setColumnPanelOpen(v => !v); setFilterPanelOpen(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              columnPanelOpen
                ? 'bg-white/10 border-white/20 text-white'
                : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.07]'
            }`}
          >
            <Settings2 size={13} />
            Columns <span className="text-alpha font-bold">({columns.length})</span>
            <ChevronDown size={11} className={`transition-transform ${columnPanelOpen ? 'rotate-180' : ''}`} />
          </button>

          {columnPanelOpen && (
            <ColumnPickerPanel
              grouped={filteredGrouped(colSearch)}
              columns={columns}
              searchVal={colSearch}
              onSearch={setColSearch}
              onToggle={toggleCol}
              groupColors={GROUP_COLORS}
            />
          )}
        </div>

        {/* Refresh */}
        <button
          onClick={fetchResults}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.07] transition-all"
          title="Refresh"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── FILTER CHIPS ─────────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-white/[0.06] bg-[#111116] flex items-center gap-2 flex-wrap min-h-[52px]">
        {/* Active filter chips */}
        {filters.map((f, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <select
                value={f.outerLogic || 'AND'}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilters(prev => {
                    const copy = [...prev];
                    copy[i].outerLogic = val as 'AND' | 'OR';
                    return copy;
                  });
                  setPage(1);
                }}
                className="pl-2.5 pr-6 py-0.5 text-[9px] font-bold uppercase rounded bg-alpha/10 text-alpha hover:bg-alpha/20 border border-alpha/20 outline-none cursor-pointer"
                title="Select AND / OR"
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-alpha/10 border border-alpha/25 text-xs font-semibold">
              <span className="text-white/50">{labelOf(f.field)}</span>
            <span className="text-white/30">{f.op}</span>
            <span className="text-alpha">{f.value}</span>
            {f.logic && f.op2 && f.value2 && (
              <>
                <span className="text-white/20 mx-0.5 text-[10px] uppercase font-bold">{f.logic}</span>
                <span className="text-white/30">{f.op2}</span>
                <span className="text-alpha">{f.value2}</span>
              </>
            )}
            <button
              onClick={() => removeFilter(i)}
              className="ml-1 text-white/30 hover:text-white transition-colors"
            >
              <X size={11} />
            </button>
            </div>
          </React.Fragment>
        ))}
        {filters.length > 0 && (
          <select
            value={pendingLogic || ''}
            onChange={e => setPendingLogic(e.target.value as 'AND' | 'OR')}
            className={`pl-3 pr-7 py-1 text-[10px] font-bold uppercase rounded-full border outline-none cursor-pointer transition-all ${
              pendingLogic 
                ? 'bg-alpha/10 text-alpha border-alpha/20'
                : 'bg-white/5 text-white/40 border-white/10 hover:text-white hover:bg-white/10'
            }`}
          >
            <option value="" disabled>AND / OR</option>
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
        )}

        {/* Filter Group Buttons */}
        <div className="flex items-center gap-2 flex-wrap relative" ref={filterPanelRef}>
          {(mode === 'stocks' ? GROUP_ORDER_STOCKS : GROUP_ORDER_MF).map(group => {
            const groupMetrics = allMetrics.filter(m => m.group === group);
            if (!groupMetrics.length) return null;
            
            return (
              <div key={group} className="relative">
                <button
                  onClick={() => {
                    setFilterPanelOpen(v => v === group ? null : group);
                    setColumnPanelOpen(false);
                    setFilterSearch('');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    filterPanelOpen === group
                      ? 'bg-alpha/20 border-alpha/40 text-white'
                      : 'border-dashed border-white/20 text-white/40 hover:text-white hover:border-white/40 hover:bg-white/5'
                  }`}
                >
                  <Plus size={11} />
                  {group}
                </button>

                {filterPanelOpen === group && (
                  <FilterPickerPanel
                    grouped={{ [group]: filteredGrouped(filterSearch)[group] || [] }}
                    searchVal={filterSearch}
                    onSearch={setFilterSearch}
                    groupColors={GROUP_COLORS}
                    onAdd={addFilter}
                    onSortAdd={(key) => {
                      setColumns(prev => {
                        const copy = prev.filter(c => c !== key);
                        const capIndex = copy.indexOf(mode === 'stocks' ? 'market_cap' : 'aum');
                        if (capIndex !== -1) {
                          copy.splice(capIndex + 1, 0, key);
                        } else {
                          copy.unshift(key);
                        }
                        return copy;
                      });
                      setSortBy(key);
                      setSortOrder('desc');
                      setFilterPanelOpen(null);
                      setPage(1);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {filters.length > 0 && (
          <button
            onClick={() => { setFilters([]); setPage(1); }}
            className="flex items-center gap-1 text-xs text-white/30 hover:text-white/70 transition-colors ml-1"
          >
            <X size={11} /> Clear all
          </button>
        )}
      </div>

      {/* ── ERROR ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-xs font-mono">
          ⚠ {error}
        </div>
      )}

      {/* ── TABLE AREA ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <ScreenerResultsTable
          data={results}
          isLoading={isLoading}
          mode={mode}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          availableMetrics={allMetrics}
          columns={columns}
          total={total}
          page={page}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
};

// ─── Filter Picker Panel ───────────────────────────────────────────────────────
const FilterPickerPanel: React.FC<{
  grouped: Record<string, Metric[]>;
  searchVal: string;
  onSearch: (s: string) => void;
  onAdd: (field: string, op: string, value: string, logic?: 'AND'|'OR', op2?: string, value2?: string) => void;
  groupColors: Record<string, string>;
  onSortAdd?: (key: string) => void;
}> = ({ grouped, searchVal, onSearch, onAdd, groupColors, onSortAdd }) => {
  const [activeMetric, setActiveMetric] = useState<Metric | null>(null);
  const [op, setOp]     = useState('>');
  const [val, setVal]   = useState('');
  
  const [showChain, setShowChain] = useState(false);
  const [logic, setLogic] = useState<'AND'|'OR'>('AND');
  const [op2, setOp2]   = useState('<');
  const [val2, setVal2] = useState('');
  
  const inputRef        = useRef<HTMLInputElement>(null);

  useEffect(() => { if (activeMetric) setTimeout(() => inputRef.current?.focus(), 50); }, [activeMetric]);

  return (
    <div className="absolute top-full left-0 mt-2 z-50 w-80 bg-[#17171d] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col">
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
        <Search size={13} className="text-white/30 shrink-0" />
        <input
          autoFocus
          value={searchVal}
          onChange={e => { onSearch(e.target.value); setActiveMetric(null); }}
          placeholder="Search metrics…"
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder-white/25"
        />
      </div>

      {/* Metric list */}
      <div className="overflow-y-auto max-h-72 custom-scrollbar">
        {Object.entries(grouped).map(([group, metrics]) => (
          <div key={group}>
            <div className={`px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider ${groupColors[group] ?? 'text-white/30'}`}>
              {group}
            </div>
            {metrics.map(m => (
              <div key={m.key} className="group flex items-center justify-between w-full px-1 py-0.5 transition-colors hover:bg-white/[0.05]">
                <button
                  onClick={() => { 
                    setActiveMetric(m); 
                    setOp(m.type === 'string' ? '=' : '>');
                    setVal(''); 
                    setShowChain(false);
                    setLogic('AND');
                    setOp2(m.type === 'string' ? '!=' : '<');
                    setVal2('');
                  }}
                  className={`flex-1 text-left px-2 py-1 text-xs rounded transition-colors ${
                    activeMetric?.key === m.key
                      ? 'bg-alpha/15 text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
                {onSortAdd && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSortAdd(m.key);
                    }}
                    className="hidden group-hover:block mr-2 px-1.5 py-0.5 bg-white/5 hover:bg-white/15 text-white/50 hover:text-white rounded text-[9px] uppercase font-bold transition-colors"
                  >
                    Sort By
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
        {Object.keys(grouped).length === 0 && (
          <p className="px-3 py-6 text-xs text-white/30 text-center">No metrics match "{searchVal}"</p>
        )}
      </div>

      {/* Filter builder (shown when a metric is selected) */}
      {activeMetric && (
        <div className="border-t border-white/[0.06] px-3 py-3 bg-[#1c1c23]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] text-white/50 font-medium truncate">{activeMetric.label}</p>
            {!showChain && (
              <button
                onClick={() => setShowChain(true)}
                className="text-[9px] font-bold text-white/30 hover:text-white uppercase tracking-wider transition-colors bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded"
              >
                + Add more
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <select
                value={op}
                onChange={e => setOp(e.target.value)}
                className="bg-[#0d0d10] text-white text-xs border border-white/10 rounded-lg px-2 py-1.5 outline-none focus:border-alpha w-16"
              >
                {(activeMetric.type === 'string' ? ['=', '!='] : OPS).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {activeMetric.options && activeMetric.options.length > 0 ? (
                <select
                  value={val}
                  onChange={e => setVal(e.target.value)}
                  className="flex-1 bg-[#0d0d10] text-white text-xs border border-white/10 rounded-lg px-3 py-1.5 outline-none focus:border-alpha"
                >
                  <option value="" disabled>Select...</option>
                  {activeMetric.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input
                  ref={inputRef}
                  type={activeMetric.type === 'string' ? 'text' : 'number'}
                  value={val}
                  onChange={e => setVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && val) {
                      if (showChain && !val2) return;
                      onAdd(activeMetric.key, op, val, showChain ? logic : undefined, showChain ? op2 : undefined, showChain ? val2 : undefined);
                    }
                  }}
                  placeholder="Value"
                  className="flex-1 bg-[#0d0d10] text-white text-xs border border-white/10 rounded-lg px-3 py-1.5 outline-none focus:border-alpha placeholder-white/20"
                />
              )}
            </div>
            
            {showChain && (
              <div className="flex items-center gap-2 relative mt-1">
                <div className="absolute -top-3 left-6 w-px h-3 bg-white/10" />
                <select
                  value={logic}
                  onChange={e => setLogic(e.target.value as 'AND' | 'OR')}
                  className="bg-[#0d0d10] text-white/50 text-[9px] font-bold uppercase border border-white/10 rounded-lg px-1 py-1 outline-none focus:border-alpha w-14 text-center tracking-wider shrink-0"
                >
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
                <select
                  value={op2}
                  onChange={e => setOp2(e.target.value)}
                  className="bg-[#0d0d10] text-white text-xs border border-white/10 rounded-lg px-2 py-1.5 outline-none focus:border-alpha w-16 shrink-0"
                >
                  {(activeMetric.type === 'string' ? ['=', '!='] : OPS).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {activeMetric.options && activeMetric.options.length > 0 ? (
                  <select
                    value={val2}
                    onChange={e => setVal2(e.target.value)}
                    className="flex-1 bg-[#0d0d10] text-white text-xs border border-white/10 rounded-lg px-3 py-1.5 outline-none focus:border-alpha"
                  >
                    <option value="" disabled>Select...</option>
                    {activeMetric.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    type={activeMetric.type === 'string' ? 'text' : 'number'}
                    value={val2}
                    onChange={e => setVal2(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && val && val2) {
                        onAdd(activeMetric.key, op, val, logic, op2, val2);
                      }
                    }}
                    placeholder="Value 2"
                    className="flex-1 bg-[#0d0d10] text-white text-xs border border-white/10 rounded-lg px-3 py-1.5 outline-none focus:border-alpha placeholder-white/20"
                  />
                )}
                <button
                  onClick={() => { setShowChain(false); setVal2(''); }}
                  className="p-1.5 text-red-400/50 hover:text-red-400 bg-red-400/5 hover:bg-red-400/10 rounded-lg transition-all shrink-0"
                  title="Remove chained condition"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            
            <button
              onClick={() => {
                if (val) {
                  onAdd(activeMetric.key, op, val, showChain ? logic : undefined, showChain ? op2 : undefined, showChain ? val2 : undefined);
                }
              }}
              disabled={!val || (showChain && !val2)}
              className="mt-1 w-full py-1.5 bg-alpha text-white text-xs font-semibold rounded-lg hover:bg-alpha/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Add Filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Column Picker Panel ───────────────────────────────────────────────────────
const ColumnPickerPanel: React.FC<{
  grouped: Record<string, Metric[]>;
  columns: string[];
  searchVal: string;
  onSearch: (s: string) => void;
  onToggle: (key: string) => void;
  groupColors: Record<string, string>;
}> = ({ grouped, columns, searchVal, onSearch, onToggle, groupColors }) => (
  <div className="absolute top-full right-0 mt-2 z-50 w-72 bg-[#17171d] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col">
    {/* Search */}
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
      <Search size={13} className="text-white/30 shrink-0" />
      <input
        autoFocus
        value={searchVal}
        onChange={e => onSearch(e.target.value)}
        placeholder="Search columns…"
        className="flex-1 bg-transparent text-sm text-white outline-none placeholder-white/25"
      />
    </div>

    {/* Quick actions */}
    <div className="flex gap-2 px-3 py-2 border-b border-white/[0.04]">
      <span className="text-[11px] text-white/30 flex-1">{columns.length} selected</span>
    </div>

    {/* Metric checkboxes */}
    <div className="overflow-y-auto max-h-80 custom-scrollbar">
      {Object.entries(grouped).map(([group, metrics]) => (
        <div key={group}>
          <div className={`px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider ${groupColors[group] ?? 'text-white/30'}`}>
            {group}
          </div>
          {metrics.map(m => (
            <label
              key={m.key}
              className="flex items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-white/[0.04] group"
            >
              <div
                onClick={() => onToggle(m.key)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                  columns.includes(m.key)
                    ? 'bg-alpha border-alpha'
                    : 'border-white/20 group-hover:border-white/40'
                }`}
              >
                {columns.includes(m.key) && (
                  <svg viewBox="0 0 10 8" className="w-2.5 fill-white">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span
                onClick={() => onToggle(m.key)}
                className={`flex-1 ${columns.includes(m.key) ? 'text-white' : 'text-white/50 group-hover:text-white/70'}`}
              >
                {m.label}
              </span>
              {m.type === 'flag' && (
                <span className="text-[9px] text-orange-400/60 bg-orange-400/10 px-1 py-0.5 rounded">0/1</span>
              )}
            </label>
          ))}
        </div>
      ))}
    </div>
  </div>
);

export default Screener;
