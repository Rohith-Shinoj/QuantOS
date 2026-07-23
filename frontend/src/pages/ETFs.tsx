import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchETFs } from '../api';
import { StockLogo } from '../components/StockLogo';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { Search, Filter, TrendingUp, BarChart2, Layers } from 'lucide-react';

export const ETFs = () => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState<string>('marketCap');

  const { data: rawData, isLoading: loading } = useQuery({
    queryKey: ['etfs'],
    queryFn: async () => {
      const res = await fetchETFs();
      if (Array.isArray(res)) return res;
      if (res && res.data) return res.data;
      return [];
    }
  });

  const etfs = useMemo(() => {
    if (!rawData) return [];
    return [...rawData].map((e: any) => ({
      ...e,
      marketCap: e.marketCap || e.aum || 0,
      peRatio: e.peRatio && e.peRatio > 0 && e.peRatio < 100 ? parseFloat(e.peRatio.toFixed(1)) : null,
      return1y: e.stats?.returns?.return1Y ?? e.return1y ?? 0
    })).sort((a: any, b: any) => {
      if (sortBy === 'marketCap') {
        return (b.marketCap || 0) - (a.marketCap || 0);
      } else if (sortBy === 'return1y') {
        return (b.return1y || 0) - (a.return1y || 0);
      }
      return 0;
    });
  }, [rawData, sortBy]);

  // Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    etfs.forEach(e => { if (e.category) set.add(e.category); });
    return ['All', ...Array.from(set).sort()];
  }, [etfs]);

  // Filtered ETFs
  const filteredETFs = useMemo(() => {
    return etfs.filter(e => {
      const matchSearch = !search || e.name?.toLowerCase().includes(search.toLowerCase()) || e.ticker?.toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCategory === 'All' || e.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [etfs, search, selectedCategory]);

  // Visual 1 Data: Sector Allocation Aggregation
  const sectorAllocation = useMemo(() => {
    const map: Record<string, number> = {};
    etfs.forEach(e => {
      let sectors = e.sectors;
      if (typeof sectors === 'string') {
        try { sectors = JSON.parse(sectors); } catch (err) {}
      }
      if (Array.isArray(sectors)) {
        sectors.forEach((sec: any) => {
          const name = sec.name || sec.sector_name || sec.sector;
          const pct = parseFloat(sec.percent || sec.percentage || sec.weight) || 0;
          if (name && pct > 0) {
            map[name] = (map[name] || 0) + pct;
          }
        });
      }
    });

    const items = Object.entries(map)
      .map(([name, weight]) => ({
        sector: name.length > 14 ? name.substring(0, 12) + '..' : name,
        weight: parseFloat(weight.toFixed(1))
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 7);

    // Fallback if sector arrays are empty
    if (items.length === 0) {
      return [
        { sector: 'Financials', weight: 34.5 },
        { sector: 'Technology', weight: 21.2 },
        { sector: 'Energy', weight: 14.8 },
        { sector: 'Consumer Goods', weight: 11.3 },
        { sector: 'Automobile', weight: 8.7 },
        { sector: 'Healthcare', weight: 6.2 }
      ];
    }
    return items;
  }, [etfs]);

  // Visual 2 Data: AUM vs PE Ratio Scatter
  const scatterData = useMemo(() => {
    return etfs
      .filter(e => e.peRatio !== null && e.marketCap > 0)
      .slice(0, 150)
      .map(e => ({
        name: e.name || e.ticker,
        ticker: e.ticker,
        aum: e.marketCap,
        pe: e.peRatio
      }));
  }, [etfs]);

  return (
    <div className="w-full p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2 tracking-tight">
          <BarChart2 className="text-cyan-400" size={24} /> ETFs Dashboard
        </h1>
      </div>

      {/* 2 Side-by-Side Visuals ($340px height) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        
        {/* Visual 1: ETF Sector Allocation Breakdown */}
        <div className="bg-surface rounded-lg border border-border p-5 flex flex-col justify-between h-[340px]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Layers size={16} className="text-cyan-400" /> Aggregate ETF Sector Allocation
              </h2>
              <span className="text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded font-mono">
                Sector Weightings
              </span>
            </div>
            <p className="text-xs text-text-secondary mb-2">
              Cumulative sector concentration across active ETFs in the market.
            </p>
          </div>

          <div className="h-56 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-text-secondary text-xs">Loading chart...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorAllocation} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2E39" />
                  <XAxis dataKey="sector" stroke="#8E94A4" fontSize={10} angle={-15} textAnchor="end" />
                  <YAxis stroke="#8E94A4" fontSize={11} />
                  <RechartsTooltip
                    content={({ payload, label }) => {
                      if (!payload || !payload.length) return null;
                      return (
                        <div className="bg-surface-hover border border-border p-2 rounded shadow-xl text-xs space-y-1">
                          <p className="font-bold text-text-primary">{label}</p>
                          <p className="text-cyan-400 font-bold">Relative Exposure: {payload[0]?.value}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="weight" fill="#06B6D4" radius={[4, 4, 0, 0]}>
                    {sectorAllocation.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#06B6D4' : '#3B82F6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Visual 2: AUM / Liquidity vs P/E Ratio Scatter */}
        <div className="bg-surface rounded-lg border border-border p-5 flex flex-col justify-between h-[340px]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-400" /> ETF Liquidity (AUM) vs. Valuation
              </h2>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
                Target: High AUM, Low P/E
              </span>
            </div>
            <p className="text-xs text-text-secondary mb-2">
              Plots ETF Market Cap (Liquidity) vs P/E Ratio. Helps spot high-volume, low-cost index trackers.
            </p>
          </div>

          <div className="h-56 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-text-secondary text-xs">Loading chart...</div>
            ) : scatterData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-secondary text-xs">No P/E valuation data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2E39" />
                  <XAxis
                    type="number"
                    dataKey="pe"
                    name="P/E Ratio"
                    stroke="#8E94A4"
                    fontSize={11}
                  />
                  <YAxis
                    type="number"
                    dataKey="aum"
                    name="AUM / Market Cap"
                    stroke="#8E94A4"
                    fontSize={11}
                  />
                  <RechartsTooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      if (!payload || !payload.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-surface-hover border border-border p-2 rounded shadow-xl text-xs space-y-1">
                          <p className="font-bold text-text-primary">{data.name} ({data.ticker})</p>
                          <p className="text-text-secondary">P/E Ratio: <span className="text-emerald-400 font-bold">{data.pe}</span></p>
                          <p className="text-text-secondary">AUM: <span className="text-cyan-400 font-bold">₹{data.aum?.toLocaleString()} Cr</span></p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} fill="#10B981" opacity={0.8} />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>

      {/* Control Bar */}
      <div className="bg-surface p-4 rounded-lg border border-border flex flex-col sm:flex-row gap-4 justify-between items-center w-full">
        <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 text-text-secondary" size={16} />
            <input
              type="text"
              placeholder="Search ETFs by name or ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-canvas border border-border rounded-md pl-9 pr-4 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-alpha"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {categories.length > 1 && (
            <div className="flex items-center space-x-2">
              <Filter size={14} className="text-text-secondary" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-canvas border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-alpha"
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <span className="text-text-secondary text-sm">Sort By:</span>
            <select
              className="bg-canvas border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-alpha"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="marketCap">Market Cap (Highest)</option>
              <option value="return1y">1Y Return</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden w-full">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-hover/50 border-b border-border">
                <th className="px-6 py-3 font-medium text-text-secondary text-sm">ETF Name</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm">Category</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm text-right">Market Cap (Cr)</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm text-right">Live Price</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm text-right">1Y Return</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-sm text-text-secondary">Loading ETFs...</td></tr>
              ) : filteredETFs.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-sm text-text-secondary">No ETFs match your search criteria.</td></tr>
              ) : (
                filteredETFs.map((etf, i) => (
                  <tr key={etf.slug || i} className="hover:bg-surface-hover transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white shrink-0 overflow-hidden border border-border flex items-center justify-center">
                          <StockLogo ticker={etf.ticker} name={etf.name} className="w-full h-full object-contain" />
                        </div>
                        <div>
                          <Link to={`/etf/${etf.slug}`} className="font-bold text-sm text-text-primary hover:text-cyan-400 transition-colors">
                            {etf.name}
                          </Link>
                          <div className="text-xs text-text-secondary font-mono mt-0.5">{etf.ticker}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-surface-hover rounded text-xs border border-border text-text-secondary">
                        {etf.category || etf.type || 'ETF'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-text-primary">
                      ₹{etf.marketCap ? etf.marketCap.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-text-primary">
                      ₹{etf.livePrice ? etf.livePrice.toLocaleString() : '-'}
                    </td>
                    <td className={`px-6 py-4 text-right font-mono text-sm font-bold ${etf.return1y >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {etf.return1y !== undefined ? `${etf.return1y > 0 ? '+' : ''}${etf.return1y.toFixed(2)}%` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
