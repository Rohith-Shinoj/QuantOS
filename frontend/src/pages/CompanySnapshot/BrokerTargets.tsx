import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchBrokerTargets } from '../../api';
import { Target, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface BrokerTargetsProps {
  slug: string;
}

interface TargetData {
  date: string;
  broker: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  target_price: number;
}

export const BrokerTargets: React.FC<BrokerTargetsProps> = ({ slug }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['brokerTargets', slug],
    queryFn: () => fetchBrokerTargets(slug),
    staleTime: 4 * 60 * 60 * 1000, // 4 hours
    refetchOnWindowFocus: false
  });

  if (isLoading) {
    return (
      <div className="lg:col-span-3 h-[180px] bg-surface border border-border rounded-xl p-5 flex items-center justify-center">
        <div className="animate-pulse flex items-center gap-2 text-text-secondary">
          <Target size={16} className="animate-spin" />
          <span className="text-sm font-semibold tracking-wider">FETCHING INSTITUTIONAL TARGETS...</span>
        </div>
      </div>
    );
  }

  if (error || !data || !data.targets || data.targets.length === 0) {
    return (
      <div className="lg:col-span-3 h-[180px] bg-surface border border-border rounded-xl p-5 flex flex-col items-center justify-center">
        <Target size={24} className="text-text-secondary mb-2 opacity-50" />
        <span className="text-sm font-semibold text-text-secondary tracking-wider">NO INSTITUTIONAL COVERAGE FOUND</span>
      </div>
    );
  }

  const targets: TargetData[] = data.targets;
  
  // Dynamic height based on rows
  const rowCount = Math.ceil(targets.length / 3);
  // Base height per row + padding + header
  const containerHeight = rowCount === 1 ? '180px' : rowCount === 2 ? '280px' : '400px';

  return (
    <div className="lg:col-span-3 bg-surface border border-border rounded-xl p-5 flex flex-col relative overflow-hidden" style={{ minHeight: containerHeight }}>
      <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-1.5 uppercase tracking-wider shrink-0">
        <Target size={14} className="text-blue-400" />
        Institutional Targets
      </h3>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {targets.map((target, idx) => {
            const isBuy = target.action === 'BUY';
            const isSell = target.action === 'SELL';
            
            return (
              <div key={idx} className="bg-canvas border border-border/50 rounded-lg p-4 flex flex-col justify-between hover:border-border transition-colors group">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-text-primary text-sm truncate max-w-[150px]" title={target.broker}>
                      {target.broker}
                    </h4>
                    <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mt-0.5">
                      {target.date}
                    </p>
                  </div>
                  
                  <span className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 uppercase tracking-wider
                    ${isBuy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                      isSell ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                      'bg-gray-500/10 text-gray-400 border border-gray-500/20'}
                  `}>
                    {isBuy ? <TrendingUp size={10} /> : isSell ? <TrendingDown size={10} /> : <Minus size={10} />}
                    {target.action}
                  </span>
                </div>
                
                <div className="flex items-end justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-text-secondary font-semibold uppercase tracking-wider mb-0.5">Target</span>
                    <span className="text-lg font-black tracking-tight text-white group-hover:text-blue-400 transition-colors">
                      ₹{target.target_price.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
