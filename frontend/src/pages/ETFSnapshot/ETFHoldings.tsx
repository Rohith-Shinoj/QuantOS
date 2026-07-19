import React from 'react';

export const ETFHoldings = ({ holdings }: { holdings: any[] }) => {
  if (!holdings || holdings.length === 0) return (
    <div className="bg-surface border border-border rounded-xl p-6 h-full flex items-center justify-center text-text-secondary">
      No holdings data available
    </div>
  );

  return (
    <div className="bg-surface border border-border rounded-xl flex flex-col h-[400px]">
      <div className="p-6 pb-2 border-b border-border">
        <h3 className="text-lg font-bold text-text-primary">Top Holdings</h3>
        <p className="text-text-secondary text-sm">Underlying assets and allocation</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-border text-xs text-text-secondary uppercase tracking-wider">
              <th className="px-6 py-3 font-medium">Company</th>
              <th className="px-6 py-3 font-medium text-right">Allocation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {holdings.map((h, idx) => (
              <tr key={idx} className="hover:bg-surface-hover transition-colors">
                <td className="px-6 py-3">
                  <div className="font-medium text-sm text-text-primary">{h.company_name}</div>
                  <div className="text-xs text-text-secondary font-mono mt-0.5">{h.isin}</div>
                </td>
                <td className="px-6 py-3 text-right font-mono text-sm text-text-primary">
                  {h.allocation}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
