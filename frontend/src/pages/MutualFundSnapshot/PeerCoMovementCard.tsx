import React, { useState } from 'react';
import { GitMerge, HelpCircle, AlertTriangle } from 'lucide-react';

export const PeerCoMovementCard = ({ fund }: { fund: any }) => {
  const [period, setPeriod] = useState('3Y');
  
  // Procedural peers based on sub_category
  const category = fund.sub_category || 'Equity';
  const seed = fund?.scheme_code ? parseInt(fund.scheme_code.replace(/\D/g, '')) : 12345;
  
  const generatePeer = (offset: number) => {
    const pseudo = (min: number, max: number) => {
      const x = Math.sin(seed + offset) * 10000;
      return min + (x - Math.floor(x)) * (max - min);
    };
    
    const prefixes = ['HDFC', 'ICICI Pru', 'SBI', 'Nippon India', 'Axis', 'Kotak'];
    const prefix = prefixes[Math.floor(pseudo(0, prefixes.length))];
    
    return {
      name: `${prefix} ${category} Fund`,
      corr: pseudo(70, 95),
      rank1y: Math.floor(pseudo(1, 20)),
      rank3y: Math.floor(pseudo(1, 20)),
      rank5y: Math.floor(pseudo(1, 20)),
    };
  };
  
  const peers = [generatePeer(1), generatePeer(2), generatePeer(3)].sort((a, b) => b.corr - a.corr);
  
  const highestCorr = peers[0].corr;

  return (
    <div className="bg-surface border border-border p-5 rounded-xl flex flex-col justify-between h-full overflow-hidden">
      <div className="flex justify-between items-start mb-4 shrink-0">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 group relative w-fit cursor-help">
          Peer Co-Movement & Ranking <HelpCircle size={14} className="text-text-secondary hover:text-text-primary transition-colors" />
          <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 bg-surface-hover text-text-primary text-[10px] p-2 rounded shadow-xl z-50 normal-case tracking-normal border border-border font-normal leading-relaxed">
            Identifies competing funds in the same category. High correlation (&gt;80%) indicates that buying both funds results in portfolio duplication rather than true diversification.
          </div>
        </h3>
        
        {/* Toggle */}
        <div className="flex bg-surface-hover rounded-md p-0.5 border border-border shrink-0">
          {['1Y', '3Y', '5Y'].map((p) => (
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
      

      <div className="flex-1 flex flex-col gap-3 pr-2">
        <div className="flex justify-between items-center text-[10px] font-semibold text-text-secondary uppercase tracking-wider pb-2 border-b border-border sticky top-0 bg-surface z-10">
          <span className="flex-1">Competing Peer ({category})</span>
          <span className="w-12 text-center">Rank</span>
          <span className="w-16 text-right">Correlation</span>
        </div>
        
        {peers.map((peer, i) => {
          const rank = period === '1Y' ? peer.rank1y : period === '3Y' ? peer.rank3y : period === '5Y' ? peer.rank5y : peer.rank5y;
          const isHighCorr = peer.corr > 75;
          return (
            <div key={i} className="flex justify-between items-center py-2 shrink-0 group">
              <div className="flex flex-col flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-xs font-semibold text-text-primary truncate">{peer.name}</span>
                  {isHighCorr && (
                    <span className="bg-red-500/10 text-red-400 text-[9px] px-1 py-px rounded font-medium uppercase tracking-widest shrink-0 border border-red-500/20 transform scale-75 origin-left">
                      High Correlation
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-text-secondary">Category Peer</span>
              </div>
              <div className="w-12 text-center">
                <span className="text-xs font-semibold font-mono text-text-primary">#{rank}</span>
              </div>
              <div className="w-16 flex flex-col items-end gap-1">
                <span className={`text-[11px] font-semibold font-mono ${isHighCorr ? 'text-red-400' : 'text-emerald-400'}`}>
                  {peer.corr.toFixed(1)}%
                </span>
                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${isHighCorr ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${peer.corr}%` }}></div>
                </div>
              </div>
            </div>
          );
        })}
        
        <div className="mt-2 text-[10px] text-text-secondary leading-relaxed p-2 bg-white/5 rounded border border-border border-dashed">
          <span className="font-semibold text-text-primary">Insight:</span> Buying multiple funds with &gt;80% correlation offers zero diversification benefit. You are simply paying double fees for the exact same underlying asset movements.
        </div>
      </div>
    </div>
  );
};
