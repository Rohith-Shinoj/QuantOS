import React, { useMemo } from 'react';
import { PieChart, HelpCircle } from 'lucide-react';

export const HoldingsConcentrationCard = ({ fund }: { fund: any }) => {
  // Parse Detailed Holdings
  const parsedHoldings = useMemo(() => {
    if (!fund?.detailed_holdings) return [];
    try {
      const raw = typeof fund.detailed_holdings === 'string' ? JSON.parse(fund.detailed_holdings) : fund.detailed_holdings;
      if (!Array.isArray(raw)) return [];
      return raw.map((h: any) => ({
        name: h.company_name,
        size: parseFloat(h.corpus_per) || 0,
        sector: h.sector_name || 'Other',
        type: h.nature_name || 'UNKNOWN'
      })).sort((a: any, b: any) => b.size - a.size);
    } catch { return []; }
  }, [fund?.detailed_holdings]);

  // Sector Allocation Map
  const sectorAllocations = useMemo(() => {
    const map = new Map<string, number>();
    parsedHoldings.forEach((h: any) => {
      if (h.type !== 'CASH') {
        map.set(h.sector, (map.get(h.sector) || 0) + h.size);
      }
    });
    return Array.from(map.entries())
      .map(([name, size]) => ({ name, size }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 5); // Top 5
  }, [parsedHoldings]);

  // Pure Equity Holdings (Filter out CASH/Repo)
  const equityHoldings = useMemo(() => {
    return parsedHoldings.filter((h: any) => h.type !== 'CASH').slice(0, 5);
  }, [parsedHoldings]);

  // Concentration Metric
  const top10Concentration = useMemo(() => {
    const equities = parsedHoldings.filter((h: any) => h.type !== 'CASH');
    return equities.slice(0, 10).reduce((acc: number, h: any) => acc + h.size, 0);
  }, [parsedHoldings]);

  return (
    <div className="bg-[#111114] border border-white/5 p-5 rounded-xl flex flex-col justify-between h-full overflow-hidden">
      <div className="flex justify-between items-start mb-6 shrink-0">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 group relative w-fit cursor-help">
          Holdings & Sector Concentration <HelpCircle size={14} className="text-text-secondary hover:text-white transition-colors" />
          <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 bg-[#1a1a24] text-white text-[10px] p-2 rounded shadow-xl z-50 normal-case tracking-normal border border-white/10 font-normal leading-relaxed">
            Displays the fund's top pure-equity holdings and sector tilts, removing cash equivalents like Repo to reveal the true portfolio exposure.
          </div>
        </h3>
        
        {/* Concentration Badge */}
        {top10Concentration > 0 && (
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Top 10 Weight</span>
            <span className={`text-sm font-bold font-mono ${top10Concentration > 40 ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {top10Concentration.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        
        {/* Left: Sectors */}
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-2 border-r border-white/5">
          <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider sticky top-0 bg-[#111114] pb-2 z-10 border-b border-white/5">
            Top 5 Sectors
          </div>
          {sectorAllocations.map((sector, i) => (
            <div key={i} className="flex flex-col gap-1 shrink-0 mt-1">
              <div className="flex justify-between items-center text-[11px] font-bold">
                <span className="text-text-primary truncate pr-2">{sector.name}</span>
                <span className="text-text-secondary font-mono">{sector.size.toFixed(1)}%</span>
              </div>
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full" 
                  style={{ 
                    width: `${sector.size}%`,
                    backgroundColor: i === 0 ? '#3b82f6' : i === 1 ? '#8b5cf6' : i === 2 ? '#ec4899' : i === 3 ? '#f59e0b' : '#10b981'
                  }}
                ></div>
              </div>
            </div>
          ))}
          {sectorAllocations.length === 0 && (
            <div className="flex h-full items-center justify-center text-text-secondary text-sm">No data</div>
          )}
        </div>

        {/* Right: Holdings */}
        <div className="flex-1 flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-1">
          <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider sticky top-0 bg-[#111114] pb-2 z-10 border-b border-white/5 flex justify-between">
            <span>Top 5 Equities</span>
            <span>Wt</span>
          </div>
          {equityHoldings.map((h: any, i: number) => (
            <div key={i} className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded px-1 transition-colors group shrink-0">
              <div className="flex flex-col min-w-0 flex-1 pr-2">
                <span className="text-[11px] font-bold text-text-primary truncate">{h.name}</span>
                <span className="text-[9px] text-text-secondary truncate">{h.sector}</span>
              </div>
              <div className="w-12 flex items-center justify-end shrink-0">
                <span className="text-[11px] font-mono font-bold text-text-primary">{h.size.toFixed(2)}%</span>
              </div>
            </div>
          ))}
          {equityHoldings.length === 0 && (
            <div className="flex h-full items-center justify-center text-text-secondary text-sm">No data</div>
          )}
        </div>

      </div>
    </div>
  );
};
