import React from 'react';
import { Eye, Shield, Wallet, BrainCircuit, AlertTriangle, TrendingUp, TrendingDown, Activity, List, Waves, Globe, Zap, Crosshair, PieChart as PieChartIcon } from 'lucide-react';

export const MatrixCards = ({ mode, data, concentrationData = [], defenseMetrics = {}, yieldValuation = {} }: { mode: string, data: any, concentrationData?: any[], defenseMetrics?: any, yieldValuation?: any }) => {
  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary/50 text-xs col-span-3">
         <div className="animate-pulse">Loading Matrix Compute Engine...</div>
      </div>
    );
  }

  const renderCard = (title: string, icon: React.ReactNode, content: React.ReactNode) => (
    <div className="flex-1 bg-canvas rounded-lg border border-border p-3 flex flex-col overflow-hidden relative group">
      <div className="flex items-center justify-between mb-1.5 shrink-0">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">{title}</span>
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center">
        {content}
      </div>
    </div>
  );

  if (mode === 'growth') {
    const { earnings_quality } = data.growth_view || {};
    return (
      <div className="flex flex-col w-full h-full gap-2">
        <div className="flex flex-1 gap-3 min-h-0 w-full">
          {renderCard("Earnings Quality", <TrendingUp size={12} className="text-purple-400" />, (
            <div className="flex gap-1.5 h-full">
              <div className="flex-1 bg-surface/30 rounded flex flex-col justify-center p-2 border border-border/50 relative">
                 <span className="absolute top-1.5 right-1.5 text-[8px] bg-purple-500/10 text-purple-400 px-1 rounded">1Y</span>
                 <span className="text-[9px] text-text-secondary uppercase font-bold tracking-widest block mb-0.5">Fund. Growth</span>
                 <span className="text-lg font-bold font-mono text-purple-400">+{earnings_quality?.profit_growth || 0}%</span>
              </div>
              <div className="flex-1 bg-surface/30 rounded flex flex-col justify-center p-2 border border-border/50 relative">
                 <span className="absolute top-1.5 right-1.5 text-[8px] bg-purple-500/10 text-purple-400 px-1 rounded">Mult</span>
                 <span className="text-[9px] text-text-secondary uppercase font-bold tracking-widest block mb-0.5">P/E Expansion</span>
                 <span className="text-lg font-bold font-mono text-purple-400">{earnings_quality?.pe_expansion > 0 ? '+' : ''}{earnings_quality?.pe_expansion || 0}%</span>
              </div>
            </div>
          ))}
          {renderCard("Return Attribution", <PieChartIcon size={12} className="text-purple-400" />, (
             <div className="flex-1 flex flex-col justify-center">
               <div className="flex justify-between items-center text-[10px] font-bold mb-1">
                 <span className="text-text-primary">Earnings: {earnings_quality?.profit_contrib || 0}%</span>
                 <span className="text-text-secondary">Hype: {earnings_quality?.pe_contrib || 0}%</span>
               </div>
               <div className="h-1.5 w-full bg-border rounded-full overflow-hidden flex">
                  <div className="bg-purple-500 h-full" style={{ width: `${earnings_quality?.profit_contrib || 0}%` }}></div>
                  <div className="bg-purple-500/20 h-full" style={{ width: `${earnings_quality?.pe_contrib || 0}%` }}></div>
               </div>
             </div>
          ))}
          {renderCard("Yield & Valuation", <Wallet size={12} className="text-emerald-400" />, (
            <div className="flex flex-col justify-center h-full bg-surface/30 rounded p-2 border border-border/50 relative">
              <span className="absolute top-1.5 right-1.5 text-[8px] bg-amber-500/10 text-amber-400 px-1 rounded">vs Market</span>
              <span className="text-[9px] text-text-secondary uppercase font-bold tracking-widest block mb-0.5">Aggregate P/E</span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono text-white">{yieldValuation?.aggPE || 'N/A'}x</span>
                <span className={`text-[10px] font-bold ${yieldValuation?.pePremium > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {yieldValuation?.pePremium > 0 ? '+' : ''}{yieldValuation?.pePremium || 0}%
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-canvas border border-border rounded-lg p-2 flex items-center gap-2 shrink-0">
           <Zap size={14} className="text-amber-400" />
           <p className="text-[10px] text-text-secondary leading-tight">
             {(earnings_quality?.pe_contrib || 0) > 80 ? 'The assets you own have run up heavily over the last year in the broader market, driven entirely by hype, not profit growth. Action: You are buying at peak valuations. Consider trimming speculative holdings before multiples contract.' : (earnings_quality?.pe_contrib || 0) > 50 ? "Your portfolio's trailing performance is driven more by multiple expansion than actual earnings growth. Monitor valuations closely." : 'Your portfolio is fundamentally sound. Trailing performance is strongly backed by actual corporate earnings growth rather than speculative hype.'}
           </p>
        </div>
      </div>
    );
  }

  if (mode === 'allocation') {
    const { regime_alignment, factor_exposure } = data.allocation_view || {};
    return (
      <div className="flex flex-col w-full h-full gap-2">
        <div className="flex flex-1 gap-3 min-h-0 w-full">
          {renderCard("Regime Alignment", <Globe size={12} className="text-indigo-400" />, (
            <>
              <div className="p-2 bg-surface/50 rounded border border-border">
                <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">VIX Trajectory</span>
                <span className="text-lg font-bold font-mono text-indigo-400">{regime_alignment?.vix_trajectory || 'N/A'}</span>
              </div>
              <div className="p-2 bg-surface/50 rounded border border-border">
                 <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Large Cap Allocation</span>
                 <span className="text-base font-bold font-mono text-white">{regime_alignment?.large_cap_weight || 0}%</span>
              </div>
              <div className="mt-auto text-[9px] font-bold text-amber-400 bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                 {regime_alignment?.alignment || 'Unknown'}
              </div>
            </>
          ))}
          {renderCard("Factor Exposure", <Activity size={12} className="text-indigo-400" />, (
            <div className="flex gap-1.5 h-full">
              <div className="flex-1 bg-surface/30 rounded p-1.5 border border-border/50 flex flex-col justify-center relative">
                <span className="absolute top-1 right-1 text-[7px] bg-indigo-500/10 text-indigo-400 px-1 rounded uppercase">vs Nifty 50</span>
                <div className="text-[8px] text-text-secondary font-bold tracking-widest mb-0.5">VALUE (P/E)</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-white font-bold text-sm">{factor_exposure?.value_score || 0}x</span>
                  <span className="text-[8px] text-indigo-400">Z: {factor_exposure?.value_z > 0 ? '+' : ''}{factor_exposure?.value_z || 0}</span>
                </div>
              </div>
              <div className="flex-1 bg-surface/30 rounded p-1.5 border border-border/50 flex flex-col justify-center relative">
                <span className="absolute top-1 right-1 text-[7px] bg-purple-500/10 text-purple-400 px-1 rounded uppercase">YoY</span>
                <div className="text-[8px] text-text-secondary font-bold tracking-widest mb-0.5">GROWTH</div>
                <span className="font-mono text-purple-400 font-bold text-sm">+{factor_exposure?.growth_score || 0}%</span>
              </div>
              <div className="flex-1 bg-surface/30 rounded p-1.5 border border-border/50 flex flex-col justify-center relative">
                <span className="absolute top-1 right-1 text-[7px] bg-cyan-500/10 text-cyan-400 px-1 rounded uppercase">IBD RS</span>
                <div className="text-[8px] text-text-secondary font-bold tracking-widest mb-0.5">MOMENTUM</div>
                {factor_exposure?.momentum_score === "ERR_DATA_MISSING" ? (
                  <div className="flex flex-col">
                    <span className="font-mono text-text-secondary font-bold text-[10px] bg-surface py-0.5 px-1 rounded w-fit">N/A</span>
                  </div>
                ) : (
                  <span className="font-mono text-cyan-400 font-bold text-sm">{factor_exposure?.momentum_score || 0}</span>
                )}
              </div>
            </div>
          ))}
          {renderCard("True Concentration", <Eye size={12} className="text-indigo-400" />, (
             <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto hide-scrollbar">
               {concentrationData.length === 0 ? (
                 <div className="flex h-full items-center justify-center text-[10px] text-text-secondary">Add holdings to analyze</div>
               ) : (
                 concentrationData.map((item, i) => (
                   <div key={i} className={`flex flex-col gap-0.5 p-1.5 rounded ${item.hasOverlap ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-surface/50'}`}>
                     <div className="flex justify-between items-center">
                       <span className="text-[10px] font-bold text-text-primary truncate pr-2">{item.ticker || item.name}</span>
                       <span className={`text-[10px] font-bold font-mono ${item.hasOverlap ? 'text-amber-400' : 'text-text-primary'}`}>{item.totalPct}%</span>
                     </div>
                     <div className="flex gap-2">
                       {item.directPct > 0 && <span className="text-[8px] text-[#8b5cf6]">Direct: {item.directPct}%</span>}
                       {item.mfPct > 0 && <span className="text-[8px] text-[#06b6d4]">via Funds: {item.mfPct}%</span>}
                     </div>
                     <div className="h-0.5 w-full bg-border/50 rounded-full overflow-hidden mt-0.5 flex">
                       <div className="bg-[#8b5cf6]" style={{ width: `${Math.min(item.directPct * 3, 100)}%` }}></div>
                       <div className="bg-[#06b6d4]" style={{ width: `${Math.min(item.mfPct * 3, 100)}%` }}></div>
                     </div>
                     {item.hasOverlap && item.mfSources && (
                       <div className="flex flex-col gap-1 mt-1">
                         <span className="text-[8px] text-amber-400/80 flex items-center gap-0.5"><AlertTriangle size={8} /> Overlap detected</span>
                         <div className="flex flex-col gap-0.5 ml-2">
                           {item.mfSources.map((src: any, idx: number) => (
                             <span key={idx} className="text-[7px] text-text-secondary truncate">
                               • {src.name} (<span className="text-[#06b6d4]">{src.pct}%</span>)
                             </span>
                           ))}
                         </div>
                       </div>
                     )}
                   </div>
                 ))
               )}
             </div>
          ))}
        </div>
        <div className="bg-canvas border border-border rounded-lg p-2 flex items-center gap-2 shrink-0">
           <Zap size={14} className="text-amber-400" />
           <p className="text-[10px] text-text-secondary leading-tight">
             {(regime_alignment?.alignment === 'MATCH') ? 'The market is complacent. Your portfolio is correctly positioned with high equity exposure to capture the rally. Action: Hold steady, but keep some cash ready.' : (regime_alignment?.alignment === 'MISMATCH') ? 'Your portfolio allocation is fighting the current market regime. Action: Consider rebalancing towards defensive assets if VIX is rising.' : 'Regime alignment is neutral. Ensure your asset allocation matches your personal risk tolerance.'}
           </p>
        </div>
      </div>
    );
  }

  if (mode === 'stress') {
    const { risk_adjusted, horizons, stress_overlays } = data.backtest_view || {};
    return (
      <div className="flex flex-col w-full h-full gap-2">
        <div className="flex flex-1 gap-3 min-h-0 w-full">
          {renderCard("Risk-Adjusted Profile", <Shield size={12} className="text-amber-400" />, (
            <div className="flex gap-2">
              <div className="flex-1 p-2 bg-surface/50 rounded border border-border text-center">
                <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Sharpe</span>
                <span className="text-xl font-bold font-mono text-alpha">{risk_adjusted?.sharpe || 0}</span>
              </div>
              <div className="flex-1 p-2 bg-surface/50 rounded border border-border text-center">
                <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Sortino</span>
                <span className="text-xl font-bold font-mono text-alpha">{risk_adjusted?.sortino || 0}</span>
              </div>
            </div>
          ))}
          {renderCard("Historical Horizons", <Waves size={12} className="text-amber-400" />, (
            <div className="flex gap-2">
               <div className="flex-1 p-2 bg-surface/50 rounded border border-border text-center">
                 <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Best 1Y</span>
                 <span className="text-base font-bold font-mono text-alpha">+{horizons?.best_1y || 0}%</span>
               </div>
               <div className="flex-1 p-2 bg-surface/50 rounded border border-border text-center">
                 <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Worst 1Y</span>
                 <span className="text-base font-bold font-mono text-beta">{horizons?.worst_1y || 0}%</span>
               </div>
            </div>
          ))}
          {renderCard("Stress Overlays", <AlertTriangle size={12} className="text-amber-400" />, (
             <div className="flex flex-col h-full justify-center">
               <div className="p-2 bg-surface/50 rounded border border-border text-center">
                 <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Nifty Correlation</span>
                 <span className="text-xl font-bold font-mono text-amber-400">{stress_overlays?.nifty_correlation || 0}</span>
               </div>
             </div>
          ))}
        </div>
        <div className="bg-canvas border border-border rounded-lg p-2 flex items-center gap-2 shrink-0">
           <Zap size={14} className="text-amber-400" />
           <p className="text-[10px] text-text-secondary leading-tight">
             {(risk_adjusted?.sharpe || 0) > 1.5 ? 'Excellent risk-adjusted profile. Your portfolio historically provides strong returns for the level of volatility taken. Action: Hold steady.' : (risk_adjusted?.sharpe || 0) > 0.8 ? 'Adequate risk-adjusted returns. Your portfolio is keeping pace with its volatility.' : 'Poor risk-adjusted profile. You are taking on too much volatility for the returns generated. Action: Diversify into lower-beta assets.'}
           </p>
        </div>
      </div>
    );
  }

  if (mode === 'performance') {
    const { volatility_regime, periodic_attribution } = data.performance_view || {};
    return (
      <div className="flex flex-col w-full h-full gap-2">
        <div className="flex flex-1 gap-3 min-h-0 w-full">
          {renderCard("Volatility Regime", <List size={12} className="text-emerald-400" />, (
            <>
              <div className="p-2 bg-surface/50 rounded border border-border text-center">
                 <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">VIX Z-Score Profiler</span>
                 <span className="text-lg font-bold font-mono text-white">{volatility_regime?.z_score || 0} <span className="text-xs text-text-secondary">(VIX {volatility_regime?.current_vix})</span></span>
              </div>
              <div className="mt-auto text-[10px] font-bold text-emerald-400 bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20 text-center">
                 {volatility_regime?.current_regime || 'Unknown'}
              </div>
            </>
          ))}
          {renderCard("Asymmetry Engine", <Activity size={12} className="text-emerald-400" />, (
            <div className="p-2 bg-surface/50 rounded border border-border text-center">
                 <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Avg Panic Regime Drop</span>
                 <span className="text-lg font-bold font-mono text-beta">{volatility_regime?.avg_panic_drop || 0}%</span>
            </div>
          ))}
          {renderCard("Periodic Attribution", <Wallet size={12} className="text-emerald-400" />, (
             <div className="flex gap-2">
               <div className="flex-1 p-2 bg-surface/50 rounded border border-border text-center flex flex-col justify-center">
                 <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Trailing 1M</span>
                 <span className={`text-base font-bold font-mono ${(periodic_attribution?.ret_1m || 0) >= 0 ? 'text-alpha' : 'text-beta'}`}>
                   {(periodic_attribution?.ret_1m || 0) > 0 ? '+' : ''}{periodic_attribution?.ret_1m || 0}%
                 </span>
               </div>
               <div className="flex-1 p-2 bg-surface/50 rounded border border-border text-center flex flex-col justify-center">
                 <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Trailing 6M</span>
                 <span className={`text-base font-bold font-mono ${(periodic_attribution?.ret_6m || 0) >= 0 ? 'text-alpha' : 'text-beta'}`}>
                   {(periodic_attribution?.ret_6m || 0) > 0 ? '+' : ''}{periodic_attribution?.ret_6m || 0}%
                 </span>
               </div>
             </div>
          ))}
        </div>
        <div className="bg-canvas border border-border rounded-lg p-2 flex items-center gap-2 shrink-0">
           <Zap size={14} className="text-amber-400" />
           <p className="text-[10px] text-text-secondary leading-tight">
             {(volatility_regime?.current_regime || '').includes('Complacent') ? 'Market volatility is currently exceptionally low. Action: This is often the calm before the storm. Cheap hedges or out-of-the-money puts can be accumulated now.' : (volatility_regime?.current_regime || '').includes('Panic') ? 'Market is in a Panic Regime. Volatility is elevated. Action: Avoid panic selling. Historically, this is the time to deploy cash into high-conviction value stocks.' : 'Normal volatility conditions. Continue standard systematic investments (SIPs).'}
           </p>
        </div>
      </div>
    );
  }

  if (mode === 'drawdown') {
    const { crash_profiler, institutional_flow } = data.drawdown_view || {};
    return (
      <div className="flex flex-col w-full h-full gap-2">
        <div className="flex flex-1 gap-3 min-h-0 w-full">
          {renderCard("Crash Profiler", <TrendingDown size={12} className="text-red-400" />, (
            <div className="flex gap-2">
              <div className="flex-1 p-2 bg-surface/50 rounded border border-border text-center">
                 <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Max Drawdown</span>
                 <span className="text-xl font-bold font-mono text-beta">{crash_profiler?.max_drawdown || 0}%</span>
              </div>
              <div className="flex-1 p-2 bg-surface/50 rounded border border-border text-center">
                 <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Downside Beta</span>
                 <span className="text-xl font-bold font-mono text-red-400">{crash_profiler?.downside_beta || 1.0}</span>
              </div>
            </div>
          ))}
          {renderCard("Institutional Flow", <Wallet size={12} className="text-red-400" />, (
            <>
              <div className="p-2 bg-surface/50 rounded border border-border text-center">
                 <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Accumulation Score</span>
                 <span className={`text-xl font-bold font-mono ${(institutional_flow?.accumulation_score || 0) > 0 ? 'text-alpha' : 'text-beta'}`}>
                   {institutional_flow?.accumulation_score > 0 ? '+' : ''}{institutional_flow?.accumulation_score || 0}
                 </span>
              </div>
              <div className="mt-auto text-[9px] font-bold text-amber-400 bg-amber-500/10 p-1.5 rounded border border-amber-500/20 text-center leading-tight">
                 {institutional_flow?.verdict || 'Unknown'}
              </div>
            </>
          ))}
          {renderCard("Squeeze Risk (95% VaR)", <AlertTriangle size={12} className="text-red-400" />, (
             <div className="flex-1 flex flex-col justify-center">
               <div className="p-2 bg-surface/50 rounded border border-border text-center">
                 <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">95% Weekly VaR</span>
                 <span className="text-xl font-bold font-mono text-beta">{defenseMetrics?.var95 === 'N/A' ? 'N/A' : `₹${(defenseMetrics?.var95 || 0).toLocaleString()}`}</span>
               </div>
               <div className="flex gap-2 mt-2">
                 <div className="flex-1 p-2 bg-surface/50 rounded border border-border text-center">
                   <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">Portfolio Beta</span>
                   <span className="text-base font-bold font-mono text-text-primary">{defenseMetrics?.beta || 'N/A'}</span>
                 </div>
               </div>
             </div>
          ))}
        </div>
        <div className="bg-canvas border border-border rounded-lg p-2 flex items-center gap-2 shrink-0">
           <Zap size={14} className="text-amber-400" />
           <p className="text-[10px] text-text-secondary leading-tight">
             {(crash_profiler?.downside_beta || 1.0) > 1.1 ? `High Crash Risk. When the Nifty drops, your portfolio historically crashes ${(((crash_profiler?.downside_beta || 1.0) - 1)*100).toFixed(0)}% harder. Action: Add defensive ETFs or Liquid funds to cushion the blow.` : (crash_profiler?.downside_beta || 1.0) < 0.9 ? `Strong Defense. Your portfolio is historically resilient during market crashes, falling ${((1 - (crash_profiler?.downside_beta || 1.0))*100).toFixed(0)}% less than the Nifty. Action: Hold defensive positions.` : 'Market-neutral downside risk. Your portfolio crashes in tandem with the broader market.'}
           </p>
        </div>
      </div>
    );
  }
  
  if (mode === 'ai-outlook') {
    const { ensemble_alpha, forensic_risk, shap_drivers } = data.ai_outlook_view || {};
    return (
      <div className="flex flex-col w-full h-full gap-2">
        <div className="flex flex-1 gap-3 min-h-0 w-full">
          {renderCard("Ensemble Alpha", <BrainCircuit size={12} className="text-indigo-400" />, (
            <div className="p-2 bg-surface/50 rounded border border-border text-center flex flex-col h-full justify-center">
               <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">T+365 Outperformance Prob</span>
               <span className={`text-3xl font-bold font-mono ${ensemble_alpha > 50 && ensemble_alpha !== "PENDING" ? 'text-alpha' : (ensemble_alpha === "PENDING" ? 'text-text-secondary' : 'text-beta')}`}>{ensemble_alpha === "PENDING" ? "PENDING" : `${ensemble_alpha || 0}%`}</span>
            </div>
          ))}
          {renderCard("Forensic Auditor", <AlertTriangle size={12} className="text-indigo-400" />, (
            <div className="p-2 bg-surface/50 rounded border border-border text-center flex flex-col h-full justify-center">
               <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider block mb-0.5">QES Risk Probability</span>
               <span className={`text-3xl font-bold font-mono ${forensic_risk > 30 && forensic_risk !== "PENDING" ? 'text-beta' : (forensic_risk === "PENDING" ? 'text-text-secondary' : 'text-alpha')}`}>{forensic_risk === "PENDING" ? "PENDING" : `${forensic_risk || 0}%`}</span>
            </div>
          ))}
          {renderCard("SHAP Overlay", <Crosshair size={12} className="text-indigo-400" />, (
             <div className="flex-1 flex flex-col justify-center gap-1.5">
               <span className="text-[8px] text-text-secondary uppercase font-bold tracking-wider mb-1">Top XGBoost Drivers</span>
               {shap_drivers && shap_drivers.length > 0 ? (
                 shap_drivers.map((driver: string, idx: number) => (
                   <div key={idx} className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 p-1.5 rounded border border-indigo-500/20 truncate">
                     {idx + 1}. {driver}
                   </div>
                 ))
               ) : (
                 <div className="text-[9px] text-text-secondary">No dominant drivers found</div>
               )}
             </div>
          ))}
        </div>
        <div className="bg-canvas border border-border rounded-lg p-2 flex items-center gap-2 shrink-0">
           <Zap size={14} className="text-amber-400" />
           <p className="text-[10px] text-text-secondary leading-tight">
             {(forensic_risk !== 'PENDING' && forensic_risk > 30) ? 'High Forensic Risk detected in your holdings. Quantitative models flag potential accounting anomalies. Action: Deeply audit your high-weight mid/small-cap allocations.' : (ensemble_alpha !== 'PENDING' && ensemble_alpha > 55) ? 'Strong AI Outperformance Probability. The ensemble models favor the fundamental and momentum characteristics of your portfolio for the next 12 months.' : 'Neutral AI Outlook. The ensemble models predict market-performing returns for your current allocations over the next 12 months.'}
           </p>
        </div>
      </div>
    );
  }

  return null;
};
