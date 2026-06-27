import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, HelpCircle } from 'lucide-react';

export const DrawdownProfileCard = ({ fund }: { fund: any }) => {
  const [period, setPeriod] = useState('5Y');
  
  const data = useMemo(() => {
    if (!fund?.historical_navs || !Array.isArray(fund.historical_navs) || fund.historical_navs.length === 0) {
      return [];
    }
    
    // Create a new array and sort chronologically (timestamp is index 0)
    const sortedNavs = [...fund.historical_navs].sort((a, b) => a[0] - b[0]);
    
    // Filter by period
    const now = new Date().getTime();
    const periodYears = period === '1Y' ? 1 : period === '3Y' ? 3 : 5;
    const cutoffDate = now - (periodYears * 365 * 24 * 60 * 60 * 1000);
    
    // For performance on Recharts, we can sample the data if it's daily (e.g. weekly sampling)
    // but AreaChart can handle ~1500 points fine.
    const filteredNavs = sortedNavs.filter(n => n[0] >= cutoffDate);
    if (filteredNavs.length === 0) return [];
    
    let peak = filteredNavs[0][1];
    const points = [];
    
    for (const [timestamp, nav] of filteredNavs) {
      if (nav > peak) peak = nav;
      // Drawdown is calculated as (Current NAV - Peak NAV) / Peak NAV
      let drawdown = ((nav - peak) / peak) * 100;
      
      points.push({
        date: new Date(timestamp).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        value: Number(drawdown.toFixed(2))
      });
    }
    
    return points;
  }, [fund, period]);

  const maxDrawdown = data.length > 0 ? Math.min(...data.map(d => d.value)) : 0;
  
  // Calculate Time to Recovery from Max Drawdown
  const ttr = useMemo(() => {
    let maxIdx = data.findIndex(d => d.value === maxDrawdown);
    if (maxIdx === -1 || maxDrawdown === 0) return 0;
    
    for (let i = maxIdx; i < data.length; i++) {
      if (data[i].value >= -1) { // Within 1% of peak
         return Math.round((i - maxIdx) / 4); // roughly months (4 weeks)
      }
    }
    return Math.round((data.length - 1 - maxIdx) / 4); // Still underwater
  }, [data, maxDrawdown]);

  return (
    <div className="bg-[#111114] border border-white/5 p-5 rounded-xl flex flex-col justify-between h-full overflow-hidden">
      <div className="flex justify-between items-start mb-4 shrink-0">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 group relative w-fit cursor-help">
          Drawdown & Recovery Profile <HelpCircle size={14} className="text-text-secondary hover:text-white transition-colors" />
          <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 bg-[#1a1a24] text-white text-[10px] p-2 rounded shadow-xl z-50 normal-case tracking-normal border border-white/10 font-normal leading-relaxed">
            Visualizes historical drops from peak valuation. Assesses the fund's downside risk and how quickly it recovers from macro crashes.
          </div>
        </h3>
        
        {/* Toggle */}
        <div className="flex bg-[#1a1a24] rounded-md p-0.5 border border-white/10 shrink-0">
          {['1Y', '3Y', '5Y'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${period === p ? 'bg-[#27272a] text-white' : 'text-text-secondary hover:text-white'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex items-center gap-6 mb-4 shrink-0">
         <div className="flex flex-col">
           <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Max Drawdown</span>
           <span className="text-lg font-bold font-mono text-red-400">{maxDrawdown.toFixed(2)}%</span>
         </div>
         <div className="flex flex-col">
           <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Time to Recovery</span>
           <span className="text-lg font-bold text-white">{ttr} <span className="text-xs text-text-secondary">Months</span></span>
         </div>
      </div>

      {data.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-text-secondary border border-white/5 border-dashed rounded-lg bg-white/5">
           <Activity size={24} className="mb-2 opacity-50" />
           <span className="text-xs font-semibold">Historical NAV data not available</span>
           <span className="text-[10px] mt-1 opacity-70">Cannot compute real drawdown profile.</span>
        </div>
      ) : (
      <div className="flex-1 min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.4}/>
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="date" 
              stroke="#ffffff20" 
              fontSize={10} 
              tick={{fill: '#888'}} 
              tickMargin={8} 
              minTickGap={30}
            />
            <YAxis 
              stroke="#ffffff20" 
              fontSize={10} 
              tick={{fill: '#888'}} 
              tickFormatter={(v) => `${v}%`}
              domain={[Math.floor(maxDrawdown - 5), 0]}
              reversed={false} // 0 at top, negatives below
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#111114', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}
              itemStyle={{ color: '#ef4444' }}
              formatter={(value: any) => [`${value}%`, 'Drawdown']}
            />
            <ReferenceLine y={0} stroke="#ffffff40" strokeDasharray="3 3" />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#ef4444" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#drawdownGradient)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
};
