import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks } from '../../api';
import { Link } from 'react-router-dom';
import { InfoTooltip } from '../../components/InfoTooltip';

export const PeerComparison = ({ data: currentStockData, isPanel = false }: { data: any, isPanel?: boolean }) => {
  const { data: allStocks, isLoading } = useQuery({
    queryKey: ['allStocks'],
    queryFn: fetchAllStocks,
  });

  if (isLoading) {
    return <div className="p-8 animate-pulse text-text-secondary">Loading peer data...</div>;
  }

  const currentIndustry = currentStockData?.relative?.meta_features?.industry_name || 'Unknown';
  
  // Filter for peers in the same industry, sort by market cap or alpha score
  let peers = (allStocks || []).filter((s: any) => s.industry === currentIndustry);
  
  // If no industry match (or Unknown), just show top market cap stocks as a fallback
  if (peers.length <= 1) {
     peers = [...(allStocks || [])].sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 10);
  }

  // Sort peers by alpha score descending
  peers.sort((a: any, b: any) => (b.alpha_score || 0) - (a.alpha_score || 0));

  // Take top 15 peers maximum
  peers = peers.slice(0, 15);

  const getScoreColor = (val: number) => {
    if (val >= 80) return "text-[#42bd7f]";
    if (val <= 30) return "text-[#f23645]";
    return "text-text-secondary";
  };

  const getInstColor = (val: number) => {
    if (val > 0) return "text-[#42bd7f]";
    if (val < 0) return "text-[#f23645]";
    return "text-text-secondary";
  };

  return (
    <div className={`bg-surface rounded-lg border border-border overflow-hidden flex flex-col ${isPanel ? 'h-full' : ''}`}>
      {!isPanel && (
        <div className="flex justify-between items-center p-6 border-b border-border bg-surface-hover/30 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Peer Group Analysis</h2>
            <p className="text-sm text-text-secondary mt-1">Comparing against {peers.length} peers in {currentIndustry}</p>
          </div>
        </div>
      )}
      {isPanel && (
        <div className="p-3 border-b border-border bg-surface-hover/30 shrink-0">
           <h2 className="text-sm font-bold text-text-primary">{currentIndustry} Peers</h2>
        </div>
      )}

      <div className={`flex-1 overflow-auto ${isPanel ? 'text-xs' : ''}`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/50 text-xs text-text-secondary uppercase tracking-wider">
              <th className={`font-bold text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10 ${isPanel ? 'p-2' : 'p-4'}`}>Ticker</th>
              {!isPanel && <th className="p-4 font-bold text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10">Name</th>}
              <th className={`font-bold text-right text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10 ${isPanel ? 'p-2' : 'p-4'}`}>Market Cap</th>
              <th className={`font-bold text-right text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10 ${isPanel ? 'p-2' : 'p-4'}`}>
                <span className="flex justify-end items-center gap-1">AI Score <InfoTooltip text="Proprietary ML probability score indicating market outperformance." position="bottom" /></span>
              </th>
              <th className={`font-bold text-right text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10 ${isPanel ? 'p-2' : 'p-4'}`}>
                <span className="flex justify-end items-center gap-1">RS Rating <InfoTooltip text="Relative Strength (Momentum) 1-99" position="bottom" /></span>
              </th>
              {!isPanel && (
                <th className="p-4 font-bold text-right text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10">
                  <span className="flex justify-end items-center gap-1">Inst. Accum <InfoTooltip text="Institutional accumulation over last 3 months." position="bottom" /></span>
                </th>
              )}
              <th className="p-4 font-bold text-right text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10">P/E Ratio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {peers.map((peer: any) => {
              const isCurrent = peer.slug === currentStockData?.absolute?.slug;
              const alphaScore = Math.round((peer.alpha_score || 0) * 100);
              const rsRating = Math.round(peer.rs_rating || 0);
              const instAccum = peer.inst_accum || 0;
              
              return (
                <tr key={peer.slug} className={`hover:bg-surface-hover/50 transition-colors ${isCurrent ? 'bg-alpha/5 border-l-2 border-l-alpha' : ''}`}>
                  <td className={`border-b border-border/30 ${isPanel ? 'p-2' : 'p-4'}`}>
                    <Link to={`/stock/${peer.slug}`} className={`font-bold hover:text-alpha transition-colors ${isCurrent ? 'text-alpha' : 'text-text-primary'}`}>
                      {peer.ticker}
                    </Link>
                  </td>
                  {!isPanel && (
                    <td className="p-4 text-text-secondary text-sm border-b border-border/30 truncate max-w-[200px]">
                      {peer.name}
                    </td>
                  )}
                  <td className={`text-right text-text-secondary border-b border-border/30 tabular-nums ${isPanel ? 'p-2' : 'p-4'}`}>
                    {peer.marketCap ? `₹${(peer.marketCap / 10000000).toFixed(0)}Cr` : 'N/A'}
                  </td>
                  <td className={`text-right font-bold border-b border-border/30 tabular-nums ${getScoreColor(alphaScore)} ${isPanel ? 'p-2' : 'p-4'}`}>
                    {alphaScore.toFixed(0)}
                  </td>
                  <td className={`text-right font-bold border-b border-border/30 tabular-nums ${getScoreColor(rsRating)} ${isPanel ? 'p-2' : 'p-4'}`}>
                    {rsRating.toFixed(0)}
                  </td>
                  {!isPanel && (
                    <td className={`p-4 text-right font-bold border-b border-border/30 tabular-nums ${getInstColor(instAccum)}`}>
                      {instAccum > 0 ? '+' : ''}{instAccum.toFixed(2)}%
                    </td>
                  )}
                  <td className="p-4 text-right tabular-nums text-text-secondary border-b border-border/30">
                    {peer.peRatio ? peer.peRatio.toFixed(2) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
