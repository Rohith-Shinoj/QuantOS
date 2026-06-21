import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks, fetchPortfolioAnalysis } from '../api';
import { ShieldAlert, AlertTriangle, FileWarning, Search, X, CheckCircle2 } from 'lucide-react';
import { InfoTooltip } from '../components/InfoTooltip';

export const PortfolioTracker = ({ isPanel = false }: { isPanel?: boolean }) => {
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(['state-bank-of-india', 'hdfc-bank-ltd']);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const { data: allStocks } = useQuery({ queryKey: ['allStocks'], queryFn: fetchAllStocks });
  
  const { data: analysis, isLoading } = useQuery({
    queryKey: ['portfolioAnalysis', selectedSlugs],
    queryFn: () => fetchPortfolioAnalysis(selectedSlugs),
    enabled: selectedSlugs.length > 0,
  });

  const filtered = query.length > 0 && allStocks 
    ? allStocks.filter((s: any) => 
        !selectedSlugs.includes(s.slug) && 
        ((s.ticker && s.ticker.toLowerCase().includes(query.toLowerCase())) || 
         (s.name && s.name.toLowerCase().includes(query.toLowerCase())))
      ).slice(0, 8)
    : [];

  const addStock = (slug: string) => {
    setSelectedSlugs([...selectedSlugs, slug]);
    setQuery('');
    setIsOpen(false);
  };

  const removeStock = (slug: string) => {
    setSelectedSlugs(selectedSlugs.filter(s => s !== slug));
  };

  const riskScore = analysis?.portfolio_risk_score || 0;
  const riskColor = riskScore > 50 ? 'text-beta' : riskScore > 20 ? 'text-warning' : 'text-alpha';

  return (
    <div className={`${isPanel ? 'p-2 flex flex-col h-full gap-4' : 'p-6 w-full flex flex-col h-full gap-6'}`}>
      {!isPanel && (
        <div>
          <h2 className="text-3xl font-bold text-text-primary">Portfolio Health Check</h2>
          <p className="text-text-secondary mt-1">Analyze your portfolio's risk profile and discover smart swap opportunities.</p>
        </div>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-3 ${isPanel ? 'gap-4 h-full' : 'gap-6'}`}>
        {/* Left: Input & Selected */}
        <div className={`lg:col-span-1 bg-surface rounded-lg border border-border flex flex-col ${isPanel ? 'p-4 gap-4 overflow-y-auto' : 'p-6 gap-6'}`}>
          <div className="relative">
            <label className="block text-xs text-text-secondary font-bold uppercase mb-2 tracking-widest">Add Holdings</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
              <input 
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
                onFocus={() => setIsOpen(true)}
                onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                placeholder="Search ticker or name..."
                className="w-full pl-10 pr-4 py-2 bg-canvas border border-border rounded-md text-text-primary focus:outline-none focus:border-alpha"
              />
            </div>
            {isOpen && filtered.length > 0 && (
              <div className="absolute top-full mt-2 w-full bg-surface border border-border rounded-md shadow-xl overflow-hidden z-50">
                {filtered.map((stock: any) => (
                  <div 
                    key={stock.slug}
                    className="px-4 py-3 hover:bg-surface-hover cursor-pointer border-b border-border last:border-0"
                    onMouseDown={() => addStock(stock.slug)}
                  >
                    <div className="font-bold text-text-primary">{stock.ticker}</div>
                    <div className="text-xs text-text-secondary truncate">{stock.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
             <label className="block text-xs text-text-secondary font-bold uppercase mb-3 tracking-widest">Current Portfolio ({selectedSlugs.length})</label>
             <div className="space-y-2">
                {selectedSlugs.map(slug => {
                  const stock = allStocks?.find((s: any) => s.slug === slug);
                  return (
                    <div key={slug} className="flex justify-between items-center p-3 rounded bg-canvas border border-border/50 group">
                       <span className="font-bold text-text-primary">{stock?.ticker || slug}</span>
                       <button onClick={() => removeStock(slug)} className="text-text-secondary hover:text-beta opacity-0 group-hover:opacity-100 transition-all">
                          <X size={16} />
                       </button>
                    </div>
                  );
                })}
             </div>
          </div>
        </div>

        {/* Right: Analysis */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-surface p-8 rounded-lg border border-border flex items-center justify-between">
             <div>
                <h3 className="text-lg font-medium text-text-primary mb-1">
                  Portfolio Risk Score
                  <InfoTooltip text="A weighted composite score of your entire portfolio's downside risk. Scores over 50 represent dangerous exposure." />
                </h3>
                <p className="text-sm text-text-secondary">Composite risk probability across all holdings.</p>
             </div>
             <div className={`text-6xl font-bold tabular-nums ${riskColor}`}>
                {riskScore.toFixed(0)}<span className="text-2xl opacity-50">/100</span>
             </div>
          </div>

          <div className="bg-surface rounded-lg border border-border overflow-hidden">
             <table className="w-full text-left">
                <thead className="bg-surface-hover/50 border-b border-border">
                   <tr>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-text-secondary">Asset</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-text-secondary text-center"><span className="flex items-center justify-center">Volatility <InfoTooltip text="Measures the likelihood of a sudden sharp price move. Values over 1000 indicate an extreme volatility squeeze." position="bottom" /></span></th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-text-secondary text-center"><span className="flex items-center justify-center">Quality <InfoTooltip text="Checks for forensic accounting red flags, such as divergence between reported profits and actual cash flows." position="bottom" /></span></th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-text-secondary text-center"><span className="flex items-center justify-center">Alerts <InfoTooltip text="Displays active warnings such as high debt levels, regulatory issues, or sudden promoter pledging." position="bottom" /></span></th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-text-secondary text-right"><span className="flex items-center justify-end">Risk Score <InfoTooltip text="A composite score (0-100) estimating the downside risk of the asset. Higher scores indicate greater risk." position="bottom" /></span></th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-border">
                   {analysis?.stock_analysis?.map((s: any) => (
                     <tr key={s.slug} className="hover:bg-surface-hover/30">
                        <td className="px-6 py-4">
                           <p className="font-bold text-text-primary">{s.ticker}</p>
                        </td>
                        <td className="px-6 py-4 text-center">
                           <span className={s.v_squeeze > 1000 ? 'text-alpha font-bold' : 'text-text-secondary'}>{s.v_squeeze.toFixed(0)}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                           {s.qes_flag ? <span title="Quality Warning"><AlertTriangle size={18} className="text-warning mx-auto" /></span> : <CheckCircle2 size={18} className="text-alpha mx-auto" />}
                        </td>
                        <td className="px-6 py-4 text-center flex justify-center gap-2">
                           {s.debt_flag && <span title="High Debt Warning"><FileWarning size={18} className="text-beta" /></span>}
                           {s.reg_flag && <span title="Active Regulatory Warning"><ShieldAlert size={18} className="text-warning" /></span>}
                           {s.pledge_surge && <span title="Promoter Pledge Warning"><AlertTriangle size={18} className="text-beta" /></span>}
                           {s.tax_divergence && <span title="Accounting Warning"><FileWarning size={18} className="text-warning" /></span>}
                           {!s.debt_flag && !s.reg_flag && !s.pledge_surge && !s.tax_divergence && <span className="text-text-secondary">-</span>}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <span className={`font-bold ${s.individual_score > 50 ? 'text-beta' : s.individual_score > 20 ? 'text-warning' : 'text-alpha'}`}>
                              {s.individual_score}
                           </span>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
          </div>

          {(analysis?.swap_recommendations?.length > 0 || analysis?.concentration_warnings?.length > 0) && (
            <div className="bg-surface p-6 rounded-lg border border-alpha/30 flex flex-col gap-4">
              <h3 className="text-lg font-medium text-alpha flex items-center gap-2">
                <AlertTriangle size={20} />
                Smart Portfolio Recommendations
              </h3>
              
              {analysis?.concentration_warnings?.map((warn: string, i: number) => (
                <div key={i} className="p-3 bg-beta/10 border border-beta/20 rounded text-beta text-sm">
                  {warn}
                </div>
              ))}

              {analysis?.swap_recommendations?.map((swap: any, i: number) => (
                <div key={i} className="p-4 bg-surface-hover rounded border border-border flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-text-primary">Switch: <span className="text-beta">{swap.current_ticker}</span> ➔ <span className="text-alpha">{swap.recommended_ticker}</span></span>
                    <span className="text-xs bg-alpha/10 text-alpha px-2 py-1 rounded font-bold">+{ (swap.alpha_gain * 100).toFixed(1) }% Alpha</span>
                  </div>
                  <p className="text-sm text-text-secondary">{swap.reason}</p>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>

  );
};
