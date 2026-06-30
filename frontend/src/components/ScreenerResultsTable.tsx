import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, ArrowUpDown, Download, ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  data: any[];
  isLoading: boolean;
  mode?: 'stocks' | 'mutual_funds';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  availableMetrics?: { key: string; label: string; group: string; type: string }[];
  columns?: string[];
  total?: number;
  page?: number;
  onPageChange?: (p: number) => void;
}

const METRIC_LABELS: Record<string, string> = {};

function fmtVal(key: string, val: any): React.ReactNode {
  if (val === null || val === undefined) return <span className="text-white/20">—</span>;

  const k = key.toLowerCase();

  // Percentage-like fields
  const isPct = k.includes('yoy') || k.includes('cagr') || k.includes('margin') ||
    k.includes('yield') || k.includes('roe') || k.includes('roa') || k.includes('roic') ||
    k.includes('return') || k.includes('pct') || k.includes('day_change') || k.includes('sip_');
  // Price-like fields
  const isPrice = k === 'live_price' || k === 'book_value' || k === 'face_value' ||
    k === 'eps_ttm' || k === 'graham_number' || k.includes('sma') || k.includes('ema') ||
    k.includes('bollinger') || k.includes('pivot') || k.includes('resistance') || k.includes('support') ||
    k === 'nav' || k === 'atr14';
  // Market cap
  const isMcap = k === 'market_cap' || k === 'aum';

  if (typeof val === 'number') {
    if (isMcap) {
      if (val >= 100000) return <span>{(val / 100000).toFixed(2)}L Cr</span>;
      if (val >= 1000)   return <span>{(val / 1000).toFixed(2)}K Cr</span>;
      return <span>₹{val.toFixed(0)} Cr</span>;
    }
    if (isPrice) return <span>₹{val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
    if (isPct) {
      const color = val > 0 ? 'text-emerald-400' : val < 0 ? 'text-red-400' : 'text-white/50';
      return <span className={color}>{val > 0 ? '+' : ''}{val.toFixed(2)}%</span>;
    }
    // Ratio / score
    return <span>{val.toFixed(2)}</span>;
  }
  if (typeof val === 'boolean') return <span className={val ? 'text-emerald-400' : 'text-red-400'}>{val ? 'Yes' : 'No'}</span>;
  return <span className="text-white/80">{String(val)}</span>;
}

function DayChangeBadge({ val }: { val: string | null }) {
  if (!val) return <span className="text-white/20">—</span>;
  const pct = parseFloat(String(val).replace(/[^-\d.]/g, ''));
  if (isNaN(pct)) return <span className="text-white/50 text-xs">{val}</span>;
  const isPos = pct >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
      {isPos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {isPos ? '+' : ''}{pct.toFixed(2)}%
    </span>
  );
}

export const ScreenerResultsTable: React.FC<Props> = ({
  data, isLoading, mode = 'stocks', sortBy = '', sortOrder = 'desc',
  onSort, availableMetrics = [], columns = [], total = 0, page = 1, onPageChange
}) => {
  const navigate = useNavigate();

  // Build label map
  const labelMap = Object.fromEntries(availableMetrics.map(m => [m.key, m.label]));

  const handleRowClick = (row: any) => {
    if (mode === 'stocks' && row.slug) {
      navigate(`/terminal/${row.slug}`);
    } else if (mode === 'mutual_funds' && row.scheme_code) {
      navigate(`/mutual-funds/${row.scheme_code}`);
    }
  };

  // Fixed columns always shown first
  const fixedCols = mode === 'stocks'
    ? ['ticker', 'name', 'market_cap_type']
    : ['fund_name', 'category', 'risk'];

  // Get all numeric/value columns from data (excluding fixed + logo)
  const extraCols = data.length > 0
    ? Object.keys(data[0]).filter(k =>
        !fixedCols.includes(k) &&
        !['slug', 'logo_url', 'scheme_code', 'scheme_name', 'direct_search_id', 'industry', 'market_cap_type'].includes(k) &&
        k !== 'name'
      )
    : columns.filter(c => !fixedCols.includes(c));

  const exportCSV = () => {
    if (!data.length) return;
    const allCols = [...fixedCols, ...extraCols];
    
    const getLabel = (k: string) => {
      if (k === 'ticker') return 'Ticker';
      if (k === 'name') return 'Company Name';
      if (k === 'market_cap_type') return 'Cap Type';
      if (k === 'fund_name') return 'Fund Name';
      if (k === 'category') return 'Category';
      if (k === 'risk') return 'Risk';
      return labelMap[k] || k;
    };
    
    const headers = allCols.map(getLabel).join(',');
    const rows = data.map(r => 
      allCols.map(k => {
        const val = r[k];
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );
    
    const blob = new Blob([headers + '\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `screener_${mode}_${Date.now()}.csv`;
    a.click();
  };

  const totalPages = Math.ceil(total / 100) || 1;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-9 rounded-md bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
          <ArrowUpDown size={28} className="text-white/20" />
        </div>
        <p className="text-text-secondary text-sm">No results match your filters.</p>
        <p className="text-text-secondary/60 text-xs">Try relaxing a filter or removing one.</p>
      </div>
    );
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown size={11} className="text-white/30 hover:text-white transition-colors cursor-pointer" />;
    return sortOrder === 'asc'
      ? <ArrowUp size={11} className="text-alpha cursor-pointer" />
      : <ArrowDown size={11} className="text-alpha cursor-pointer" />;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Export bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#0d0d10] shrink-0">
        <span className="text-xs text-text-secondary">
          <span className="text-white font-semibold">{total.toLocaleString()}</span> results
          {total > 100 && <> &mdash; page <span className="text-white">{page}</span> of <span className="text-white">{totalPages}</span></>}
        </span>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium text-text-secondary hover:text-white hover:bg-white/5 border border-white/10 transition-all"
        >
          <Download size={12} /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1 relative custom-scrollbar">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#0f0f13] border-b border-white/8">
              {/* Row number */}
              <th className="pl-4 pr-2 py-2.5 text-[10px] font-bold text-white/30 uppercase w-10">#</th>
              {/* Logo */}
              <th className="px-2 py-2.5 w-10" />
              {/* Ticker / Name */}
              {mode === 'stocks' ? (
                <>
                  <th
                    className="px-3 py-2.5 text-[10px] font-bold text-white/50 uppercase cursor-pointer hover:text-alpha group select-none min-w-[80px]"
                    onClick={() => onSort?.('ticker')}
                  >
                    <div className="flex items-center gap-1">Ticker <SortIcon col="ticker" /></div>
                  </th>
                  <th
                    className="px-3 py-2.5 text-[10px] font-bold text-white/50 uppercase cursor-pointer hover:text-alpha group select-none min-w-[160px]"
                    onClick={() => onSort?.('name')}
                  >
                    <div className="flex items-center gap-1">Name <SortIcon col="name" /></div>
                  </th>
                  <th
                    className="px-3 py-2.5 text-[10px] font-bold text-white/50 uppercase cursor-pointer hover:text-alpha group select-none min-w-[80px]"
                    onClick={() => onSort?.('market_cap_type')}
                  >
                    <div className="flex items-center gap-1">Cap <SortIcon col="market_cap_type" /></div>
                  </th>
                </>
              ) : (
                <>
                  <th
                    className="px-3 py-2.5 text-[10px] font-bold text-white/50 uppercase cursor-pointer hover:text-alpha group select-none min-w-[200px]"
                    onClick={() => onSort?.('fund_name')}
                  >
                    <div className="flex items-center gap-1">Fund Name <SortIcon col="fund_name" /></div>
                  </th>
                  <th
                    className="px-3 py-2.5 text-[10px] font-bold text-white/50 uppercase cursor-pointer hover:text-alpha group select-none min-w-[80px]"
                    onClick={() => onSort?.('category')}
                  >
                    <div className="flex items-center gap-1">Category <SortIcon col="category" /></div>
                  </th>
                  <th
                    className="px-3 py-2.5 text-[10px] font-bold text-white/50 uppercase cursor-pointer hover:text-alpha group select-none min-w-[80px]"
                    onClick={() => onSort?.('risk')}
                  >
                    <div className="flex items-center gap-1">Risk <SortIcon col="risk" /></div>
                  </th>
                </>
              )}
              {/* Dynamic metric columns */}
              {extraCols.map(col => (
                <th
                  key={col}
                  className="px-3 py-2.5 text-[10px] font-bold text-white/50 uppercase cursor-pointer hover:text-alpha group select-none text-right min-w-[100px]"
                  onClick={() => onSort?.(col)}
                >
                  <div className="flex items-center justify-end gap-1">
                    {labelMap[col] || col.replace(/_/g, ' ')}
                    <SortIcon col={col} />
                  </div>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                onClick={() => handleRowClick(row)}
                className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer group transition-colors"
              >
                {/* Row number */}
                <td className="pl-4 pr-2 py-2 text-[11px] text-white/20 tabular-nums">
                  {(page - 1) * 100 + i + 1}
                </td>

                {/* Logo */}
                <td className="px-2 py-2 w-10">
                  {row.logo_url ? (
                    <img
                      src={row.logo_url}
                      alt=""
                      className="w-7 h-7 rounded-md object-contain bg-white/5 border border-white/10 p-0.5"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-md bg-alpha/20 border border-alpha/20 flex items-center justify-center text-[9px] font-bold text-alpha">
                      {(row.ticker || row.fund_name || '?').substring(0, 2)}
                    </div>
                  )}
                </td>

                {/* Identity columns */}
                {mode === 'stocks' ? (
                  <>
                    <td className="px-3 py-2">
                      <span className="text-xs font-bold text-alpha">{row.ticker}</span>
                    </td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <span className="text-xs text-white truncate block">{row.name}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-sm ${
                        row.market_cap_type?.includes('Large') ? 'bg-blue-500/15 text-blue-400' :
                        row.market_cap_type?.includes('Mid')   ? 'bg-purple-500/15 text-purple-400' :
                        'bg-orange-500/15 text-orange-400'
                      }`}>
                        {(row.market_cap_type || '').replace(' Cap', '')}
                      </span>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 max-w-[220px]">
                      <span className="text-xs font-semibold text-white truncate block">{row.fund_name}</span>
                      <span className="text-[10px] text-white/40 truncate block">{row.scheme_name}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-sm bg-blue-500/15 text-blue-400">{row.category}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-semibold ${
                        row.risk === 'Very High' ? 'text-red-400' :
                        row.risk === 'High' ? 'text-orange-400' :
                        row.risk === 'Moderately High' ? 'text-yellow-400' :
                        'text-emerald-400'
                      }`}>{row.risk}</span>
                    </td>
                  </>
                )}

                {/* Dynamic columns */}
                {extraCols.map(col => (
                  <td key={col} className="px-3 py-2 text-right text-xs tabular-nums">
                    {fmtVal(col, row[col])}
                  </td>
                ))}

                {/* External link icon */}
                <td className="pr-3 py-2 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink size={12} className="text-white/40" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/5 bg-[#0d0d10] shrink-0">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
            className="px-3 py-1 text-xs font-medium text-text-secondary bg-surface border border-border rounded-md hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, j) => {
              let p = j + 1;
              if (totalPages > 7) {
                if (page <= 4) p = j + 1;
                else if (page >= totalPages - 3) p = totalPages - 6 + j;
                else p = page - 3 + j;
              }
              return (
                <button
                  key={p}
                  onClick={() => onPageChange?.(p)}
                  className={`w-7 h-7 text-xs font-medium rounded-md transition-colors ${
                    p === page
                      ? 'bg-alpha text-white'
                      : 'text-text-secondary hover:text-white hover:bg-white/5'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange?.(page + 1)}
            className="px-3 py-1 text-xs font-medium text-text-secondary bg-surface border border-border rounded-md hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};
