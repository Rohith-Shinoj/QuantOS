import React, { useEffect, useState, useMemo } from 'react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Cell
} from 'recharts';
import { HelpCircle } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const MarketCaptureScatterplot = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('3Y');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [hitRateThreshold, setHitRateThreshold] = useState(0);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/funds/capture-ratios`)
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const chartData = useMemo(() => {
    return data
      .filter(d => d[`up_${period}`] !== null && d[`down_${period}`] !== null)
      .filter(d => selectedCategory === 'All' || (d.category || '').toLowerCase() === selectedCategory.toLowerCase())
      .filter(d => {
        if (hitRateThreshold === 0) return true;
        const upHit = d[`up_hit_${period}`];
        const downHit = d[`down_hit_${period}`];
        if (upHit === null || downHit === null) return false;
        return (upHit * 100 >= hitRateThreshold) && (downHit * 100 >= hitRateThreshold);
      })
      .map(d => ({
        ...d,
        up: d[`up_${period}`],
        down: d[`down_${period}`],
      }));
  }, [data, period, selectedCategory, hitRateThreshold]);

  const getDotColor = (category: string) => {
    if (!category) return '#ffffff';
    const cat = category.toLowerCase();
    if (cat.includes('equity')) return '#3b82f6'; // Blue
    if (cat.includes('debt')) return '#9ca3af'; // Gray
    if (cat.includes('hybrid')) return '#a855f7'; // Purple
    return '#ffffff';
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const fund = payload[0].payload;
      return (
        <div className="bg-surface-hover border border-border p-3 rounded shadow-xl text-text-primary z-50">
          <p className="text-sm font-bold mb-1">{fund.fund_name}</p>
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">{fund.category}</p>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <p className="text-[10px] text-text-secondary">Up-Capture</p>
              <p className="text-sm font-mono text-emerald-400 font-bold">{fund.up}%</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary">Down-Capture</p>
              <p className="text-sm font-mono text-red-400 font-bold">{fund.down}%</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary" title="Rolling 1-Month Outperformance">Up Hit Rate</p>
              <p className="text-sm font-mono text-text-primary font-bold">
                {fund[`up_hit_${period}`] != null ? (fund[`up_hit_${period}`] * 100).toFixed(1) + '%' : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary" title="Rolling 1-Month Resilience">Down Hit Rate</p>
              <p className="text-sm font-mono text-text-primary font-bold">
                {fund[`down_hit_${period}`] != null ? (fund[`down_hit_${period}`] * 100).toFixed(1) + '%' : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-surface rounded-lg border border-border p-6 h-full flex flex-col relative overflow-hidden">
      <div className="flex justify-between items-start mb-4 shrink-0 z-10">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 group relative w-fit cursor-help">
          Up-Down Market Capture <HelpCircle size={14} className="text-text-secondary hover:text-text-primary transition-colors" />
          <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-72 bg-surface-hover text-text-primary text-[10px] p-2 rounded shadow-xl z-50 normal-case tracking-normal border border-border font-normal leading-relaxed">
            Measures a manager's performance in bull vs bear markets. 
            <br/><br/>
            Top-Left (Alpha): Beats up-markets, protects in down-markets.<br/>
            Bottom-Right (Dead Zone): Underperforms in up-markets, crashes harder in down-markets.
          </div>
        </h3>
        
        <div className="flex gap-2 shrink-0 items-center">
          {/* Consistency Slider */}
          <div className="flex items-center gap-2 mr-4 bg-surface-hover rounded-md px-3 py-1 border border-border">
            <span className="text-[10px] text-text-secondary uppercase tracking-wider font-bold w-24">Hit Rate: {hitRateThreshold}%+</span>
            <input 
              type="range" 
              min="0" 
              max="100" 
              step="5"
              value={hitRateThreshold} 
              onChange={(e) => setHitRateThreshold(parseInt(e.target.value))}
              className="w-24 accent-alpha cursor-pointer"
            />
          </div>
          
          {/* Category Toggle */}
          <div className="flex bg-surface-hover rounded-md p-0.5 border border-border">
            {['All', 'Equity', 'Debt', 'Hybrid'].map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCategory(c)}
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${selectedCategory === c ? 'bg-[#27272a] text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {c}
              </button>
            ))}
          </div>
          {/* Period Toggle */}
          <div className="flex bg-surface-hover rounded-md p-0.5 border border-border">
            {['1M', '3M', '6M', '1Y', '3Y', '5Y'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${period === p ? 'bg-[#27272a] text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-text-secondary text-sm">
          Calculating Geometric Models...
        </div>
      ) : (
        <div className="flex-1 min-h-0 w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid stroke="#ffffff05" strokeDasharray="3 3" />
              
              {/* Quadrant Backgrounds */}
              {/* Top-Left: Alpha Quadrant */}
              <ReferenceArea x1={-100} x2={100} y1={100} y2={300} fill="#10b981" fillOpacity={0.03} />
              {/* Bottom-Right: Dead Zone */}
              <ReferenceArea x1={100} x2={300} y1={-100} y2={100} fill="#ef4444" fillOpacity={0.03} />
              {/* Top-Right: High Beta */}
              <ReferenceArea x1={100} x2={300} y1={100} y2={300} fill="#f59e0b" fillOpacity={0.02} />
              {/* Bottom-Left: Defensive */}
              <ReferenceArea x1={-100} x2={100} y1={-100} y2={100} fill="#3b82f6" fillOpacity={0.02} />

              <XAxis 
                type="number" 
                dataKey="down" 
                name="Down Capture" 
                domain={[-50, 250]} 
                stroke="#ffffff40" 
                fontSize={10}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis 
                type="number" 
                dataKey="up" 
                name="Up Capture" 
                domain={[-50, 250]} 
                stroke="#ffffff40" 
                fontSize={10}
                tickFormatter={(v) => `${v}%`}
              />
              
              {/* Crosshairs at 100, 100 */}
              <ReferenceLine x={100} stroke="#ffffff40" strokeDasharray="3 3" />
              <ReferenceLine y={100} stroke="#ffffff40" strokeDasharray="3 3" />

              <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
              <Scatter name="Funds" data={chartData} opacity={0.6}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getDotColor(entry.category)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          
          <div className="absolute top-2 left-10 text-[9px] font-bold text-emerald-500/50 uppercase tracking-widest">Alpha Quadrant</div>
          <div className="absolute bottom-6 right-6 text-[9px] font-bold text-red-500/50 uppercase tracking-widest">Dead Zone</div>
        </div>
      )}
    </div>
  );
};
