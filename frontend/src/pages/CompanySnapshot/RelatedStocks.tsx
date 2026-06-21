import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRelatedStocks } from '../../api';
import { Link } from 'react-router-dom';
import { Link2 } from 'lucide-react';

export const RelatedStocks = ({ slug }: { slug: string }) => {
  const { data: related, isLoading } = useQuery({
    queryKey: ['related', slug],
    queryFn: () => fetchRelatedStocks(slug),
    enabled: !!slug,
  });

  return (
    <div className="bg-surface p-6 rounded-lg border border-border h-full flex flex-col">
      <h3 className="text-lg font-medium text-text-primary mb-2 flex items-center gap-2">
        <Link2 size={18} className="text-alpha" />
        Co-Movement Discovery
      </h3>
      <p className="text-sm text-text-secondary mb-6">Top 5 correlated peers in the same industry (52W)</p>

      {isLoading ? (
        <div className="space-y-4 animate-pulse">
           {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-canvas rounded"></div>)}
        </div>
      ) : (
        <div className="space-y-2 flex-1">
          {related?.map((stock: any) => (
            <Link 
              key={stock.slug} 
              to={`/stock/${stock.slug}`}
              className="flex justify-between items-center p-3 rounded bg-canvas hover:bg-surface-hover border border-border/50 transition-all group"
            >
              <span className="font-bold text-text-primary group-hover:text-alpha">{stock.ticker}</span>
              <div className="flex items-center gap-2">
                 <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-alpha" style={{ width: `${stock.correlation * 100}%` }} />
                 </div>
                 <span className="text-xs font-medium text-text-secondary tabular-nums">
                    {(stock.correlation * 100).toFixed(1)}%
                 </span>
              </div>
            </Link>
          ))}
          {related?.length === 0 && <p className="text-sm text-text-secondary italic">No highly correlated peers found.</p>}
        </div>
      )}
      
      <div className="mt-6 p-3 bg-surface-hover rounded text-[11px] text-text-secondary border border-border/50">
        <span className="text-alpha font-bold">INSIGHT:</span> Trading highly correlated pairs allows for hedging sector-wide crashes. If one stock lags its peer, it may present a 'catch-up' trade opportunity.
      </div>
    </div>
  );
};
