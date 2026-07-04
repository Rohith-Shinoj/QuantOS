import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ZAxis, ReferenceLine } from 'recharts';
import { fetchAllStocks } from '../../api';
import { InfoTooltip } from '../../components/InfoTooltip';

export const ValuationGauges = ({ data }: { data: any }) => {
  const abs = data.absolute || {};
  const rel = data.relative || {};
  
  const currentIndustry = rel.meta_features?.industry_name;
  const currentSlug = abs.slug;

  const { data: allStocks } = useQuery({
    queryKey: ['allStocks'],
    queryFn: fetchAllStocks,
    staleTime: 1000 * 60 * 60,
  });

  const scatterData = useMemo(() => {
    if (!allStocks || !currentIndustry) return [];
    
    // Filter peers in the same industry from the flat array returned by fetchAllStocks
    const peers = allStocks.filter((s: any) => 
      s.industry === currentIndustry
    );

    return peers.map((p: any) => {
      const roe = Number(p.roe) || 0;
      const pe = Number(p.peRatio) || 0;
      
      return {
        slug: p.slug,
        ticker: p.ticker || 'Unknown',
        x: roe * 100, // convert to percentage
        y: pe, // using PE Ratio as price multiple
        isCurrent: p.slug === currentSlug
      };
    }).filter((d: any) => !isNaN(d.x) && !isNaN(d.y) && d.y > 0 && d.y < 200 && d.x > -50 && d.x < 150);
  }, [allStocks, currentIndustry, currentSlug]);

  const tech = abs.technicals || {};

  const getRsiVerdict = (e: number) => e > 70 ? ["High Momentum", "text-blue-400"] : e > 65 && e <= 70 ? ["Rising Momentum", "text-blue-300"] : e > 35 && e <= 65 ? ["Neutral", "text-gray-400"] : e > 30 && e <= 35 ? ["Oversold", "text-emerald-500"] : ["Deep Oversold", "text-emerald-400"];
  const getMacdVerdict = (e: number) => e > 0 ? ["Bullish", "text-emerald-500"] : e < 0 ? ["Bearish", "text-red-500"] : ["At signal", "text-emerald-500"];
  const getBetaVerdict = (e: number) => e > 1.2 ? ["High Volatility", "text-red-400"] : e >= .8 && e <= 1.2 ? ["Market Beta", "text-gray-400"] : ["Low Volatility", "text-emerald-400"];

  const techMetrics = [
    { name: "RSI (14)", value: tech.rsi14, verdict: tech.rsi14 !== undefined ? getRsiVerdict(tech.rsi14) : null },
    { name: "MACD", value: tech.macd, verdict: tech.macd !== undefined ? getMacdVerdict(tech.macd) : null },
    { name: "Beta", value: tech.beta, verdict: tech.beta !== undefined ? getBetaVerdict(tech.beta) : null }
  ].filter(m => m.value !== undefined && m.value !== null);

  const avgX = scatterData.length > 0 ? scatterData.reduce((acc: number, val: any) => acc + val.x, 0) / scatterData.length : 0;
  const avgY = scatterData.length > 0 ? scatterData.reduce((acc: number, val: any) => acc + val.y, 0) / scatterData.length : 0;

  return (
    <div className="bg-[#121214] p-5 rounded-xl border border-white/5 h-full flex flex-col group hover:border-white/10 transition-colors">
      <div className="flex justify-between items-start mb-2 shrink-0">
        <div>
          <h3 className="text-lg font-medium text-text-primary flex items-center tracking-tight">
            Sector Valuation Matrix
            <InfoTooltip text="2D Sector distribution. X-Axis: Quality (ROE). Y-Axis: Price (P/E Ratio). Bottom-Right quadrant is the Deep Value 'Multibagger' zone (High Quality, Low Price)." />
          </h3>
          <p className="text-[11px] text-text-secondary mt-1 uppercase tracking-wider font-semibold">
            Intrinsic Value vs Sector Peers
          </p>
        </div>
      </div>
      
      <div className="flex-1 min-h-[220px] mt-2 relative">
        {scatterData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.5} />
              <XAxis 
                type="number" 
                dataKey="x" 
                name="ROE" 
                stroke="#64748b" 
                fontSize={10}
                tickFormatter={(v) => `${v}%`}
                label={{ value: 'Quality (ROE %)', position: 'insideBottom', offset: -15, fill: '#64748b', fontSize: 10 }}
              />
              <YAxis 
                type="number" 
                dataKey="y" 
                name="P/E Ratio" 
                stroke="#64748b" 
                fontSize={10}
                label={{ value: 'Price (P/E Ratio)', angle: -90, position: 'insideLeft', offset: 10, fill: '#64748b', fontSize: 10 }}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ backgroundColor: '#141417', borderColor: '#27272a', borderRadius: '8px' }}
                formatter={(value: any, name: any) => [name === 'ROE' ? `${Number(value).toFixed(1)}%` : `${Number(value).toFixed(1)}x`, name]}
                labelFormatter={() => ''}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-surface/95 backdrop-blur border border-border p-2 rounded shadow-lg text-[11px]">
                        <div className="font-bold text-text-primary mb-1">{d.ticker}</div>
                        <div className="text-emerald-400">ROE: {d.x.toFixed(1)}%</div>
                        <div className="text-blue-400">P/E Ratio: {d.y.toFixed(1)}x</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine x={avgX} stroke="#52525b" strokeDasharray="3 3" />
              <ReferenceLine y={avgY} stroke="#52525b" strokeDasharray="3 3" />
              <Scatter name="Sector Peers" data={scatterData}>
                {scatterData.map((entry: any, index: number) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.isCurrent ? '#10b981' : '#52525b'} 
                    opacity={entry.isCurrent ? 1 : 0.4}
                    className={entry.isCurrent ? "animate-pulse" : ""}
                    stroke={entry.isCurrent ? '#ffffff' : 'none'}
                    strokeWidth={entry.isCurrent ? 2 : 0}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-secondary text-xs italic opacity-50">
            Sector peers unavailable.
          </div>
        )}
      </div>

      {/* Technical Indicators */}
      {techMetrics.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/5 shrink-0">
          <div className="grid grid-cols-3 gap-3">
            {techMetrics.map(m => (
              <div key={m.name} className="bg-white/5 rounded p-2 flex flex-col justify-between border border-white/5">
                <span className="text-[9px] text-text-secondary font-bold uppercase tracking-wider">{m.name}</span>
                <div className="mt-0.5">
                  <div className="text-[12px] font-bold text-text-primary tabular-nums">{m.value.toFixed(2)}</div>
                  {m.verdict && (
                    <div className={`text-[8px] font-bold uppercase tracking-wider truncate ${m.verdict[1]}`}>
                      {m.verdict[0]}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
