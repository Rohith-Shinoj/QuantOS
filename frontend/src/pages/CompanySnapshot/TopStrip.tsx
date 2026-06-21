import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, TrendingUp, TrendingDown, Printer } from 'lucide-react';

export const TopStrip = ({ data }: { data: any }) => {
  const abs = data.absolute || {};
  const rel = data.relative || {};
  const meta = data.relative?.meta_features || {};
  
  const riskSignals = rel.risk_and_forensic_signals || {};
  const circuitRisk = riskSignals.circuit_risk_index || 0;
  const qesFlag = rel.qes_forensic_red_flag === 1;
  const targetLabels = rel.target_labels || {};
  const forward1y = targetLabels.forward_1y_25pct;

  return (
    <div className="bg-surface p-6 rounded-lg border border-border flex justify-between items-center print-header">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-text-primary">{abs.ticker || 'N/A'}</h1>
          {qesFlag ? (
            <span className="px-2 py-1 bg-beta/20 text-beta text-xs font-bold rounded flex items-center gap-1">
              <ShieldAlert size={14} /> High Risk
            </span>
          ) : (
            <span className="px-2 py-1 bg-alpha/20 text-alpha text-xs font-bold rounded flex items-center gap-1">
              <ShieldCheck size={14} /> Cleared
            </span>
          )}
        </div>
        <p className="text-text-secondary mt-1 text-sm font-medium">
          {abs.displayName || 'Unknown Company'} • {meta.industry_name || 'Industry'} • {abs.cappedType || meta.cap_type || 'Cap Size'}
        </p>
        {(abs['live price'] || abs['day change']) && (
          <div className="flex items-center gap-3 mt-2">
            <span className="text-2xl font-bold text-text-primary">{abs['live price']}</span>
            <span className={`text-sm font-semibold ${abs['day change']?.startsWith('-') ? 'text-beta' : 'text-alpha'}`}>
              {abs['day change']}
            </span>
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
