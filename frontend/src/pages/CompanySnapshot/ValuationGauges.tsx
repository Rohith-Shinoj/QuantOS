import React from 'react';
import { InfoTooltip } from '../../components/InfoTooltip';

export const ValuationGauges = ({ data }: { data: any }) => {
  const abs = data.absolute || {};
  console.log("ValuationGauges rendering. Data:", abs);

  const metrics = [
    {
      name: "P/E Ratio",
      value: abs.peRatio,
      sectorValue: abs.sectorPe,
      invert: false,
    },
    {
      name: "P/B Ratio",
      value: abs.pbRatio,
      sectorValue: abs.sectorPb,
      invert: false,
    }
  ].filter(m => m.value && m.sectorValue);

  const tech = abs.technicals || {};

  const getRsiVerdict = (e: number) => e > 70 ? ["Overbought", "text-red-500"] : e > 65 && e <= 70 ? ["Near overbought", "text-red-500"] : e > 35 && e <= 65 ? ["Neutral", "text-gray-400"] : e > 30 && e <= 35 ? ["Near oversold", "text-green-500"] : ["Oversold", "text-green-500"];
  const getMacdVerdict = (e: number) => e > 0 ? ["Bullish", "text-green-500"] : e < 0 ? ["Bearish", "text-red-500"] : ["At signal", "text-green-500"];
  const getBetaVerdict = (e: number) => e > 1.2 ? ["Highly volatile", "text-gray-400"] : e >= .8 && e <= 1.2 ? ["Volatile like mkt", "text-gray-400"] : ["Less volatile", "text-gray-400"];

  const techMetrics = [
    { name: "RSI (14)", value: tech.rsi14, verdict: tech.rsi14 !== undefined ? getRsiVerdict(tech.rsi14) : null },
    { name: "MACD", value: tech.macd, verdict: tech.macd !== undefined ? getMacdVerdict(tech.macd) : null },
    { name: "Beta", value: tech.beta, verdict: tech.beta !== undefined ? getBetaVerdict(tech.beta) : null }
  ].filter(m => m.value !== undefined && m.value !== null);

  return (
    <div className="bg-[#121214] p-5 rounded-xl border border-white/5 h-full flex flex-col group hover:border-white/10 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-lg font-medium text-text-primary flex items-center tracking-tight">
            Valuation & Technicals
            <InfoTooltip text="Visualizes the stock's current multiples against the sector averages and displays basic technical indicators." />
          </h3>
          <p className="text-sm text-text-secondary mt-1">Relative fundamental and technical gauges</p>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col justify-center mt-4">
        {metrics.map(metric => {
          // Dynamic bounds based on sector avg (sector avg sits roughly at 40%)
          const maxVal = metric.sectorValue * 2.5;
          let pos = (metric.value / maxVal) * 100;
          pos = Math.max(2, Math.min(98, pos));
          
          let sectorPos = (metric.sectorValue / maxVal) * 100;
          sectorPos = Math.max(2, Math.min(98, sectorPos));

          return (
            <div className="mb-6 relative group/gauge" key={metric.name}>
              <div className="flex justify-between items-end mb-2">
                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">{metric.name}</span>
                <span className="text-sm font-bold text-text-primary">{metric.value.toFixed(2)}x</span>
              </div>
              
              {/* Spectrum Bar Container */}
              <div className="relative h-2.5 rounded-full w-full bg-[#1c1c1f] shadow-inner overflow-visible">
                {/* Gradient Background */}
                <div 
                  className="absolute inset-0 rounded-full opacity-80"
                  style={{
                    background: metric.invert 
                      ? 'linear-gradient(90deg, #ef4444 0%, #eab308 50%, #22c55e 100%)'
                      : 'linear-gradient(90deg, #22c55e 0%, #eab308 50%, #ef4444 100%)'
                  }}
                />
                
                {/* Sector Average Marker */}
                <div 
                  className="absolute top-1/2 -translate-y-1/2 h-5 w-1 bg-white/40 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)] z-10"
                  style={{ left: `calc(${sectorPos}% - 2px)` }}
                >
                  {/* Tooltip for Sector */}
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/gauge:opacity-100 transition-opacity bg-[#27272a] text-white text-[10px] px-2 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap z-30">
                    Sector Avg: {metric.sectorValue.toFixed(2)}x
                  </div>
                </div>

                {/* Stock Position Marker */}
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-[#121214] rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] z-20 transition-all duration-1000 ease-out"
                  style={{ left: `calc(${pos}% - 8px)` }}
                >
                   {/* Tooltip for Stock */}
                   <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/gauge:opacity-100 transition-opacity bg-alpha text-white text-[10px] px-2 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap font-bold">
                    {metric.value.toFixed(2)}x
                  </div>
                </div>
              </div>
              <div className="flex justify-between mt-1.5 px-1">
                <span className="text-[9px] text-text-secondary/50 font-medium uppercase tracking-wider">{metric.invert ? 'Lower' : 'Cheaper'}</span>
                <span className="text-[9px] text-text-secondary/50 font-medium uppercase tracking-wider">{metric.invert ? 'Higher' : 'Expensive'}</span>
              </div>
            </div>
          );
        })}
        {metrics.length === 0 && (
           <div className="h-full flex flex-col items-center justify-center text-text-secondary text-xs italic opacity-50">
             <span>Valuation data unavailable for this asset.</span>
           </div>
        )}

        {/* Technical Indicators */}
        {techMetrics.length > 0 && (
          <div className="mt-2 pt-4 border-t border-white/5">
            <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-3">Technical Indicators</h4>
            <div className="grid grid-cols-3 gap-3">
              {techMetrics.map(m => (
                <div key={m.name} className="bg-white/5 rounded-lg p-2.5 flex flex-col justify-between border border-white/5 hover:border-white/10 transition-colors">
                  <span className="text-[10px] text-text-secondary font-semibold">{m.name}</span>
                  <div className="mt-1">
                    <div className="text-[13px] font-bold text-text-primary">{m.value.toFixed(2)}</div>
                    {m.verdict && (
                      <div className={`text-[9px] font-bold mt-1 uppercase tracking-wider ${m.verdict[1]}`}>
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
    </div>
  );
};
