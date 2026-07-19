import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks } from '../../api';
import { Link } from 'react-router-dom';
import { InfoTooltip } from '../../components/InfoTooltip';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

import { Skeleton } from '../../components/Skeleton';

export const PeerComparison = ({ data: currentStockData, isPanel = false }: { data: any, isPanel?: boolean }) => {
  const { data: allStocks, isLoading } = useQuery({
    queryKey: ['allStocks'],
    queryFn: fetchAllStocks,
  });

  if (isLoading) {
    return (
      <div className={`bg-surface rounded-xl border border-border overflow-hidden flex flex-col ${isPanel ? 'h-full' : 'p-6 gap-4'}`}>
        {!isPanel && (
          <div className="flex justify-between items-center mb-4">
            <div>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        )}
        <div className="h-[250px] w-full p-2 mb-4">
          <Skeleton className="w-full h-full" />
        </div>
        <div className="flex flex-col gap-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const currentIndustry = currentStockData?.relative?.meta_features?.industry_name || 'Unknown';
  
  // Filter for peers in the same industry, sort by market cap or alpha score
  let peers = (allStocks || []).filter((s: any) => s.industry === currentIndustry);
  
  // If no industry match (or Unknown), just show top market cap stocks as a fallback
  if (peers.length <= 1) {
     peers = [...(allStocks || [])].sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 10);
  }

  // Sort peers by market cap descending
  peers.sort((a: any, b: any) => (b.marketCap || 0) - (a.marketCap || 0));

  // Take top 15 peers maximum
  peers = peers.slice(0, 15);

  const getScoreColor = (val: number) => {
    if (val >= 80) return "text-emerald-400";
    if (val <= 30) return "text-red-400";
    return "text-text-secondary";
  };

  const getInstColor = (val: number) => {
    if (val > 0) return "text-emerald-400";
    if (val < 0) return "text-red-400";
    return "text-text-secondary";
  };

  const scatterData = peers
    .filter((p: any) => p.peRatio != null && p.roe != null)
    .map((p: any) => ({
      name: p.ticker,
      slug: p.slug,
      pe: p.peRatio,
      roe: p.roe,
      marketCap: p.marketCap || 1,
      isCurrent: p.slug === currentStockData?.absolute?.slug
    }));

  return (
    <div className={`bg-surface rounded-xl border border-border overflow-hidden flex flex-col ${isPanel ? 'h-full' : ''}`}>
      {!isPanel && (
        <div className="flex justify-between items-center p-5 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Peer Group Analysis</h2>
            <p className="text-[10px] text-text-secondary mt-1 uppercase tracking-wider font-bold">Comparing against {peers.length} peers in {currentIndustry}</p>
          </div>
        </div>
      )}
      {isPanel && (
        <div className="p-3 border-b border-border shrink-0">
           <h2 className="text-sm font-semibold text-text-primary">{currentIndustry} Peers</h2>
        </div>
      )}

      {scatterData.length > 0 && (
        <div className="h-[250px] w-full p-2 border-b border-border shrink-0 bg-surface-hover/30">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 15, right: 15, bottom: 15, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis type="number" dataKey="pe" name="P/E Ratio" stroke="#888" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <YAxis type="number" dataKey="roe" name="ROE" stroke="#888" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <ZAxis type="number" dataKey="marketCap" range={[50, 400]} name="Market Cap" />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3', stroke: '#ffffff30' }} 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-surface-hover border border-border p-2 rounded shadow-xl text-[10px]">
                        <p className="font-bold text-text-primary mb-1">{data.name}</p>
                        <p className="text-text-secondary">P/E: <span className="text-text-primary font-bold">{data.pe.toFixed(2)}</span></p>
                        <p className="text-text-secondary">ROE: <span className="text-text-primary font-bold">{data.roe.toFixed(2)}%</span></p>

                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter data={scatterData}>
                {scatterData.map((entry: any, index: number) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.roe >= 15 ? '#10b981' : entry.roe <= 5 ? '#ef4444' : '#64748b'} 
                    stroke={entry.isCurrent ? '#FFD700' : 'none'}
                    strokeWidth={entry.isCurrent ? 2 : 0}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className={`flex-1 overflow-auto custom-scrollbar ${isPanel ? 'text-xs' : ''}`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border text-xs text-text-secondary uppercase tracking-wider">
              <th className={`text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10 ${isPanel ? 'p-2' : 'p-4'}`}>Ticker</th>
              {!isPanel && <th className="p-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10">Name</th>}
              <th className={`text-[10px] font-bold text-right text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10 ${isPanel ? 'p-2' : 'p-4'}`}>Market Cap</th>

              <th className={`text-[10px] font-bold text-right text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10 ${isPanel ? 'p-2' : 'p-4'}`}>
                <span className="flex justify-end items-center gap-1">RS Rating <InfoTooltip text="Relative Strength (Momentum) 1-99" position="bottom" /></span>
              </th>
              {!isPanel && (
                <th className="p-4 text-[10px] font-bold text-right text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10">
                  <span className="flex justify-end items-center gap-1">Inst. Accum <InfoTooltip text="Institutional accumulation over last 3 months." position="bottom" /></span>
                </th>
              )}
              <th className="p-4 text-[10px] font-bold text-right text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover sticky top-0 z-10">P/E Ratio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {peers.map((peer: any) => {
              const isCurrent = peer.slug === currentStockData?.absolute?.slug;
              const rsRating = Math.round(peer.rs_rating || 0);
              const instAccum = peer.inst_accum || 0;
              
              return (
                <tr key={peer.slug} className={`hover:bg-white/5 transition-colors ${isCurrent ? 'bg-emerald-500/5 border-l-2 border-l-emerald-400' : ''}`}>
                  <td className={`border-b border-border ${isPanel ? 'p-2' : 'p-4'}`}>
                    <Link to={`/stocks/${peer.slug}`} className={`font-bold transition-colors ${isCurrent ? 'text-emerald-400 hover:text-emerald-300' : 'text-text-primary hover:text-emerald-400'}`}>
                      {peer.ticker}
                    </Link>
                  </td>
                  {!isPanel && (
                    <td className="p-4 text-text-secondary text-sm border-b border-border truncate max-w-[200px]">
                      {peer.name}
                    </td>
                  )}
                  <td className={`text-right text-text-secondary border-b border-border tabular-nums ${isPanel ? 'p-2' : 'p-4'}`}>
                    {peer.marketCap ? `₹${(peer.marketCap / 10000000).toFixed(0)}Cr` : 'N/A'}
                  </td>

                  <td className={`text-right font-bold border-b border-border tabular-nums ${getScoreColor(rsRating)} ${isPanel ? 'p-2' : 'p-4'}`}>
                    {rsRating.toFixed(0)}
                  </td>
                  {!isPanel && (
                    <td className={`p-4 text-right font-bold border-b border-border tabular-nums ${getInstColor(instAccum)}`}>
                      {instAccum > 0 ? '+' : ''}{instAccum.toFixed(2)}%
                    </td>
                  )}
                  <td className="p-4 text-right tabular-nums text-text-secondary border-b border-border">
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
