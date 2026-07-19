import React from 'react';

import { MetricBox } from '../../components/MetricBox';

export const ETFFundamentals = ({ stats }: { stats: any }) => {
  if (!stats) return null;

  return (
    <div className="bg-surface border border-border p-5 rounded-xl flex flex-col h-[400px]">
      <h3 className="text-sm font-semibold text-text-primary mb-6">Fundamentals</h3>
      <div className="grid grid-cols-2 gap-y-6 gap-x-4">
        <MetricBox 
          label="AUM" 
          value={stats.aumInCrores ? `₹${stats.aumInCrores.toLocaleString()}` : '-'} 
          subtext="Cr" 
        />
        <MetricBox 
          label="Expense Ratio" 
          value={stats.expenseRatio ? `${stats.expenseRatio}%` : '-'} 
        />
        <MetricBox 
          label="Tracking Error" 
          value={stats.trackingError ? `${stats.trackingError}%` : '-'} 
        />
        <MetricBox 
          label="P/E Ratio" 
          value={stats.peRatio || '-'} 
        />
        <MetricBox 
          label="P/B Ratio" 
          value={stats.pbRatio || '-'} 
        />
        <MetricBox 
          label="NAV" 
          value={stats.nav ? `₹${stats.nav}` : '-'} 
        />
      </div>
    </div>
  );
};
