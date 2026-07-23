import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchMutualFunds } from '../api';
import { 
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import { Search, Filter, TrendingUp, BarChart2 } from 'lucide-react';
import { MarketCaptureScatterplot } from './MutualFunds/MarketCaptureScatterplot';

export const MutualFunds = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('aum');

  const { data: response, isLoading: loading } = useQuery({
    queryKey: ['mutualFunds', category, sortBy],
    queryFn: () => fetchMutualFunds({
      limit: 100,
      category: category === 'All' ? undefined : category,
      sort_by: sortBy,
      sort_order: 'desc'
    })
  });

  const funds: any[] = response?.data || [];

  // Filtered funds by search
  const filteredFunds = useMemo(() => {
    return funds.filter(f => {
      const name = f.fund_name || f.scheme_name || '';
      return !search || name.toLowerCase().includes(search.toLowerCase());
    });
  }, [funds, search]);

  // Compute Category Average 3Y Return
  const categoryData = useMemo(() => {
    const map: Record<string, { totalReturn: number; count: number }> = {};
    funds.forEach(f => {
      const cat = f.sub_category || f.category || 'Other';
      if (!map[cat]) map[cat] = { totalReturn: 0, count: 0 };
      const r = parseFloat(f.return3y) || 0;
      if (r > 0) {
        map[cat].totalReturn += r;
        map[cat].count += 1;
      }
    });

    return Object.entries(map)
      .filter(([, v]) => v.count >= 2)
      .map(([cat, v]) => ({
        category: cat.length > 14 ? cat.substring(0, 12) + '..' : cat,
        avgReturn: parseFloat((v.totalReturn / v.count).toFixed(1))
      }))
      .sort((a, b) => b.avgReturn - a.avgReturn)
      .slice(0, 7);
  }, [funds]);

  return (
    <div className="w-full p-6 space-y-6">
      {/* Clean Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
          <BarChart2 className="text-emerald-400" size={24} /> Mutual Funds Dashboard
        </h1>
      </div>

      {/* 2 Side-by-Side Visuals ($340px height) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        
        {/* Visual 1: Expense Ratio vs 3Y Return Scatter */}
        <div className="bg-surface rounded-lg border border-border p-5 flex flex-col justify-between h-[340px]">
          <MarketCaptureScatterplot funds={funds} />
        </div>

        {/* Visual 2: Category Average 3Y Return Bar Chart */}
        <div className="bg-surface rounded-lg border border-border p-5 flex flex-col justify-between h-[340px]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-400" /> Category Performance (3Y CAGR)
              </h2>
              <span className="text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded font-mono">
                Category Averages
              </span>
            </div>
            <p className="text-xs text-text-secondary mb-2">
              Average 3-Year CAGR return across top mutual fund categories.
            </p>
          </div>

          <div className="h-56 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-text-secondary text-xs">Loading chart...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2E39" />
                  <XAxis dataKey="category" stroke="#8E94A4" fontSize={10} angle={-15} textAnchor="end" />
                  <YAxis stroke="#8E94A4" fontSize={11} unit="%" />
                  <RechartsTooltip
                    content={({ payload, label }) => {
                      if (!payload || !payload.length) return null;
                      return (
                        <div className="bg-surface-hover border border-border p-2 rounded shadow-xl text-xs space-y-1">
                          <p className="font-bold text-text-primary">{label}</p>
                          <p className="text-emerald-400 font-bold">Avg 3Y Return: {payload[0]?.value}%</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="avgReturn" fill="#10B981" radius={[4, 4, 0, 0]}>
                    {categoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#10B981' : '#6366F1'} />
                    ))}
                  </Bar>
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
              placeholder="Search mutual funds by name..."
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
              className="bg-canvas border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-alpha"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="All">All Categories</option>
              <option value="Equity">Equity</option>
              <option value="Debt">Debt</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-text-secondary text-sm">Sort By:</span>
            <select 
              className="bg-canvas border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-alpha"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="aum">AUM (Highest)</option>
              <option value="return3y">3Y Return</option>
              <option value="return1y">1Y Return</option>
              <option value="expense_ratio">Expense Ratio</option>
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
                <th className="px-6 py-3 font-medium text-text-secondary text-sm">Fund Name</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm">Category</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm text-right">AUM (Cr)</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm text-right">Expense Ratio</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm text-right">1Y Return</th>
                <th className="px-6 py-3 font-medium text-text-secondary text-sm text-right">3Y Return</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-text-secondary">Loading funds...</td></tr>
              ) : filteredFunds.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-text-secondary">No mutual funds match your search criteria.</td></tr>
              ) : (
                filteredFunds.map((fund, i) => (
                  <tr key={fund.id || i} className="hover:bg-surface-hover transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {fund.logo_url ? (
                          <img src={fund.logo_url} alt="AMC Logo" className="w-7 h-7 rounded-full bg-white object-contain border border-border" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-surface-hover border border-border flex items-center justify-center text-xs font-bold text-text-secondary">
                            {fund.amc ? fund.amc.substring(0, 2) : 'MF'}
                          </div>
                        )}
                        <div>
                          <Link to={`/mutual-funds/${fund.scheme_code || fund.direct_search_id}`} className="font-bold text-sm text-text-primary hover:text-indigo-400 transition-colors">
                            {fund.fund_name || fund.scheme_name}
                          </Link>
                          <div className="text-xs text-text-secondary mt-0.5">{fund.fund_manager}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-surface-hover rounded text-xs border border-border text-text-secondary">
                        {fund.category} - {fund.sub_category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-text-primary">
                      ₹{fund.aum ? parseFloat(fund.aum).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm">
                      <span className={parseFloat(fund.expense_ratio) <= 0.8 ? "text-emerald-400 font-bold" : "text-text-primary"}>
                        {fund.expense_ratio}%
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-right font-mono text-sm font-bold ${parseFloat(fund.return1y) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {fund.return1y ? `${parseFloat(fund.return1y) > 0 ? '+' : ''}${parseFloat(fund.return1y).toFixed(2)}%` : '-'}
                    </td>
                    <td className={`px-6 py-4 text-right font-mono text-sm font-bold ${parseFloat(fund.return3y) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {fund.return3y ? `${parseFloat(fund.return3y) > 0 ? '+' : ''}${parseFloat(fund.return3y).toFixed(2)}%` : '-'}
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
