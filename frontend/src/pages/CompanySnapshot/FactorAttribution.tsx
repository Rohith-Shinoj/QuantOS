import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { HelpCircle } from 'lucide-react';

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
    <div className="bg-surface border border-border p-5 rounded-xl flex flex-col h-full overflow-hidden">
      <h3 className="text-sm font-semibold text-text-primary mb-6 flex items-center gap-1.5 shrink-0 group relative w-fit cursor-help">
        Alpha Attribution
        <HelpCircle size={14} className="text-text-secondary hover:text-text-primary transition-colors" />
        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 bg-surface-hover text-text-primary text-[10px] p-2 rounded shadow-xl z-50 normal-case tracking-normal border border-border font-normal leading-relaxed">
          Quantifying performance vs. Primary Benchmark (52W)
        </div>
      </h3>

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
               contentStyle={{ backgroundColor: '#1a1a24', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', fontSize: '12px' }}
               itemStyle={{ color: '#fff' }}
               formatter={(val: any) => `${Number(val).toFixed(1)} pts`}
            />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '10px', color: '#a1a1aa' }}/>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Alpha</p>
          <p className={`text-2xl font-bold ${alpha >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {alpha >= 0 ? '+' : ''}{(alpha * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Relative Strength (1Y)</span>
          <span className="text-sm text-text-primary font-bold">{rs52w.toFixed(2)}x</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Sector Val. Premium</span>
          <span className={`text-sm font-bold ${rel.normalized_fundamentals?.pe_vs_sector_ratio > 1.2 ? 'text-red-400' : 'text-emerald-400'}`}>
            {(rel.normalized_fundamentals?.pe_vs_sector_ratio || 1).toFixed(2)}x
          </span>
        </div>
      </div>
    </div>
  );
};
