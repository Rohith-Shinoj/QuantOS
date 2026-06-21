import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks } from '../api';
import { Link, useNavigate } from 'react-router-dom';
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState } from '@tanstack/react-table';
import { Search, ArrowUpDown, AlertTriangle, Rocket, Landmark, Sparkles } from 'lucide-react';
import { InfoTooltip } from '../components/InfoTooltip';
import { StockLogo } from '../components/StockLogo';

type Stock = {
  slug: string;
  ticker: string;
  name: string;
  marketCap: string;
  industry: string;
  inst_accum: number;
  v_squeeze: number;
  qes_flag: number;
  rs_rating: number;
  alpha_score: number;
  shap_reason_1: string;
};

const columnHelper = createColumnHelper<Stock>();

export const Screener = ({ isPanel = false }: { isPanel?: boolean }) => {
  const navigate = useNavigate();
  const [globalFilter, setGlobalFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'alpha_score', desc: true }]);
  
  const { data: stocks, isLoading, error } = useQuery({
    queryKey: ['allStocks'],
    queryFn: fetchAllStocks,
  });

  const columns = [
    columnHelper.accessor('ticker', {
      header: 'Ticker',
      cell: info => (
        <div className="flex items-center gap-2">
          <StockLogo ticker={info.getValue() || ''} className="w-6 h-6" textClass="text-[8px]" fallbackClass="bg-surface border border-border text-text-primary" />
          <span className="font-bold text-text-primary">{info.getValue() || 'N/A'}</span>
        </div>
      ),
    }),
    columnHelper.accessor('alpha_score', {
      header: () => <span className="flex items-center">AI Score <InfoTooltip text="A proprietary machine-learning score (0-100) indicating the stock's probability of market outperformance." position="bottom" /></span>,
      cell: info => {
        const val = info.getValue() || 0;
        let color = "text-text-secondary";
        if (val > 0.8) color = "text-alpha font-bold";
        else if (val > 0.5) color = "text-alpha/80";
        else if (val < 0.2) color = "text-beta font-bold";
        return <span className={`${color} tabular-nums text-lg`}>{(val * 100).toFixed(0)}</span>;
      },
    }),
    columnHelper.accessor('rs_rating', {
      header: () => <span className="flex items-center">Momentum <InfoTooltip text="Relative Strength rating from 1-99. Higher numbers indicate stronger recent price trends compared to the broader market." position="bottom" /></span>,
      cell: info => {
        const val = info.getValue() || 0;
        let color = "text-text-secondary";
        if (val >= 80) color = "text-alpha font-bold";
        else if (val >= 60) color = "text-alpha/80";
        else if (val < 30) color = "text-beta";
        return <span className={`${color} tabular-nums`}>{val.toFixed(0)}</span>;
      },
    }),
    columnHelper.accessor('inst_accum', {
      header: () => <span className="flex items-center">Inst. Buying <InfoTooltip text="Quarter-over-quarter change in institutional ownership. Positive values suggest 'smart money' accumulation." position="bottom" /></span>,
      cell: info => {
        const val = info.getValue() || 0;
        return (
          <span className={val > 0 ? "text-alpha font-medium tabular-nums" : val < 0 ? "text-beta font-medium tabular-nums" : "text-text-secondary tabular-nums"}>
            {val.toFixed(2)}%
          </span>
        );
      },
    }),
    columnHelper.accessor('shap_reason_1', {
      header: () => <span className="flex items-center">AI Reason <InfoTooltip text="The primary underlying factor driving the AI Score (e.g., strong momentum, high free cash flow)." position="bottom" /></span>,
      cell: info => {
        const val = info.getValue();
        if (!val) return <span className="text-text-secondary opacity-50">-</span>;
        const color = val.startsWith("+") ? "text-alpha bg-alpha/10" : "text-beta bg-beta/10";
        return <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider ${color}`}>{val}</span>;
      },
    }),
  ];

  const filteredStocks = React.useMemo(() => {
    if (!stocks) return [];
    
    // Only >5000 Cr Market Cap to avoid small-cap/penny anomalies in screens
    const validStocks = stocks.filter((s: any) => (s.marketCap || 0) >= 5000);

    if (activeFilter === 'ai') return validStocks.filter((s: any) => s.alpha_score > 0.3);
    if (activeFilter === 'momentum') return validStocks.filter((s: any) => s.rs_rating > 70);
    if (activeFilter === 'inst') return validStocks.filter((s: any) => s.inst_accum > 0.5);
    return validStocks;
  }, [stocks, activeFilter]);

  const table = useReactTable({
    data: filteredStocks,
    columns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (isLoading) return <div className="p-8 animate-pulse"><div className="h-10 bg-surface rounded mb-4"></div><div className="h-96 bg-surface rounded"></div></div>;
  if (error) return <div className="p-8 text-beta">Error loading screener data.</div>;

  return (
    <div className={`${isPanel ? 'p-2 flex flex-col h-full' : 'p-6 w-full flex flex-col h-full'}`}>
      {!isPanel && (
        <div className="flex justify-between items-end mb-6">
          <div>
            <h2 className="text-3xl font-bold text-text-primary">Discover & Screen</h2>
            <p className="text-text-secondary mt-1">Find your next opportunity across {stocks?.length || 0} top-rated equities.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
            <input 
              type="text" 
              placeholder="Search ticker, name, industry..." 
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              className="pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-alpha transition-colors w-72"
            />
          </div>
        </div>
      )}

      {isPanel && (
        <div className="flex justify-between items-center mb-3">
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveFilter(activeFilter === 'ai' ? null : 'ai')}
              className={`px-3 py-1 rounded text-xs font-bold transition-colors ${activeFilter === 'ai' ? 'bg-alpha/20 text-alpha' : 'bg-surface border border-border text-text-secondary hover:text-white'}`}
            >
              Top AI Scores
            </button>
            <button 
              onClick={() => setActiveFilter(activeFilter === 'momentum' ? null : 'momentum')}
              className={`px-3 py-1 rounded text-xs font-bold transition-colors ${activeFilter === 'momentum' ? 'bg-alpha/20 text-alpha' : 'bg-surface border border-border text-text-secondary hover:text-white'}`}
            >
              High Momentum
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary" size={14} />
            <input 
              type="text" 
              placeholder="Search screen..." 
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              className="pl-8 pr-2 py-1 text-xs bg-surface-hover border border-border rounded text-text-primary focus:outline-none focus:border-alpha w-48"
            />
          </div>
        </div>
      )}

      {!isPanel && (
        <div className="flex gap-3 mb-6">
          <button 
            onClick={() => setActiveFilter(activeFilter === 'ai' ? null : 'ai')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${activeFilter === 'ai' ? 'bg-alpha text-canvas' : 'bg-surface border border-border text-text-secondary hover:text-text-primary'}`}
          >
            <Sparkles size={16} /> Top AI Scores
          </button>
          <button 
            onClick={() => setActiveFilter(activeFilter === 'momentum' ? null : 'momentum')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${activeFilter === 'momentum' ? 'bg-alpha text-canvas' : 'bg-surface border border-border text-text-secondary hover:text-text-primary'}`}
          >
            <Rocket size={16} /> High Momentum
          </button>
          <button 
            onClick={() => setActiveFilter(activeFilter === 'inst' ? null : 'inst')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${activeFilter === 'inst' ? 'bg-alpha text-canvas' : 'bg-surface border border-border text-text-secondary hover:text-text-primary'}`}
          >
            <Landmark size={16} /> Strong Inst. Buying
          </button>
        </div>
      )}

      <div className={`flex-1 bg-surface rounded-lg border border-border overflow-hidden flex flex-col ${isPanel ? 'text-sm' : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="border-b border-border bg-surface-hover/50">
                  {headerGroup.headers.map(header => (
                    <th 
                      key={header.id} 
                      className="px-6 py-3 text-sm font-medium text-text-secondary cursor-pointer hover:text-text-primary select-none group"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-2">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.slice(0, 100).map(row => (
                <tr 
                  key={row.id} 
                  className="border-b border-border hover:bg-surface-hover cursor-pointer transition-colors"
                  onClick={() => navigate(`/stock/${row.original.slug}`)}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-6 py-4 text-sm">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {table.getRowModel().rows.length > 100 && (
          <div className="p-4 text-center text-sm text-text-secondary bg-surface-hover/30 border-t border-border">
            Showing top 100 results. Use the search bar to refine.
          </div>
        )}
      </div>
    </div>
  );
};
