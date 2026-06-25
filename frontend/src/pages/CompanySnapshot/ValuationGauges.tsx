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
    },
    {
      name: "Dividend Yield",
      value: abs.dividendYieldInPercent || abs.divYield,
      sectorValue: abs.sectorDivYield,
      invert: true,
      suffix: '%'
    }
  ].filter(m => m.value && m.sectorValue);

  return (
    <div className="bg-[#121214] p-5 rounded-xl border border-white/5 h-full flex flex-col group hover:border-white/10 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-lg font-medium text-text-primary flex items-center tracking-tight">
            Valuation Percentile Spectrum
            <InfoTooltip text="Visualizes the stock's current multiples against the sector averages." />
          </h3>
          <p className="text-sm text-text-secondary mt-1">Relative fundamental gauges</p>
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
                <span className="text-sm font-bold text-text-primary">{metric.value.toFixed(2)}{metric.suffix || 'x'}</span>
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
                    Sector Avg: {metric.sectorValue.toFixed(2)}{metric.suffix || 'x'}
                  </div>
                </div>

                {/* Stock Position Marker */}
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-[#121214] rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] z-20 transition-all duration-1000 ease-out"
                  style={{ left: `calc(${pos}% - 8px)` }}
                >
                   {/* Tooltip for Stock */}
                   <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/gauge:opacity-100 transition-opacity bg-alpha text-white text-[10px] px-2 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap font-bold">
                    {metric.value.toFixed(2)}{metric.suffix || 'x'}
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
      </div>
    </div>
  );
};
