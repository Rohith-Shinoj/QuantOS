import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMutualFunds } from '../api';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ZAxis,
  Treemap
} from 'recharts';
import { Filter, TrendingUp, AlertTriangle, Shield, Maximize2, X } from 'lucide-react';
import { MarketCaptureScatterplot } from './MutualFunds/MarketCaptureScatterplot';

export const MutualFunds = () => {
  const [funds, setFunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFund, setSelectedFund] = useState<any | null>(null);
  
  // Filters
  const [category, setCategory] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('aum');

  useEffect(() => {
    loadFunds();
  }, [category, sortBy]);

  const loadFunds = async () => {
    setLoading(true);
    try {
      const res = await fetchMutualFunds({
        limit: 100,
        category: category || undefined,
        sort_by: sortBy,
        sort_order: 'desc'
      });
      setFunds(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // Extract holdings for modal
  const getFundHoldings = (fund: any) => {
    if (!fund.detailed_holdings) return [];
    let holdings = [];
    try {
      holdings = typeof fund.detailed_holdings === 'string' ? JSON.parse(fund.detailed_holdings) : fund.detailed_holdings;
    } catch(e) {}
    
    return holdings.map((h:any) => ({
      name: h.company_name,
      size: parseFloat(h.corpus_per) || 0,
      sector: h.sector_name || 'Other'
    })).filter((h:any) => h.size > 0);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Mutual Funds Dashboard</h1>
          <p className="text-text-secondary mt-1 text-sm">Screen, analyze, and discover core portfolio holdings.</p>
        </div>
      </div>

      {/* Top Visualizations Panel
      <div className="w-full">
        <div className="h-[500px]">
          <MarketCaptureScatterplot />
        </div>
      </div> */}

      {/* Screener Controls */}
      <div className="bg-surface p-4 rounded-lg border border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-text-secondary" />
          <select 
            className="bg-canvas border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-alpha"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All Categories</option>
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

      {/* Data Table */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
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
                {/* <th className="px-6 py-3 font-medium text-text-secondary text-sm text-center">Action</th> */}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-sm text-text-secondary">Loading funds...</td></tr>
              ) : funds.map((fund, i) => (
                <tr key={fund.id || i} className="hover:bg-surface-hover transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {fund.logo_url ? (
                        <img src={fund.logo_url} alt="AMC Logo" className="w-8 h-8 rounded-full bg-white object-contain border border-border" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-surface-hover border border-border flex items-center justify-center text-xs font-bold text-text-secondary">
                          {fund.amc ? fund.amc.substring(0, 2) : 'MF'}
                        </div>
                      )}
                      <div>
                        <Link to={`/mutual-funds/${fund.scheme_code || fund.direct_search_id}`} className="font-medium text-sm text-text-primary hover:text-indigo-400 transition-colors">
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
                    ₹{fund.aum ? parseFloat(fund.aum).toLocaleString(undefined, {maximumFractionDigits: 0}) : '-'}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm">
                    <span className={fund.expense_ratio > 1.0 ? "text-beta" : "text-alpha"}>
                      {fund.expense_ratio}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm text-alpha">
                    {fund.return1y}%
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm font-bold text-alpha">
                    {fund.return3y ? `${fund.return3y}%` : '-'}
                  </td>
                  {/* <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => setSelectedFund(fund)}
                      className="p-1.5 bg-surface-hover text-text-secondary hover:text-text-primary rounded transition-colors"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </td> */}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed View Modal */}
      {selectedFund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-sm p-4">
          <div className="bg-surface border border-border rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-surface/95 backdrop-blur border-b border-border p-6 flex justify-between items-center z-10">
              <div>
                <h2 className="text-xl font-bold text-text-primary">{selectedFund.fund_name || selectedFund.scheme_name}</h2>
                <p className="text-sm text-text-secondary mt-1">{selectedFund.amc} • {selectedFund.category}</p>
              </div>
              <button onClick={() => setSelectedFund(null)} className="p-2 hover:bg-surface-hover rounded-full transition-colors">
                <X className="w-5 h-5 text-text-secondary hover:text-text-primary" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-canvas p-4 rounded-lg border border-border text-center">
                  <div className="text-xs text-text-secondary mb-1">AUM</div>
                  <div className="text-lg font-mono text-text-primary">₹{selectedFund.aum} Cr</div>
                </div>
                <div className="bg-canvas p-4 rounded-lg border border-border text-center">
                  <div className="text-xs text-text-secondary mb-1">Expense Ratio</div>
                  <div className="text-lg font-mono text-text-primary">{selectedFund.expense_ratio}%</div>
                </div>
                <div className="bg-canvas p-4 rounded-lg border border-border text-center">
                  <div className="text-xs text-text-secondary mb-1">Risk</div>
                  <div className="text-lg font-mono text-text-primary">{selectedFund.risk}</div>
                </div>
                <div className="bg-canvas p-4 rounded-lg border border-border text-center">
                  <div className="text-xs text-text-secondary mb-1">3Y Return</div>
                  <div className="text-lg font-mono font-bold text-alpha">{selectedFund.return3y}%</div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-text-primary mb-4 uppercase tracking-wider">Holdings Allocation</h3>
                {getFundHoldings(selectedFund).length > 0 ? (
                  <div className="h-80 bg-canvas rounded-lg border border-border p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <Treemap
                        data={getFundHoldings(selectedFund)}
                        dataKey="size"
                        aspectRatio={4 / 3}
                        stroke="#1A202C"
                        fill="#3B82F6"
                      >
                        <RechartsTooltip contentStyle={{ backgroundColor: '#1A202C', borderColor: '#2D3748', borderRadius: '8px' }} />
                      </Treemap>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-40 bg-canvas rounded-lg border border-border flex flex-col items-center justify-center text-text-secondary">
                    <AlertTriangle className="w-6 h-6 mb-2 opacity-50" />
                    <p className="text-sm">Holdings data requires a --full-refresh scrape.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
