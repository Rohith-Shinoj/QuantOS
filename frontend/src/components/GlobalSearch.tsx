import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSearch } from '../hooks/useSearch';
import { useAppStore } from '../store';
import { StockLogo } from './StockLogo';

export const GlobalSearch = ({ className = "w-96 lg:w-[400px] xl:w-[480px]", onSelect, value, onChange, fixedFilter }: { className?: string, onSelect?: (res: any) => void, value?: string, onChange?: (val: string) => void, fixedFilter?: string }) => {
  const [internalQuery, setInternalQuery] = useState('');
  const query = value !== undefined ? value : internalQuery;
  const setQuery = onChange !== undefined ? onChange : setInternalQuery;
  const [isOpen, setIsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const navigate = useNavigate();
  const { setSelectedStockSlug } = useAppStore();

  const filtered = useSearch(query, fixedFilter || activeFilter);

  const getTagColor = (type: string) => {
    if (type === 'Mutual Fund') return 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
    if (type === 'ETF') return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    return 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30';
  };

  return (
    <div className={`relative z-50 ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
        <input 
          type="text" 
          placeholder="Search stocks, ETFs, mutual funds..." 
          className="w-full pl-10 pr-4 py-2 bg-canvas border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-alpha focus:ring-1 focus:ring-alpha transition-all"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        />
      </div>

      {isOpen && (query.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.5)] overflow-hidden z-[100]">
          {/* Filters */}
          {!fixedFilter && (
            <div className="flex gap-2 p-2 border-b border-border bg-canvas">
            {['All', 'Stocks', 'ETFs', 'Mutual Funds'].map(f => (
              <button
                key={f}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setActiveFilter(f)}
                className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                  activeFilter === f 
                    ? 'bg-alpha text-white' 
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {f}
              </button>
            ))}
            </div>
          )}

          {/* Results */}
          <div className="overflow-y-auto max-h-[360px] hide-scrollbar">
            {filtered.length > 0 ? filtered.map((res) => {
              const isDelisted = res.type === 'Stock' && (res.item.livePrice === '₹0.00' || res.item.livePrice === '0.00');
              const delistedStyle = isDelisted ? {
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(239, 68, 68, 0.05) 10px, rgba(239, 68, 68, 0.05) 20px)'
              } : {};

              return (
              <div 
                key={res.slug}
                style={delistedStyle}
                className={`px-4 py-3 hover:bg-surface-hover cursor-pointer border-b border-border last:border-0 flex items-center gap-3 ${isDelisted ? 'border-red-500/20' : ''}`}
                onMouseDown={() => {
                  if (onSelect) {
                    onSelect(res);
                  } else {
                    if (res.type !== 'Mutual Fund') {
                      setSelectedStockSlug(res.slug);
                    }
                    navigate(res.navPath);
                    setQuery('');
                  }
                  setIsOpen(false);
                }}
              >
                {/* Dynamic Logo */}
                {res.logoUrl ? (
                  <img src={res.logoUrl} alt="Logo" className="w-8 h-8 rounded-full shrink-0 bg-white object-contain border border-border" />
                ) : (
                  <StockLogo ticker={res.logoTicker || res.slug} className="w-8 h-8 shrink-0" textClass="text-[10px]" fallbackClass="bg-canvas border border-border text-text-primary" />
                )}

                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex justify-between items-center w-full">
                    <span className="font-bold text-text-primary text-xs truncate">{res.title}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ml-2 ${getTagColor(res.type)}`}>
                      {res.type}
                    </span>
                  </div>
                  <div className="text-[10px] text-text-secondary truncate mt-0.5">{res.subtitle}</div>
                </div>
              </div>
            )}) : (
              <div className="p-4 text-center text-sm text-text-secondary">
                No results found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
