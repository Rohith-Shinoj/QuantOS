import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks } from '../api';
import { Link } from 'react-router-dom';
import { Search, Plus, Trash2, AlertTriangle, BellRing } from 'lucide-react';
import { InfoTooltip } from '../components/InfoTooltip';
import { StockLogo } from '../components/StockLogo';
import { GlobalSearch } from '../components/GlobalSearch';
import { Skeleton } from '../components/Skeleton';

export const Watchlists = ({ isPanel = false }: { isPanel?: boolean }) => {
  const [watchlists, setWatchlists] = useState<{ id: string, name: string, slugs: string[] }[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  
  const { data: allStocks, isLoading } = useQuery({
    queryKey: ['allStocks'],
    queryFn: fetchAllStocks,
  });

  useEffect(() => {
    const saved = localStorage.getItem('koyfin_watchlists');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setWatchlists(parsed);
        if (parsed.length > 0) setActiveListId(parsed[0].id);
      } catch (e) {
        // ignore
      }
    } else {
      // Default MVP Watchlist
      const defaultList = [{ id: '1', name: 'My Watchlist', slugs: ['state-bank-of-india', 'hdfc-bank-ltd', 'reliance-industries-ltd'] }];
      setWatchlists(defaultList);
      setActiveListId('1');
      localStorage.setItem('koyfin_watchlists', JSON.stringify(defaultList));
    }
  }, []);

  const saveWatchlists = (newList: any) => {
    setWatchlists(newList);
    localStorage.setItem('koyfin_watchlists', JSON.stringify(newList));
  };

  const createList = () => {
    const name = prompt("Enter watchlist name:");
    if (!name) return;
    const newList = [...watchlists, { id: Date.now().toString(), name, slugs: [] }];
    saveWatchlists(newList);
    setActiveListId(newList[newList.length - 1].id);
  };

  const deleteList = (id: string) => {
    if (!window.confirm("Delete this watchlist?")) return;
    const newList = watchlists.filter(w => w.id !== id);
    saveWatchlists(newList);
    if (activeListId === id) setActiveListId(newList.length > 0 ? newList[0].id : null);
  };

  const addStock = (slug: string) => {
    if (!activeListId) return;
    const newList = watchlists.map(w => {
      if (w.id === activeListId && !w.slugs.includes(slug)) {
        return { ...w, slugs: [...w.slugs, slug] };
      }
      return w;
    });
    saveWatchlists(newList);
    // State is maintained in GlobalSearch
  };

  const removeStock = (slug: string) => {
    if (!activeListId) return;
    const newList = watchlists.map(w => {
      if (w.id === activeListId) {
        return { ...w, slugs: w.slugs.filter(s => s !== slug) };
      }
      return w;
    });
    saveWatchlists(newList);
  };

  const activeList = watchlists.find(w => w.id === activeListId);

  const getScoreColor = (val: number) => {
    if (val >= 80) return "text-[#42bd7f]";
    if (val <= 30) return "text-[#f23645]";
    return "text-text-secondary";
  };

  // Generate Alerts
  const alerts = [];
  if (activeList && allStocks) {
    for (const slug of activeList.slugs) {
      const stock = allStocks.find((s: any) => s.slug === slug);
      if (!stock) continue;

      if (stock.v_squeeze > 5000) {
        alerts.push({ type: 'warning', stock: stock.ticker, message: `Extreme volatility squeeze detected (Level: ${Math.round(stock.v_squeeze)}).` });
      }
    }
  }

  return (
    <div className={`${isPanel ? 'p-2 flex flex-col h-full overflow-hidden' : 'p-6 w-full flex flex-col h-[calc(100vh-64px)]'}`}>
      {!isPanel && (
        <div className="flex justify-between items-end mb-6 shrink-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-text-primary mb-2">Watchlists & Alerts</h1>
            <p className="text-text-secondary">Curate your lists and monitor active forensic triggers.</p>
          </div>
          <button onClick={createList} className="flex items-center gap-2 bg-alpha text-canvas px-4 py-2 rounded-lg font-bold hover:bg-alpha/90">
            <Plus size={18} /> New List
          </button>
        </div>
      )}

      {isPanel && (
        <div className="flex justify-between items-center mb-2 shrink-0">
          <select 
            className="bg-surface border border-border text-text-primary rounded px-2 py-1 text-xs focus:outline-none focus:border-alpha"
            value={activeListId || ''}
            onChange={e => setActiveListId(e.target.value)}
          >
            {watchlists.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div className="flex gap-1">
            <button onClick={createList} className="p-1 hover:bg-surface-hover rounded text-text-secondary hover:text-text-primary"><Plus size={14} /></button>
            <button onClick={() => activeListId && deleteList(activeListId)} className="p-1 hover:bg-surface-hover rounded text-beta"><Trash2 size={14} /></button>
          </div>
        </div>
      )}

      <div className={`flex flex-1 min-h-0 gap-6 ${isPanel ? 'flex-col' : ''}`}>
        {!isPanel && (
          <div className="w-64 bg-surface rounded-lg border border-border p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">Your Lists</h2>
              <button onClick={createList} className="p-1 hover:bg-surface-hover rounded text-alpha"><Plus size={16} /></button>
            </div>
            {watchlists.map(w => (
              <div 
                key={w.id} 
                onClick={() => setActiveListId(w.id)}
                className={`px-3 py-2 rounded cursor-pointer flex justify-between items-center group transition-colors ${activeListId === w.id ? 'bg-alpha/10 text-alpha font-bold' : 'hover:bg-surface-hover text-text-secondary'}`}
              >
                <span>{w.name}</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); deleteList(w.id); }}
                  className={`p-1 opacity-0 group-hover:opacity-100 hover:text-beta transition-opacity ${activeListId === w.id ? 'text-alpha' : ''}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={`flex flex-col bg-surface border border-border rounded-lg overflow-hidden ${isPanel ? 'flex-1' : 'flex-1'}`}>
          {alerts.length > 0 && (
            <div className="bg-surface p-4 border-b border-beta/30">
              <h3 className="text-xs font-bold uppercase tracking-wider text-beta flex items-center gap-2 mb-2">
                <BellRing size={14} /> Alerts
              </h3>
              <div className="flex flex-col gap-1">
                {alerts.map((a, i) => (
                  <div key={i} className="text-xs text-beta opacity-90">• {a.stock}: {a.message}</div>
                ))}
              </div>
            </div>
          )}

          {activeList ? (
            <>
              <div className={`flex justify-between items-center bg-surface border-b border-border ${isPanel ? 'p-2' : 'p-4'}`}>
                <h3 className={`${isPanel ? 'text-sm' : 'text-xl'} font-bold text-text-primary`}>{activeList.name}</h3>
                <div className="relative">
                  <GlobalSearch 
                    className={isPanel ? 'w-48' : 'w-64'} 
                    onSelect={(res) => addStock(res.slug)}
                  />
                </div>
              </div>
                
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface sticky top-0 z-10 shadow-sm">
                    <tr className="border-b border-border text-xs text-text-secondary uppercase tracking-wider">
                      <th className={`font-bold ${isPanel ? 'p-2' : 'p-4'}`}>Symbol</th>
                      {!isPanel && <th className="p-4 font-bold text-right">Price</th>}
                      <th className={`font-bold text-right ${isPanel ? 'p-2' : 'p-4'}`}>Momentum</th>
                      <th className="p-4 font-bold text-center">Alerts</th>
                      <th className="p-4 font-bold"></th>
                    </tr>
                  </thead>
                    <tbody className="divide-y divide-border/30">
                      {isLoading && (
                        [...Array(5)].map((_, i) => (
                          <tr key={i} className="border-b border-border/30">
                            <td className="p-4"><Skeleton className="h-8 w-32" /></td>
                            <td className="p-4"><Skeleton className="h-4 w-16 ml-auto" /></td>
                            <td className="p-4"><Skeleton className="h-4 w-12 ml-auto" /></td>
                            <td className="p-4"><Skeleton className="h-4 w-12 ml-auto" /></td>
                            <td className="p-4"><Skeleton className="h-6 w-6 mx-auto" /></td>
                            <td className="p-4"></td>
                          </tr>
                        ))
                      )}
                      {!isLoading && activeList.slugs.length === 0 && (
                        <tr><td colSpan={6} className="p-8 text-center text-text-secondary italic">Watchlist is empty. Search above to add stocks.</td></tr>
                      )}
                      {!isLoading && activeList.slugs.map(slug => {
                        const stock = allStocks?.find((s: any) => s.slug === slug);
                        if (!stock) return null;
                        const rsRating = Math.round(stock.rs_rating || 0);
                        const hasAlert = stock.v_squeeze > 5000;
                        
                        return (
                          <tr key={slug} className="hover:bg-surface-hover/50 transition-colors group">
                            <td className="p-4">
                              <Link to={`/stocks/${slug}`} className="flex items-center gap-3 font-bold text-text-primary hover:text-alpha">
                                <StockLogo ticker={stock.ticker} className="w-6 h-6" textClass="text-[8px]" fallbackClass="bg-surface border border-border text-text-primary" />
                                {stock.ticker}
                              </Link>
                              <div className="text-xs text-text-secondary truncate max-w-[200px] mt-1">{stock.name}</div>
                            </td>
                            <td className="p-4 text-right tabular-nums">{stock.close ? stock.close.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : stock.livePrice || '-'}</td>
                            <td className={`p-4 text-right tabular-nums font-bold ${getScoreColor(rsRating)}`}>{rsRating}</td>
                            <td className="p-4 text-center">
                              {hasAlert ? <AlertTriangle size={16} className="text-warning mx-auto" /> : <span className="text-text-secondary opacity-50">-</span>}
                            </td>
                            <td className="p-4 text-right">
                              <button 
                                onClick={() => removeStock(slug)}
                                className="text-text-secondary hover:text-beta opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remove from list"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-text-secondary">
                Select or create a watchlist
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
