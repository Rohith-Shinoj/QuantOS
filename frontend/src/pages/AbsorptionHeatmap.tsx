import React from 'react';
import { Link } from 'react-router-dom';
import { MousePointer2, Zap } from 'lucide-react';

export const AbsorptionHeatmap = ({ data }: { data: any[] }) => {
  return (
    <div className="bg-surface p-6 rounded-lg border border-border flex flex-col h-full">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-lg font-medium text-text-primary flex items-center gap-2">
            <Zap size={18} className="text-alpha" />
            Smart Money Absorption
          </h3>
          <p className="text-sm text-text-secondary mt-1">Stocks where MFs/FIIs are buying while retail sells.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 flex-1">
        {data?.map((stock) => {
          const intensity = Math.min(stock.inst_accum * 10, 1);
          return (
            <Link 
              key={stock.slug} 
              to={`/stock/${stock.slug}`}
              className="group relative p-4 rounded border border-border bg-canvas hover:border-alpha transition-all"
            >
              <div className="flex justify-between items-start">
                <span className="font-bold text-text-primary group-hover:text-alpha">{stock.ticker}</span>
                <span className="text-[10px] bg-alpha/10 text-alpha px-1.5 py-0.5 rounded font-bold">
                  {stock.inst_accum.toFixed(2)}%
                </span>
              </div>
              <div className="mt-2 flex items-end justify-between">
                 <div>
                    <p className="text-[10px] text-text-secondary uppercase font-bold tracking-tighter">HNI Absorp.</p>
                    <p className="text-sm font-medium text-text-primary">{stock.retail_liq.toFixed(2)}</p>
                 </div>
                 <MousePointer2 size={14} className="text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {/* Heat intensity line */}
              <div className="absolute bottom-0 left-0 h-0.5 bg-alpha" style={{ width: `${Math.min(stock.inst_accum * 10, 100)}%` }} />
            </Link>
          );
        })}
      </div>
      
      <div className="mt-6 p-3 bg-surface-hover rounded text-[11px] text-text-secondary border border-border/50">
        <span className="text-alpha font-bold">ALPHA SIGNAL:</span> High Retail Liquidation Ratio ({'>'}1.0) paired with positive Institutional Accumulation often precedes significant price appreciation as the 'weak hands' exit.
      </div>
    </div>
  );
};
