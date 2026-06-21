import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

import { InfoTooltip } from '../../components/InfoTooltip';

export const OwnershipTrends = ({ data }: { data: any }) => {
  const rel = data.relative || {};
  const mom = rel.shareholding_momentum_vectors || {};
  
  const chartData = [
    {
      name: 'Inst. Accumulation',
      value: (mom.institutional_accumulation_qoq || 0),
    },
    {
      name: 'Retail Absorption',
      value: (rel.risk_and_forensic_signals?.hni_absorption_score || 0),
    },
    {
      name: 'Pledge Delta',
      value: (mom.promoter_pledge_delta || 0),
    }
  ];

  return (
    <div className="bg-surface p-4 rounded-lg border border-border h-full flex flex-col">
      <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center">
        Ownership Trends
        <InfoTooltip text="Tracks recent shifts in shareholding. 'Inst. Accumulation' tracks smart money buying. 'Pledge Delta' tracks changes in promoter pledged shares." />
      </h3>
      <div className="flex-1 min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={true} vertical={false} />
            <XAxis type="number" stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `${val.toFixed(1)}%`} />
            <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} width={120} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#141417', borderColor: '#27272a', color: '#f8fafc' }}
              itemStyle={{ color: '#10b981' }}
              formatter={(val: any) => [`${Number(val).toFixed(2)}%`, 'Value']}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.value < 0 ? '#ef4444' : '#10b981'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
