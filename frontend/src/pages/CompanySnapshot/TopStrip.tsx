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
    <div className="bg-surface p-6 rounded-lg border border-border flex justify-between items-center print-header">
      <div>
        <div className="flex items-center gap-3">
          <StockLogo ticker={abs.ticker || ''} className="w-10 h-10 shadow-md" textClass="text-sm" fallbackClass="bg-canvas border border-border text-text-primary" />
          <h1 className="text-3xl font-bold text-text-primary">{abs.ticker || 'N/A'}</h1>
          {isDelisted && (
            <span className="px-2 py-1 bg-red-500/20 text-red-500 text-xs font-bold rounded flex items-center gap-1 border border-red-500/30">
              <AlertTriangle size={14} /> Currently Delisted
            </span>
          )}
          {qesFlag && !isDelisted ? (
            <span className="px-2 py-1 bg-beta/20 text-beta text-xs font-bold rounded flex items-center gap-1">
              <ShieldAlert size={14} /> High Risk
            </span>
          ) : !isDelisted ? (
            <span className="px-2 py-1 bg-alpha/20 text-alpha text-xs font-bold rounded flex items-center gap-1">
              <ShieldCheck size={14} /> Cleared
            </span>
          ) : null}
        </div>
        <p className="text-text-secondary mt-1 text-sm font-medium">
          {abs.displayName || 'Unknown Company'} • {meta.industry_name || 'Industry'} • {abs.cappedType || meta.cap_type || 'Cap Size'}
        </p>
        
        {currentPrice && (
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-text-primary">₹{currentPrice}</span>
              <span className={`text-sm font-semibold ${!isPositive ? 'text-beta' : 'text-alpha'}`}>
                {dayChange}
              </span>
            </div>
            <div className="h-4 w-px bg-border mx-1"></div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-text-secondary tracking-wide uppercase">
                {lastUpdated}
              </span>
              <button 
                onClick={handleRefresh}
                disabled={isRefreshing || isDelisted}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-hover hover:bg-border border border-border rounded text-xs font-semibold text-text-primary transition-all disabled:opacity-50"
              >
                <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-8">
        <button 
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-canvas hover:bg-surface-hover border border-border rounded-lg text-sm font-medium transition-colors print:hidden"
        >
          <Printer size={16} />
          Print Tear Sheet
        </button>

        {forward1y === 1 && (
           <div className="flex items-center gap-2 px-3 py-1 bg-alpha/10 text-alpha border border-alpha/20 rounded">
             <TrendingUp size={16} />
             <span className="text-sm font-semibold">1Y Bull Target Active</span>
           </div>
        )}
        
        {qesFlag && (
          <div className="flex items-center gap-2 px-3 py-1 bg-warning/10 text-warning border border-warning/20 rounded" title="Negative operating cash flow paired with high profit growth.">
            <AlertTriangle size={16} />
            <span className="text-sm font-semibold">QES Forensic Flag</span>
          </div>
        )}

        {circuitRisk > 1000 && (
          <div className="flex items-center gap-2 px-3 py-1 bg-beta/10 text-beta border border-beta/20 rounded" title="High volume + High delivery + Low volatility = Illiquidity Trap Risk">
            <ShieldAlert size={16} />
            <span className="text-sm font-semibold">High Circuit Risk ({Math.round(circuitRisk)})</span>
          </div>
        )}
      </div>
    </div>
  );
};
