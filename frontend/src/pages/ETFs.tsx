import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchETFs } from '../api';
import { Filter, TrendingUp, AlertTriangle, Shield } from 'lucide-react';

export const ETFs = () => {
  const [etfs, setEtfs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [sortBy, setSortBy] = useState<string>('marketCap');

  useEffect(() => {
    loadETFs();
  }, [sortBy]);

  const loadETFs = async () => {
    setLoading(true);
    try {
      const res = await fetchETFs();
      // res.data is expected to be an array of ETFs or similar. 
      // Based on API implementation, it might just return the raw list directly or { data: [] }
      let etfsData = [];
      if (Array.isArray(res)) etfsData = res;
      else if (res && res.data) etfsData = res.data;
      
      // Sort in memory since API might not support sorting natively
      const sorted = [...etfsData].sort((a: any, b: any) => {
        if (sortBy === 'marketCap') {
          return (b.marketCap || 0) - (a.marketCap || 0);
        } else if (sortBy === 'return1y') {
          return (b.stats?.returns?.return1Y || 0) - (a.stats?.returns?.return1Y || 0);
        }
        return 0;
      });
      
      setEtfs(sorted);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">ETFs Dashboard</h1>
          <p className="text-text-secondary mt-1 text-sm">Screen, analyze, and discover Exchange Traded Funds.</p>
        </div>
      </div>

      {/* Screener Controls */}
      <div className="bg-surface p-4 rounded-lg border border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
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

      {/* Data Table */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
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
              ) : etfs.map((etf, i) => (
                <tr key={etf.slug || i} className="hover:bg-surface-hover transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {etf.header?.logoUrl ? (
                        <img src={etf.header.logoUrl} alt="Logo" className="w-8 h-8 rounded-full bg-white object-contain border border-border" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-surface-hover border border-border flex items-center justify-center text-xs font-bold text-text-secondary">
                          {etf.ticker ? etf.ticker.substring(0, 2) : 'ETF'}
                        </div>
                      )}
                      <div>
                        <Link to={`/etf/${etf.slug}`} className="font-medium text-sm text-text-primary hover:text-indigo-400 transition-colors">
                          {etf.name || etf.ticker}
                        </Link>
                        <div className="text-xs text-text-secondary mt-0.5">{etf.ticker}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-surface-hover rounded text-xs border border-border text-text-secondary">
                      {etf.header?.industryName || 'ETF'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm text-text-primary">
                    ₹{etf.marketCap ? parseFloat(etf.marketCap).toLocaleString(undefined, {maximumFractionDigits: 0}) : '-'}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm text-text-primary">
                    {etf.livePrice ? `₹${etf.livePrice}` : (etf.OHLCV?.length ? `₹${etf.OHLCV[etf.OHLCV.length-1].Close}` : '-')}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm">
                    <span className={etf.stats?.returns?.return1Y && etf.stats.returns.return1Y > 0 ? "text-beta" : (etf.stats?.returns?.return1Y < 0 ? "text-alpha" : "text-text-secondary")}>
                      {etf.stats?.returns?.return1Y ? `${etf.stats.returns.return1Y}%` : '-'}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && etfs.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-sm text-text-secondary">No ETFs found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
