import React from 'react';

export const ETFCategoryReturns = ({ returns }: { returns: any }) => {
  if (!returns) return null;

  const periods = [
    { label: '1 Month', key: '1M' },
    { label: '3 Months', key: '3M' },
    { label: '6 Months', key: '6M' },
    { label: '1 Year', key: '1Y' },
    { label: '3 Years', key: '3Y' },
    { label: '5 Years', key: '5Y' },
  ];

  return (
    <div className="bg-surface border border-border p-5 rounded-xl flex flex-col h-[400px]">
      <h3 className="text-sm font-semibold text-text-primary mb-6">Returns vs Category</h3>
      
      <div className="flex-1 overflow-x-auto min-h-0">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border text-[10px] text-text-secondary font-bold uppercase tracking-wider">
              <th className="py-2 font-bold">Period</th>
              <th className="py-2 font-bold text-right">ETF</th>
              <th className="py-2 font-bold text-right">Category</th>
              <th className="py-2 font-bold text-right">Rank</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {periods.map(({ label, key }) => {
              const etfRet = returns[`return${key}`];
              const catRet = returns[`categoryReturn${key}`];
              const rank = returns[`rank${key}`];
              const rankCount = returns[`rankCount${key}`];
              
              if (etfRet === undefined && catRet === undefined) return null;
              
              return (
                <tr key={key} className="hover:bg-white/5 transition-colors">
                  <td className="py-2 font-bold text-[10px] text-text-primary uppercase tracking-wider">{label}</td>
                  <td className="py-2 text-right font-mono text-sm font-bold">
                    <span className={etfRet && etfRet > 0 ? 'text-emerald-400' : (etfRet < 0 ? 'text-amber-400' : 'text-text-secondary')}>
                      {etfRet !== undefined ? `${etfRet}%` : '-'}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono text-sm font-bold">
                    <span className={catRet && catRet > 0 ? 'text-emerald-400' : (catRet < 0 ? 'text-amber-400' : 'text-text-secondary')}>
                      {catRet !== undefined ? `${catRet}%` : '-'}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono text-sm text-text-secondary">
                    {rank !== undefined && rankCount !== undefined ? `#${rank} / ${rankCount}` : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
