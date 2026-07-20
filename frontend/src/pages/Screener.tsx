import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SlidersHorizontal, Plus, X, Settings2, ChevronDown,
  Search, Layers, BarChart2, RefreshCw, TrendingUp
} from 'lucide-react';
import { ScreenerResultsTable } from '../components/ScreenerResultsTable';
import { QueryBuilder, type QueryToken } from '../components/QueryBuilder';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Metric { key: string; label: string; group: string; type: string; options?: string[]; }

// ─── Default columns per mode ─────────────────────────────────────────────────
const DEFAULT_STOCK_COLS  = ['market_cap', 'live_price', 'day_change_pct', 'pe_ratio', 'roe', 'rs_rating', 'debt_to_equity', 'piotroski_f'];
const DEFAULT_MF_COLS     = ['aum', 'nav', 'return1y', 'return3y', 'return5y', 'sip_return3y', 'expense_ratio', 'groww_rating'];
const DEFAULT_ETF_COLS    = ['aum', 'live_price', 'day_change_pct', 'return_1y', 'return_3y', 'expense_ratio', 'tracking_error', 'pe_ratio'];
const DEFAULT_STOCK_SORT  = 'market_cap';
const DEFAULT_MF_SORT     = 'aum';
const DEFAULT_ETF_SORT    = 'aum';

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
const GROUP_ORDER_ETF = [
  'Identity','Price','Size & Cost','Valuation','Rank',
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
  const [mode, setMode]   = useState<'stocks' | 'mutual_funds' | 'etfs'>('stocks');
  const [queryTokens, setQueryTokens] = useState<QueryToken[]>([]);
  const [columns, setColumns]   = useState<string[]>(DEFAULT_STOCK_COLS);
  const [sortBy, setSortBy]     = useState<string>(DEFAULT_STOCK_SORT);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [results, setResults]   = useState<any[]>([]);
  const [allMetrics, setAllMetrics] = useState<Metric[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState<string | null>(null);
  const [columnPanelOpen, setColumnPanelOpen] = useState(false);
  const [colSearch, setColSearch] = useState('');
  const [pendingLogic, setPendingLogic] = useState<string | null>(null);
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

  // Reset everything when mode changes
  useEffect(() => {
    if (mode === 'stocks') {
      setColumns(DEFAULT_STOCK_COLS);
      setSortBy(DEFAULT_STOCK_SORT);
    } else if (mode === 'mutual_funds') {
      setColumns(DEFAULT_MF_COLS);
      setSortBy(DEFAULT_MF_SORT);
    } else {
      setColumns(DEFAULT_ETF_COLS);
      setSortBy(DEFAULT_ETF_SORT);
    }
    setQueryTokens([]);
    setPage(1);
    setFilterPanelOpen(null);
    setPendingLogic(null);
  }, [mode]);

  // Fetch
  const latestReqRef = useRef(0);
  const fetchResults = useCallback(async () => {
    // Only fetch if query is empty or validly terminated
    if (queryTokens.length > 0) {
      const last = queryTokens[queryTokens.length - 1];
      if (last.type !== 'value' && !(last.type === 'bracket' && last.value === ')')) {
        return;
      }
    }

    const reqId = ++latestReqRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const endpoint = mode === 'stocks'
        ? `${API_BASE_URL}/api/screener/stocks`
        : mode === 'etfs'
          ? `${API_BASE_URL}/api/screener/etfs`
          : `${API_BASE_URL}/api/screener/mutual-funds`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_tokens: queryTokens,
          columns,
          sort_by: sortBy,
          sort_order: sortOrder,
          page,
          limit: 100
        })
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
  }, [mode, queryTokens, columns, sortBy, sortOrder, page]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  // ── Grouped metrics for panels ──────────────────────────────────────────────
  const groupOrder = mode === 'stocks' ? GROUP_ORDER_STOCKS : mode === 'etfs' ? GROUP_ORDER_ETF : GROUP_ORDER_MF;
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
  const handleQueryChange = (newTokens: QueryToken[]) => {
    setQueryTokens(newTokens);
    setPage(1);
  };

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
    <div className="flex flex-col h-full bg-canvas text-text-primary overflow-hidden">

      {/* ── TOP HEADER BAR ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border bg-surface shrink-0">
        {/* Icon + Title */}
        <div className="flex items-center gap-3 mr-2">
          <div className="w-9 h-9 rounded-lg border border-alpha/25 bg-alpha/10 flex items-center justify-center">
            <SlidersHorizontal size={18} className="text-alpha" />
          </div>
          <div>
            <h1 className="text-base font-bold text-text-primary leading-tight">Screener Engine</h1>
            <p className="text-[11px] text-text-primary/30 leading-tight">
              {total.toLocaleString()} {mode === 'stocks' ? 'stocks' : mode === 'etfs' ? 'ETFs' : 'funds'} · {allMetrics.length} metrics
            </p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-surface-hover p-0.5 rounded-lg border border-border">
          {(['stocks', 'etfs', 'mutual_funds'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                mode === m
                  ? 'bg-alpha text-white shadow-lg shadow-alpha/20'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {m === 'stocks' ? '📊 Stocks' : m === 'etfs' ? '📈 ETFs' : '📉 Mutual Funds'}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Sort indicator */}
        {sortBy && (
          <div className="flex items-center gap-1.5 text-xs text-text-primary/30 bg-surface border border-border rounded-lg px-3 py-1.5">
            <BarChart2 size={12} className="text-alpha" />
            Sorted by <span className="text-text-primary/60 font-medium">{labelOf(sortBy)}</span>
            <span className="text-alpha font-bold">{sortOrder === 'desc' ? '↓' : '↑'}</span>
          </div>
        )}

        {/* Column picker */}
        <div className="relative" ref={colPanelRef}>
          <button
            onClick={() => { setColumnPanelOpen(v => !v); setFilterPanelOpen(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              columnPanelOpen
                ? 'bg-surface-hover border-border text-text-primary'
                : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover'
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
          title="Refresh"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── QUERY BUILDER AREA ───────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-border bg-surface flex flex-col gap-3">
         
         <div className="flex gap-2 w-full">
            <QueryBuilder 
               tokens={queryTokens} 
               onChange={handleQueryChange} 
               metrics={allMetrics} 
               groupColors={GROUP_COLORS}
            />
         </div>

         {/* Category quick buttons */}
         <div className="flex items-center gap-1.5 flex-wrap" ref={filterPanelRef}>
            <span className="text-[10px] text-text-primary/30 uppercase font-bold tracking-widest mr-2">Categories</span>
            {(mode === 'stocks' ? GROUP_ORDER_STOCKS : mode === 'etfs' ? GROUP_ORDER_ETF : GROUP_ORDER_MF).map(group => {
               const groupMetrics = allMetrics.filter(m => m.group === group);
               if (!groupMetrics.length) return null;
               
               return (
                  <button
                     key={group}
                     onClick={() => setFilterPanelOpen(v => v === group ? null : group)}
                     className={`px-3 py-1 text-[10px] uppercase tracking-wider font-bold rounded border transition-all ${
                        filterPanelOpen === group
                           ? 'bg-alpha/10 border-alpha/30 text-text-primary'
                           : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-border'
                     }`}
                  >
                     {group}
                  </button>
               );
            })}
         </div>

         {/* Quick Insert Metrics for active group */}
         {filterPanelOpen && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border mt-1">
               {allMetrics.filter(m => m.group === filterPanelOpen).map(m => (
                  <button
                     key={m.key}
                     onClick={() => {
                        // Insert metric at end
                        handleQueryChange([...queryTokens, { type: 'metric', value: m.key, label: m.label, options: m.options, metricType: m.type }]);
                     }}
                     className="px-2 py-1 bg-surface-hover hover:bg-alpha/20 border border-border hover:border-alpha/30 rounded text-xs text-text-primary/70 hover:text-text-primary transition-colors"
                  >
                     {m.label} <span className="opacity-0 group-hover:opacity-100 ml-1 text-alpha/50">+</span>
                  </button>
               ))}
            </div>
         )}
      </div>

      {/* ── ERROR ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-xs font-mono">
          ⚠ Syntax error
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



// ─── Column Picker Panel ───────────────────────────────────────────────────────
const ColumnPickerPanel: React.FC<{
  grouped: Record<string, Metric[]>;
  columns: string[];
  searchVal: string;
  onSearch: (s: string) => void;
  onToggle: (key: string) => void;
  groupColors: Record<string, string>;
}> = ({ grouped, columns, searchVal, onSearch, onToggle, groupColors }) => (
  <div className="absolute top-full right-0 mt-2 z-50 w-72 bg-surface-hover border border-border rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col">
    {/* Search */}
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
      <Search size={13} className="text-text-primary/30 shrink-0" />
      <input
        autoFocus
        value={searchVal}
        onChange={e => onSearch(e.target.value)}
        placeholder="Search columns…"
        className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder-white/25"
      />
    </div>

    {/* Quick actions */}
    <div className="flex gap-2 px-3 py-2 border-b border-white/[0.04]">
      <span className="text-[11px] text-text-primary/30 flex-1">{columns.length} selected</span>
    </div>

    {/* Metric checkboxes */}
    <div className="overflow-y-auto max-h-80 custom-scrollbar">
      {Object.entries(grouped).map(([group, metrics]) => (
        <div key={group}>
          <div className={`px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider ${groupColors[group] ?? 'text-text-primary/30'}`}>
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
                className={`flex-1 ${columns.includes(m.key) ? 'text-text-primary' : 'text-text-primary/50 group-hover:text-text-primary/70'}`}
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
