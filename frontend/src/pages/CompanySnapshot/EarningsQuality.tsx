import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';

export const EarningsQuality = ({ data }: { data: any }) => {
  const abs = data.absolute || {};
  const rel = data.relative || {};
  
  const marketCap = abs.marketCap || 0;
  const pe = abs.peRatio || 0;
  const pOcf = abs.priceToOcf || 0;
  
  // Calculate TTM figures
  const ttmProfit = pe > 0 ? marketCap / pe : 0;
  const ttmOcf = abs.operatingCashFlow || (pOcf !== 0 ? marketCap / pOcf : 0);
  
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
    <div className="bg-surface border border-border p-5 rounded-xl flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 shrink-0 group relative w-fit cursor-help">
            Earnings Quality
            <HelpCircle size={14} className="text-text-secondary hover:text-text-primary transition-colors" />
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 bg-surface-hover text-text-primary text-[10px] p-2 rounded shadow-xl z-50 normal-case tracking-normal border border-border font-normal leading-relaxed">
              Compares paper profits (Accruals) against actual cash generated (OCF). A healthy company generates as much cash as it reports in profit.
            </div>
          </h3>
          <p className="text-[10px] text-text-secondary mt-1 uppercase tracking-wider font-bold">Comparing Accrual Profit vs. Real Cash Inflow (TTM)</p>
        </div>
        {qesFlag ? (
          <div className="flex items-center gap-1.5 text-red-400 bg-red-500/10 px-2 py-1 rounded border border-red-500/20 shrink-0">
            <AlertCircle size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Low Quality</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 shrink-0">
            <CheckCircle2 size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">High Quality</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white/5 p-4 rounded-lg border border-border">
          <p className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">OCF / Profit Ratio</p>
          <p className={`text-xl font-bold tabular-nums ${qualityRatio > 1 ? 'text-emerald-400' : qualityRatio < 0.5 ? 'text-red-400' : 'text-text-primary'}`}>
            {qualityRatio.toFixed(2)}x
          </p>
        </div>
        <div className="bg-white/5 p-4 rounded-lg border border-border">
          <p className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">Forensic Status</p>
          <p className={`text-sm font-bold ${qesFlag ? 'text-red-400' : 'text-emerald-400'}`}>
            {qesFlag ? 'Divergence Detected' : 'Healthy Convergence'}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
            <YAxis stroke="#94a3b8" fontSize={10} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1a1a24', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', fontSize: '12px' }}
              itemStyle={{ color: '#fff' }}
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            />
            <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
            <ReferenceLine y={0} stroke="#27272a" />
            <Bar dataKey="Profit" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
            <Bar dataKey="Cash Flow" fill={ttmOcf < 0 ? "#ef4444" : "#10b981"} radius={[4, 4, 0, 0]} barSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <p className="text-[10px] text-text-secondary mt-4 italic font-medium leading-relaxed">
        *A significant gap between Profit and Cash Flow often indicates aggressive revenue recognition or high working capital stress.
      </p>
    </div>
  );
};
