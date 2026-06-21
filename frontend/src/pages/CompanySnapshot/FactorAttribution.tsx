import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

export const FactorAttribution = ({ data }: { data: any }) => {
  const rel = data.relative || {};
  const signals = rel.relative_strength_signals || {};
  
  const rs52w = signals.rs_nifty_52w || 1;
  const benchmark = signals.primary_benchmark || 'NIFTY';
  
  // rs = (1 + rs) / (1 + rb) => alpha = rs - 1 (approx)
  const alpha = rs52w - 1;
  
  const chartData = [
    { name: `Benchmark (${benchmark})`, value: 100 },
    { name: 'Pure Alpha', value: Math.abs(alpha * 100) },
  ];

  const COLORS = ['#3b82f6', alpha >= 0 ? '#10b981' : '#ef4444'];

  return (
    <div className="bg-surface p-6 rounded-lg border border-border h-full flex flex-col">
      <h3 className="text-lg font-medium text-text-primary mb-2">Alpha Attribution</h3>
      <p className="text-sm text-text-secondary mb-6">Quantifying performance vs. Primary Benchmark (52W)</p>

      <div className="flex-1 min-h-[250px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip 
               contentStyle={{ backgroundColor: '#141417', borderColor: '#27272a', color: '#f8fafc' }}
               formatter={(val: any) => `${Number(val).toFixed(1)} pts`}
            />
            <Legend verticalAlign="bottom" height={36}/>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-xs text-text-secondary font-bold uppercase">Alpha</p>
          <p className={`text-2xl font-bold ${alpha >= 0 ? 'text-alpha' : 'text-beta'}`}>
            {alpha >= 0 ? '+' : ''}{(alpha * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Relative Strength (1Y)</span>
          <span className="text-text-primary font-medium">{rs52w.toFixed(2)}x</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Sector Valuation Premium</span>
          <span className={`font-medium ${rel.normalized_fundamentals?.pe_vs_sector_ratio > 1.2 ? 'text-warning' : 'text-alpha'}`}>
            {(rel.normalized_fundamentals?.pe_vs_sector_ratio || 1).toFixed(2)}x
          </span>
        </div>
      </div>
    </div>
  );
};
