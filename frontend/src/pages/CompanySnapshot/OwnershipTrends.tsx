import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { HelpCircle } from 'lucide-react';

export const OwnershipTrends = ({ data }: { data: any }) => {
  const rel = data.relative || {};
  const abs = data.absolute || {};
  const mom = rel.shareholding_momentum_vectors || {};
  
  const shp = abs.shareHoldingPattern || {};
  const quarters = Object.keys(shp);
  let chartData: { name: string, value: number }[] = [];
  let latestQuarter = '';
  let latestInstPct = 0;
  let instPctChange: number | null = null;
  const [viewIndex, setViewIndex] = useState(0);
  let sortedQuarters: string[] = [];
  
  const categories = [
    { key: 'promoters', label: 'Promoters' },
    { key: 'retailAndOthers', label: 'Retail & Others' },
    { key: 'foreignInstitutions', label: 'Foreign Inst.' },
    { key: 'otherDomesticInstitutions', label: 'Other Dom. Inst.' },
    { key: 'mutualFunds', label: 'Mutual Funds' },
  ];
  
  const getSum = (node: any) => {
    if (!node) return 0;
    if (typeof node.percent === 'number') return node.percent;
    let sum = 0;
    for (const key in node) {
      if (node[key]?.percent) sum += node[key].percent;
    }
    return sum;
  };
  
  if (quarters.length > 0) {
    const parseQuarter = (q: string) => {
       const [month, year] = q.split(" '");
       return new Date(`${month} 1, 20${year}`).getTime();
    };
    sortedQuarters = [...quarters].sort((a, b) => parseQuarter(b) - parseQuarter(a));
    latestQuarter = sortedQuarters[0];
    const prevQuarter = sortedQuarters.length > 1 ? sortedQuarters[1] : sortedQuarters[0];
    
    const latestData = shp[latestQuarter];
    const prevData = shp[prevQuarter];

    if (latestData) {
      const mf = latestData.mutualFunds?.percent || 0;
      const fi = latestData.foreignInstitutions?.percent || 0;
      const ins = latestData.otherDomesticInstitutions?.insurance?.percent || 0;
      latestInstPct = mf + fi + ins;
      
      if (prevData) {
        const mfPrev = prevData.mutualFunds?.percent || 0;
        const fiPrev = prevData.foreignInstitutions?.percent || 0;
        const insPrev = prevData.otherDomesticInstitutions?.insurance?.percent || 0;
        instPctChange = latestInstPct - (mfPrev + fiPrev + insPrev);
      }

      chartData = categories.map(cat => {
        const valLatest = getSum(latestData[cat.key]);
        const valPrev = getSum(prevData[cat.key]);
        return {
          name: cat.label,
          value: valLatest - valPrev
        };
      });
    }
  }

  const CustomYAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const category = chartData.find(c => c.name === payload.value);
    if (!category) return null;
    const isPos = category.value >= 0;
    const valText = `${isPos ? '+' : ''}${category.value.toFixed(2)}%`;
    const color = isPos ? '#10b981' : '#ef4444';
    
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={4} textAnchor="end" fill="#94a3b8" fontSize={11}>
          <tspan>{payload.value}</tspan>
          <tspan fill={color} fontWeight="bold" dx={6}>{valText}</tspan>
        </text>
      </g>
    );
  };

  return (
    <div className="bg-surface border border-border p-5 rounded-xl flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-start mb-6">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 shrink-0 group relative w-fit cursor-help">
          Ownership Trends
          <HelpCircle size={14} className="text-text-secondary hover:text-text-primary transition-colors" />
          <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 bg-surface-hover text-text-primary text-[10px] p-2 rounded shadow-xl z-50 normal-case tracking-normal border border-border font-normal leading-relaxed">
            Tracks Quarter-over-Quarter (QoQ) shifts in shareholding across major categories.
          </div>
        </h3>
        {latestInstPct > 0 && (
          <div className="text-right flex flex-col items-end">
            <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Inst. Holding ({latestQuarter})</div>
            <div className="flex items-center gap-2">
              {instPctChange !== null && instPctChange !== 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums ${instPctChange > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  {instPctChange > 0 ? '+' : ''}{instPctChange.toFixed(2)}%
                </span>
              )}
              <div className="text-xl font-bold font-mono text-emerald-400">{latestInstPct.toFixed(2)}%</div>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-[250px] relative">
        {viewIndex === 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={true} vertical={false} />
              <XAxis 
                type="number" 
                stroke="#94a3b8" 
                fontSize={12} 
                tickFormatter={(val) => `${val.toFixed(1)}%`} 
                domain={[(min: number) => Math.min(min, 0) * 1.1, (max: number) => Math.max(max, 0) * 1.1]} 
              />
              <YAxis dataKey="name" type="category" stroke="#94a3b8" width={180} tick={<CustomYAxisTick />} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#141417', borderColor: '#27272a', color: '#f8fafc' }}
                itemStyle={{ color: '#10b981' }}
                formatter={(val: any) => [`${Number(val).toFixed(2)}%`, 'QoQ Delta']}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.value < 0 ? '#ef4444' : '#10b981'} />
                ))}
              </Bar>
              <ReferenceLine x={0} stroke="#71717a" strokeWidth={1} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-surface-hover sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border">Category</th>
                  {sortedQuarters.slice(0, 4).map(q => <th key={q} className="py-2 px-3 text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border">{q}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-surface">
                {categories.map(cat => (
                  <tr key={cat.key} className="hover:bg-white/5 transition-colors">
                    <td className="py-2 px-3 text-sm border-b border-border text-text-primary font-medium">{cat.label}</td>
                    {sortedQuarters.slice(0, 4).map((q, i) => {
                      const val = getSum(shp[q]?.[cat.key]);
                      const prevQ = sortedQuarters[i + 1];
                      let yoy: number | null = null;
                      if (prevQ) {
                         const prevVal = getSum(shp[prevQ]?.[cat.key]);
                         yoy = val - prevVal;
                      }
                      
                      return (
                        <td key={q} className="py-2 px-3 border-b border-border">
                          <div className="flex flex-row items-center gap-1.5 min-w-max">
                            <span className="text-sm font-bold text-text-primary tabular-nums">{val.toFixed(2)}%</span>
                            {yoy !== null && Math.abs(yoy) >= 0.01 && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums ${yoy > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {yoy > 0 ? '+' : ''}{yoy.toFixed(2)}%
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Pagination Dots */}
      <div className="h-6 mt-3 shrink-0 flex items-center justify-center gap-3">
        {[0, 1].map((dotIndex) => (
          <button 
            key={dotIndex}
            onClick={() => setViewIndex(dotIndex)}
            className={`w-2.5 h-2.5 rounded-full transition-all ${viewIndex === dotIndex ? 'bg-emerald-400 scale-125' : 'bg-[#27272a] hover:bg-[#3f3f46]'}`}
            title={dotIndex === 0 ? "Bar Chart" : "Raw Data"}
          />
        ))}
      </div>
    </div>
  );
};
