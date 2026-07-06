import React from 'react';
import { InfoTooltip } from '../../components/InfoTooltip';
import { Shield, TrendingUp, TrendingDown, Clock, Activity } from 'lucide-react';

export const MacroResilience = ({ data }: { data: any }) => {
  const resilience = data.relative?.macro_resilience_profile || {};
  
  const upBeta = resilience.up_beta !== undefined ? resilience.up_beta : null;
  const downBeta = resilience.down_beta !== undefined ? resilience.down_beta : null;
  const upCapture = resilience.up_capture !== undefined ? resilience.up_capture : null;
  const downCapture = resilience.down_capture !== undefined ? resilience.down_capture : null;
  const vixStress = resilience.vix_stress_reaction !== undefined ? resilience.vix_stress_reaction : null;
  const avgRecovery = resilience.avg_recovery_days !== undefined ? resilience.avg_recovery_days : null;

  // Formatting helpers
  const formatValue = (val: number | null, isPercent = false, invertColors = false) => {
    if (val === null || isNaN(val)) return <span className="text-slate-500 font-mono">N/A</span>;
    const displayVal = isPercent ? `${(val * 100).toFixed(1)}%` : val.toFixed(2);
    let isGood = val > (isPercent ? 1 : 1);
    if (invertColors) isGood = !isGood;
    return (
      <span className={`font-mono font-bold ${isGood ? 'text-emerald-400' : 'text-rose-400'}`}>
        {displayVal}
      </span>
    );
  };

  const getCaptureBarColor = (val: number, isDown: boolean) => {
      // For Up Capture, > 1 is good (green), < 1 is bad (red)
      // For Down Capture, < 1 is good (green), > 1 is bad (red)
      if (isDown) return val > 1 ? 'bg-rose-500' : 'bg-emerald-500';
      return val > 1 ? 'bg-emerald-500' : 'bg-rose-500';
  };

  return (
    <div className="bg-[#121214] p-5 rounded-xl border border-white/5 h-full flex flex-col col-span-1 relative overflow-hidden">
      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl" />
      
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-lg font-medium text-text-primary flex items-center tracking-tight">
            Macro Resilience
            <InfoTooltip text="Evaluates the stock's defensive characteristics and reaction to broader Nifty 50 volatility and VIX spikes." />
          </h3>
        </div>
        <div className="p-2 bg-indigo-500/10 rounded-lg">
           <Shield className="w-5 h-5 text-indigo-400" />
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between space-y-4">
        
        {/* Market Capture Ratio */}
        <div className="space-y-3">
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-[10px] text-text-secondary uppercase font-bold tracking-widest flex items-center gap-1.5">
                    Market Capture Ratio <InfoTooltip text="Percentage of Nifty 50's total returns captured during Up months vs Down months." />
                </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                {/* Up Capture */}
                <div className="bg-[#0a0a0b] p-3 rounded-lg border border-white/5 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5 text-text-secondary text-xs">
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                            Up Capture
                        </div>
                        {formatValue(upCapture, true, false)}
                    </div>
                    {upCapture !== null && !isNaN(upCapture) && (
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden w-full relative">
                            <div 
                                className={`absolute left-0 top-0 h-full rounded-full ${getCaptureBarColor(upCapture, false)}`}
                                style={{ width: `${Math.min((upCapture) * 100, 100)}%` }}
                            />
                        </div>
                    )}
                </div>

                {/* Down Capture */}
                <div className="bg-[#0a0a0b] p-3 rounded-lg border border-white/5 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5 text-text-secondary text-xs">
                            <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                            Down Capture
                        </div>
                        {formatValue(downCapture, true, true)}
                    </div>
                    {downCapture !== null && !isNaN(downCapture) && (
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden w-full relative">
                            <div 
                                className={`absolute left-0 top-0 h-full rounded-full ${getCaptureBarColor(downCapture, true)}`}
                                style={{ width: `${Math.min((downCapture) * 100, 100)}%` }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Asymmetric Beta */}
        <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
            <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-secondary uppercase font-bold tracking-widest">Up Beta</span>
                <span className="text-lg text-text-primary">{upBeta !== null && !isNaN(upBeta) ? upBeta.toFixed(2) : '--'}</span>
            </div>
            <div className="flex flex-col gap-1 border-l border-white/5 pl-4">
                <span className="text-[10px] text-text-secondary uppercase font-bold tracking-widest">Down Beta</span>
                <span className="text-lg text-text-primary">{downBeta !== null && !isNaN(downBeta) ? downBeta.toFixed(2) : '--'}</span>
            </div>
        </div>

        {/* Stress Metrics */}
        <div className="bg-[#0a0a0b] rounded-lg border border-white/5 p-3 flex flex-col gap-3">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                    <Activity className="w-4 h-4 text-purple-400" />
                    <span>VIX Stress Reaction</span>
                </div>
                {vixStress !== null && !isNaN(vixStress) ? (
                    <span className={`font-mono font-bold ${vixStress > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {vixStress > 0 ? '+' : ''}{(vixStress * 100).toFixed(2)}%
                    </span>
                ) : <span className="text-slate-500 font-mono text-sm">N/A</span>}
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span>Avg Drawdown Recovery</span>
                </div>
                {avgRecovery !== null && !isNaN(avgRecovery) ? (
                    <span className="font-mono font-bold text-text-primary">
                        {Math.round(avgRecovery)} days
                    </span>
                ) : <span className="text-slate-500 font-mono text-sm">N/A</span>}
            </div>
        </div>

      </div>
    </div>
  );
};
