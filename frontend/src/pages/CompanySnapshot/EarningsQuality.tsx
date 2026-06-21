import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

import { InfoTooltip } from '../../components/InfoTooltip';

export const EarningsQuality = ({ data }: { data: any }) => {
  const abs = data.absolute || {};
  const rel = data.relative || {};
  
  const marketCap = abs.marketCap || 0;
  const pe = abs.peRatio || 0;
  const pOcf = abs.priceToOcf || 0;
  
  // Calculate TTM figures
  const ttmProfit = pe > 0 ? marketCap / pe : 0;
  const ttmOcf = pOcf !== 0 ? marketCap / pOcf : 0;
  
  const qesFlag = rel.risk_and_forensic_signals?.qes_forensic_red_flag === 1;
  
  const chartData = [
    {
      name: 'TTM (Cr)',
      Profit: parseFloat(ttmProfit.toFixed(2)),
      'Cash Flow': parseFloat(ttmOcf.toFixed(2)),
    }
  ];

  const qualityRatio = ttmProfit > 0 ? ttmOcf / ttmProfit : 0;

  return (
    <div className="bg-surface p-6 rounded-lg border border-border h-full flex flex-col">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-lg font-medium text-text-primary flex items-center">
            Earnings Quality
            <InfoTooltip text="Compares paper profits (Accruals) against actual cash generated (OCF). A healthy company generates as much cash as it reports in profit." />
          </h3>
          <p className="text-sm text-text-secondary mt-1">Comparing Accrual Profit vs. Real Cash Inflow (TTM)</p>
        </div>
        {qesFlag ? (
          <div className="flex items-center gap-2 text-beta bg-beta/10 px-3 py-1 rounded border border-beta/20">
            <AlertCircle size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Low Quality</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-alpha bg-alpha/10 px-3 py-1 rounded border border-alpha/20">
            <CheckCircle2 size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">High Quality</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-canvas p-4 rounded border border-border">
          <p className="text-xs text-text-secondary uppercase font-bold tracking-widest mb-1">OCF / Profit Ratio</p>
          <p className={`text-2xl font-bold tabular-nums ${qualityRatio > 1 ? 'text-alpha' : qualityRatio < 0.5 ? 'text-beta' : 'text-text-primary'}`}>
            {qualityRatio.toFixed(2)}x
          </p>
        </div>
        <div className="bg-canvas p-4 rounded border border-border">
          <p className="text-xs text-text-secondary uppercase font-bold tracking-widest mb-1">Forensic Status</p>
          <p className={`text-sm font-medium ${qesFlag ? 'text-beta' : 'text-alpha'}`}>
            {qesFlag ? 'Divergence Detected' : 'Healthy Convergence'}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#141417', borderColor: '#27272a', color: '#f8fafc' }}
              cursor={{ fill: 'transparent' }}
            />
            <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '20px' }} />
            <ReferenceLine y={0} stroke="#27272a" />
            <Bar dataKey="Profit" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
            <Bar dataKey="Cash Flow" fill={ttmOcf < 0 ? "#ef4444" : "#10b981"} radius={[4, 4, 0, 0]} barSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <p className="text-xs text-text-secondary mt-4 italic">
        *A significant gap between Profit and Cash Flow often indicates aggressive revenue recognition or high working capital stress.
      </p>
    </div>
  );
};
