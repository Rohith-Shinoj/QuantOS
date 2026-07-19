import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, TrendingUp, Printer, RefreshCw } from 'lucide-react';
import { StockLogo } from '../../components/StockLogo';
import { fetchLiveQuote } from '../../api';
import type { LiveQuote } from '../../api';

export const TopStrip = ({ data }: { data: any }) => {
  const abs = data.absolute || {};
  const rel = data.relative || {};
  const meta = data.relative?.meta_features || {};
  
  const riskSignals = rel.risk_and_forensic_signals || {};
  const circuitRisk = riskSignals.circuit_risk_index || 0;
  const qesFlag = rel.qes_forensic_red_flag === 1;
  const targetLabels = rel.target_labels || {};
  const forward1y = targetLabels.forward_1y_25pct;

  const [liveData, setLiveData] = useState<LiveQuote | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("As of 9:00 AM");

  const isDelisted = abs['live price'] === '₹0.00' || abs['live price'] === '0.00';

  const handleRefresh = async () => {
    if (isDelisted) return;
    setIsRefreshing(true);
    try {
      const quote = await fetchLiveQuote(data.slug);
      setLiveData(quote);
      
      const now = new Date();
      setLastUpdated(`As of ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      console.error("Failed to fetch live quote");
    } finally {
      setIsRefreshing(false);
    }
  };

  React.useEffect(() => {
    handleRefresh();
  }, [data.slug]);

  const isZero = liveData && liveData.dayChange === 0 && liveData.dayChangePerc === 0;
  const currentPrice = isDelisted ? '0.00' : (liveData ? liveData.currentPrice : abs['live price']);
  const dayChange = isDelisted ? '0.00 (0.00%)' : ((liveData && !isZero) ? `${liveData.dayChange > 0 ? '+' : ''}${liveData.dayChange} (${liveData.dayChangePerc?.toFixed(2)}%)` : abs['day change']);
  const isPositive = dayChange?.toString().includes('+') || (!dayChange?.toString().includes('-') && parseFloat(dayChange) > 0);

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 print-header">
      <div className="flex items-center gap-4">
        <StockLogo ticker={abs.ticker || ''} className="w-14 h-14 rounded bg-white object-contain p-1 shadow-md" textClass="text-sm" fallbackClass="w-14 h-14 rounded bg-surface border border-border text-text-primary flex items-center justify-center font-bold text-lg shadow-md" />
        <div className="flex flex-col justify-center gap-0.5">
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-extrabold text-text-primary tracking-tight leading-none truncate max-w-[400px]">{abs.ticker || 'N/A'}</h3>
            <span className="px-2 py-0.5 mt-0.5 rounded bg-surface-hover border border-border text-[10px] text-text-secondary font-semibold uppercase tracking-wider">
              {meta.industry_name || 'Industry'}
            </span>
            {isDelisted && (
              <span className="px-2 py-0.5 mt-0.5 rounded bg-red-500/20 text-red-500 text-[10px] font-bold flex items-center gap-1 border border-red-500/30">
                <AlertTriangle size={12} /> DELISTED
              </span>
            )}
            {qesFlag && !isDelisted ? (
              <span className="px-2 py-0.5 mt-0.5 bg-red-500/20 text-red-500 text-[10px] font-bold rounded flex items-center gap-1 border border-red-500/30">
                <ShieldAlert size={12} /> HIGH RISK
              </span>
            ) : !isDelisted ? (
              <span className="px-2 py-0.5 mt-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded flex items-center gap-1 border border-emerald-500/30">
                <ShieldCheck size={12} /> CLEARED
              </span>
            ) : null}
          </div>
          
          <div className="flex items-center gap-2 mt-1">
             <span className="text-lg font-bold text-text-primary leading-none">₹{currentPrice}</span>
             <span className={`text-sm font-semibold leading-none ${!isPositive ? 'text-red-400' : 'text-emerald-400'}`}>
                {dayChange} <span className="text-[10px] font-bold text-text-secondary ml-0.5">1D</span>
             </span>
             <button 
                onClick={handleRefresh}
                disabled={isRefreshing || isDelisted}
                className="ml-2 flex items-center gap-1.5 px-2 py-1 bg-surface-hover hover:bg-white/5 border border-border rounded text-[10px] font-semibold text-text-primary transition-all disabled:opacity-50"
             >
                <RefreshCw size={10} className={isRefreshing ? "animate-spin" : ""} />
                Sync
             </button>
             <span className="ml-2 text-[10px] font-medium text-text-secondary tracking-wide uppercase">
                {lastUpdated}
             </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] font-bold">
        <button 
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover hover:bg-white/5 border border-border rounded text-[10px] font-semibold text-text-primary transition-colors print:hidden"
        >
          <Printer size={12} />
          Print
        </button>

        {forward1y === 1 && (
           <div className="flex items-center gap-1.5 px-3 py-1.5 bg-alpha/10 text-alpha border border-alpha/20 rounded">
             <TrendingUp size={12} />
             <span>1Y Bull Target Active</span>
           </div>
        )}
        
        {qesFlag && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/10 text-warning border border-warning/20 rounded" title="Negative operating cash flow paired with high profit growth.">
            <AlertTriangle size={12} />
            <span>QES Forensic Flag</span>
          </div>
        )}

        {circuitRisk > 1000 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-beta/10 text-beta border border-beta/20 rounded" title="High volume + High delivery + Low volatility = Illiquidity Trap Risk">
            <ShieldAlert size={12} />
            <span>High Circuit Risk ({Math.round(circuitRisk)})</span>
          </div>
        )}
      </div>
    </div>
  );
};
