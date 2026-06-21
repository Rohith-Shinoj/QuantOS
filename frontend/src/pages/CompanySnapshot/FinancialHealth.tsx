import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

import { InfoTooltip } from '../../components/InfoTooltip';

export const FinancialHealth = ({ data }: { data: any }) => {
  const rel = data.relative || {};
  const abs = data.absolute || {};
  
  const eff = rel.structural_capital_efficiency || {};
  const norm = rel.normalized_fundamentals || {};
  
  const chartData = [
    { subject: 'ROE', value: (norm.return_on_equity || 0) * 100, fullMark: 30 },
    { subject: 'SGR', value: (eff.sustainable_growth_rate || 0) * 100, fullMark: 30 },
    { subject: 'OPM', value: (norm.operating_profit_margin || 0) * 100, fullMark: 100 },
    { subject: 'NPM', value: (norm.net_profit_margin || 0) * 100, fullMark: 40 },
    { subject: 'Payout', value: (eff.payout_ratio_proxy || 0) * 100, fullMark: 50 },
  ];

  return (
    <div className="bg-surface p-4 rounded-lg border border-border h-full flex flex-col">
      <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center">
        Financial Health
        <InfoTooltip text="Visualizes key capital efficiency metrics. ROE (Return on Equity), SGR (Sustainable Growth Rate), OPM/NPM (Operating/Net Margins)." />
      </h3>
      <div className="flex-1 min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
            <PolarGrid stroke="#27272a" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} tick={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#141417', borderColor: '#27272a', color: '#f8fafc' }}
              itemStyle={{ color: '#10b981' }}
              formatter={(value: any) => `${Number(value).toFixed(2)}%`}
            />
            <Radar name="Stock" dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
