import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks } from '../api';
import { StockLogo } from '../components/StockLogo';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import { Search, Filter, TrendingUp, BarChart2, Layers } from 'lucide-react';

const parseDayChange = (changeStr: any) => {
  if (!changeStr) return 0;
  if (typeof changeStr === 'number') return changeStr;
  const match = String(changeStr).match(/\(([-+]?[\d.]+)%\)/);
  if (match) return parseFloat(match[1]);
  const num = parseFloat(changeStr);
  return isNaN(num) ? 0 : num;
};

export const Stocks: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('All');
  const [selectedCap, setSelectedCap] = useState<string>('All');
  const [sectorMetric, setSectorMetric] = useState<'rs' | 'inst'>('rs');

  const { data: rawStocks, isLoading } = useQuery({
    queryKey: ['allStocksDashboard'],
    queryFn: () => fetchAllStocks({ limit: 1000 })
  });

  const stocks = useMemo(() => {
    if (!Array.isArray(rawStocks)) return [];
    return rawStocks.map((s: any) => {
      const mCap = s.marketCap ?? s.market_cap ?? 0;
      const pe = s.peRatio ?? s.pe_ratio;
      const validPe = (typeof pe === 'number' && pe > 0 && pe < 150) ? parseFloat(pe.toFixed(1)) : null;

      return {
        ...s,
        marketCap: mCap,
        peRatio: validPe,
        rs_rating: Math.round(s.rs_rating ?? 50),
        dayChangeVal: parseDayChange(s.day_change),
        inst_accum: typeof s.inst_accum === 'number' ? parseFloat(s.inst_accum.toFixed(1)) : 0
      };
    });
  }, [rawStocks]);

  // Industries list
  const industries = useMemo(() => {
    const set = new Set<string>();
    stocks.forEach(s => { if (s.industry) set.add(s.industry); });
    return ['All', ...Array.from(set).sort()];
  }, [stocks]);

  // Filtered stocks for list
  const filteredStocks = useMemo(() => {
    return stocks.filter(s => {
      const matchSearch = !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.ticker?.toLowerCase().includes(search.toLowerCase());
      const matchInd = selectedIndustry === 'All' || s.industry === selectedIndustry;
      const matchCap = selectedCap === 'All' || (s.marketCapType || s.market_cap_type)?.toLowerCase() === selectedCap.toLowerCase();
      return matchSearch && matchInd && matchCap;
    });
  }, [stocks, search, selectedIndustry, selectedCap]);

  // Visual 1 Data: RS Rating vs PE Ratio Scatter Matrix
  const scatterData = useMemo(() => {
    return stocks
      .filter(s => s.peRatio !== null && s.rs_rating > 0)
      .slice(0, 300)
      .map(s => ({
        name: s.name,
        ticker: s.ticker,
        rs: s.rs_rating,
        pe: s.peRatio,
        marketCap: s.marketCap
      }));
  }, [stocks]);

  // Visual 2 Data: Sector Bar Chart sorted by active toggle metric
  const sectorData = useMemo(() => {
    const map: Record<string, { totalRS: number; totalInst: number; count: number }> = {};
    stocks.forEach(s => {
      if (!s.industry) return;
      if (!map[s.industry]) {
        map[s.industry] = { totalRS: 0, totalInst: 0, count: 0 };
      }
      map[s.industry].totalRS += s.rs_rating || 0;
      map[s.industry].totalInst += s.inst_accum || 0;
      map[s.industry].count += 1;
    });

    const items = Object.entries(map)
      .filter(([, v]) => v.count >= 3)
      .map(([ind, v]) => ({
        industry: ind.length > 14 ? ind.substring(0, 12) + '..' : ind,
        fullIndustry: ind,
        avgRS: Math.round(v.totalRS / v.count),
        avgInstAccum: parseFloat((v.totalInst / v.count).toFixed(1))
      }));

    if (sectorMetric === 'rs') {
      return items.sort((a, b) => b.avgRS - a.avgRS).slice(0, 8);
    } else {
      return items.sort((a, b) => b.avgInstAccum - a.avgInstAccum).slice(0, 8);
    }
  }, [stocks, sectorMetric]);

  return (
    <div className="w-full p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2 tracking-tight">
          <BarChart2 className="text-indigo-400" size={24} /> Stocks Dashboard
        </h1>
      </div>

      {/* 2 Side-by-Side Visuals ($340px height) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        
        {/* Visual 1: Relative Strength vs Valuation Scatter Matrix */}
        <div className="bg-surface rounded-lg border border-border p-5 flex flex-col justify-between h-[340px]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-400" /> Relative Strength (RS) vs. Valuation (P/E)
              </h2>
            </div>
            {/* Color Scheme Legend */}
            <div className="flex items-center gap-3 text-[11px] mb-2 font-medium">
              <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> GARP Target (RS &ge; 70, P/E &le; 25)</span>
              <span className="flex items-center gap-1 text-indigo-400"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> High Momentum (RS &ge; 50)</span>
              <span className="flex items-center gap-1 text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Lagging (RS &lt; 50)</span>
            </div>
          </div>

          <div className="h-52 w-full">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-text-secondary text-xs">Loading chart...</div>
            ) : scatterData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-secondary text-xs">No P/E valuation data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2E39" />
                  <XAxis
                    type="number"
                    dataKey="rs"
                    name="RS Rating"
                    domain={[0, 100]}
                    stroke="#8E94A4"
                    fontSize={11}
                  />
                  <YAxis
                    type="number"
                    dataKey="pe"
                    name="P/E Ratio"
                    domain={[0, 80]}
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
                          <p className="text-text-secondary">RS Rating: <span className="text-indigo-400 font-bold">{data.rs}/100</span></p>
                          <p className="text-text-secondary">P/E Ratio: <span className="text-emerald-400 font-bold">{data.pe}</span></p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData}>
                    {scatterData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.rs >= 70 && entry.pe <= 25 ? '#10B981' : entry.rs >= 50 ? '#6366F1' : '#F59E0B'}
                        opacity={0.8}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Visual 2: Sector Ranking with Toggle Buttons */}
        <div className="bg-surface rounded-lg border border-border p-5 flex flex-col justify-between h-[340px]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Layers size={16} className="text-indigo-400" /> Sector Rankings
              </h2>
              {/* Toggle Buttons */}
              <div className="flex items-center bg-canvas border border-border rounded-lg p-0.5 text-xs font-semibold">
                <button
                  onClick={() => setSectorMetric('rs')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    sectorMetric === 'rs'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Relative Strength (RS)
                </button>
                <button
                  onClick={() => setSectorMetric('inst')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    sectorMetric === 'inst'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Inst. Accumulation %
                </button>
              </div>
            </div>
            <p className="text-xs text-text-secondary mb-2">
              {sectorMetric === 'rs'
                ? 'Top sectors ranked by average Relative Strength (RS Rating).'
                : 'Top sectors ranked by average Institutional Accumulation %.'}
            </p>
          </div>

          <div className="h-52 w-full">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-text-secondary text-xs">Loading chart...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2E39" />
                  <XAxis dataKey="industry" stroke="#8E94A4" fontSize={10} angle={-15} textAnchor="end" />
                  <YAxis stroke="#8E94A4" fontSize={11} />
                  <RechartsTooltip
                    content={({ payload, label }) => {
                      if (!payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-surface-hover border border-border p-2 rounded shadow-xl text-xs space-y-1">
                          <p className="font-bold text-text-primary">{d.fullIndustry || label}</p>
                          <p className={sectorMetric === 'rs' ? "text-indigo-400 font-bold" : "text-emerald-400 font-bold"}>
                            {sectorMetric === 'rs' ? `Avg RS Rating: ${d.avgRS}` : `Avg Inst. Accum: ${d.avgInstAccum}%`}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey={sectorMetric === 'rs' ? 'avgRS' : 'avgInstAccum'}
                    fill={sectorMetric === 'rs' ? '#6366F1' : '#10B981'}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
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
              placeholder="Search stocks by name or ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-canvas border border-border rounded-md pl-9 pr-4 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-alpha"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="flex items-center space-x-2">
            <Filter size={14} className="text-text-secondary" />
            <select
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              className="bg-canvas border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-alpha"
            >
              {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </div>

          <select
            value={selectedCap}
            onChange={(e) => setSelectedCap(e.target.value)}
            className="bg-canvas border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-alpha"
          >
            <option value="All">All Cap Types</option>
            <option value="large">Large Cap</option>
            <option value="mid">Mid Cap</option>
            <option value="small">Small Cap</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden w-full">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-hover/50 border-b border-border">
                <th className="px-6 py-3 font-medium text-text-secondary text-sm">Company</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm">Industry</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm text-right">Market Cap (Cr)</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm text-right">P/E Ratio</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm text-right">Day Change</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm text-center">RS Rating</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm text-right">Inst. Accumulation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-sm text-text-secondary">Loading stocks dataset...</td></tr>
              ) : filteredStocks.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-sm text-text-secondary">No stocks match your search criteria.</td></tr>
              ) : (
                filteredStocks.slice(0, 100).map((stock, i) => (
                  <tr key={stock.slug || i} className="hover:bg-surface-hover transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white shrink-0 overflow-hidden border border-border flex items-center justify-center">
                          <StockLogo ticker={stock.ticker} name={stock.name} className="w-full h-full object-contain" />
                        </div>
                        <div>
                          <Link to={`/stocks/${stock.slug}`} className="font-bold text-sm text-text-primary hover:text-indigo-400 transition-colors">
                            {stock.name}
                          </Link>
                          <div className="text-xs text-text-secondary font-mono mt-0.5">{stock.ticker}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-surface-hover rounded text-xs border border-border text-text-secondary">
                        {stock.industry || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-text-primary">
                      ₹{stock.marketCap ? stock.marketCap.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm">
                      <span className={stock.peRatio && stock.peRatio < 20 ? "text-emerald-400 font-bold" : "text-text-primary"}>
                        {stock.peRatio !== null ? stock.peRatio : '-'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-right font-mono text-sm font-bold ${stock.dayChangeVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {stock.dayChangeVal > 0 ? `+${stock.dayChangeVal.toFixed(1)}%` : `${stock.dayChangeVal.toFixed(1)}%`}
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-sm font-bold text-indigo-400">
                      {stock.rs_rating}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm">
                      <span className={stock.inst_accum > 0 ? "text-emerald-400 font-bold" : stock.inst_accum < 0 ? "text-rose-400" : "text-text-secondary"}>
                        {stock.inst_accum > 0 ? `+${stock.inst_accum}%` : `${stock.inst_accum}%`}
                      </span>
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
