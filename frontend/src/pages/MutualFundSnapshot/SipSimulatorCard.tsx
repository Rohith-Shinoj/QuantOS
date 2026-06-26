import React, { useState, useMemo } from 'react';
import { HelpCircle } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

export const SipSimulatorCard = ({ fund }: { fund: any }) => {
  const [sip, setSip] = useState(5000);
  const [stepUp, setStepUp] = useState(10);
  
  const cagr = parseFloat(fund.return10y || fund.return5y || fund.return3y || '12');
  
  const { totalInvested, futureValue, chartData } = useMemo(() => {
    let invested = 0;
    let fv = 0;
    let currentSip = sip;
    const monthlyRate = cagr / 100 / 12;
    const data = [];
    
    for (let year = 1; year <= 10; year++) {
      for (let month = 1; month <= 12; month++) {
        invested += currentSip;
        fv = (fv + currentSip) * (1 + monthlyRate);
        data.push({
           month: `Y${year} M${month}`,
           Invested: invested,
           Gained: fv - invested
        });
      }
      currentSip *= (1 + stepUp / 100);
    }
    return { totalInvested: invested, futureValue: fv, chartData: data };
  }, [sip, stepUp, cagr]);
  
  const formatCurrency = (val: number) => {
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
    return `₹${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const wealthGained = futureValue - totalInvested;

  return (
    <div className="bg-[#111114] border border-white/5 p-5 rounded-xl flex flex-col h-full overflow-hidden">
      <h3 className="text-sm font-semibold text-text-primary mb-6 flex items-center gap-1.5 shrink-0 group relative w-fit cursor-help">
        SIP Compounding Simulator <HelpCircle size={14} className="text-text-secondary hover:text-white transition-colors" />
        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 bg-[#1a1a24] text-white text-[10px] p-2 rounded shadow-xl z-50 normal-case tracking-normal border border-white/10 font-normal leading-relaxed">
          Simulates the future value of a Systematic Investment Plan over 10 years using the fund's historical CAGR ({cagr.toFixed(2)}%).
        </div>
      </h3>
      
      <div className="flex-1 flex flex-col gap-6">
        {/* Sliders */}
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-text-secondary">Monthly SIP</span>
              <span className="text-white">₹{sip.toLocaleString()}</span>
            </div>
            <input 
              type="range" min="500" max="100000" step="500" 
              value={sip} onChange={(e) => setSip(Number(e.target.value))}
              className="w-full accent-alpha"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-text-secondary">Annual Step-Up</span>
              <span className="text-white">{stepUp}%</span>
            </div>
            <input 
              type="range" min="0" max="50" step="1" 
              value={stepUp} onChange={(e) => setStepUp(Number(e.target.value))}
              className="w-full accent-alpha"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex gap-4 items-center">
           <div className="flex-1 flex flex-col gap-1 p-3 bg-white/5 rounded-lg border border-white/5">
             <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Invested</span>
             <span className="text-lg font-bold font-mono">{formatCurrency(totalInvested)}</span>
           </div>
           <div className="flex-1 flex flex-col gap-1 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20 relative overflow-hidden group">
             <div className="absolute inset-0 bg-emerald-400/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
             <span className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-wider relative z-10">Wealth Gained</span>
             <span className="text-lg font-bold font-mono text-emerald-400 relative z-10">+{formatCurrency(wealthGained)}</span>
           </div>
        </div>
        
        {/* Visual Bar -> Area Chart */}
        <div className="flex-1 min-h-[120px] relative -mx-5 -mb-5">
           <ResponsiveContainer width="100%" height="100%">
             <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
               <defs>
                 <linearGradient id="gainedGradient" x1="0" y1="0" x2="0" y2="1">
                   <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                   <stop offset="95%" stopColor="#10b981" stopOpacity={0.2}/>
                 </linearGradient>
               </defs>
               <Tooltip 
                 contentStyle={{ backgroundColor: '#111114', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}
                 formatter={(value: any, name: any) => [formatCurrency(Number(value)), name]}
                 labelStyle={{ display: 'none' }}
               />
               <Area type="monotone" dataKey="Invested" stackId="1" stroke="#3f3f46" fill="#27272a" />
               <Area type="monotone" dataKey="Gained" stackId="1" stroke="#10b981" fill="url(#gainedGradient)" />
             </AreaChart>
           </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
