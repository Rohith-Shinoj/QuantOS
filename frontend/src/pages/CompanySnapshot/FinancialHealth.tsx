import React, { useMemo } from 'react';
import { InfoTooltip } from '../../components/InfoTooltip';
import { BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';

export const FinancialHealth = ({ data }: { data: any }) => {
  const rel = data.relative || {};

  const { score, checks } = useMemo(() => {
    let parsedData: any = null;
    const backendScore = rel.health_scores?.piotroski_f_score;
    
    if (backendScore) {
      try {
        parsedData = typeof backendScore === 'string' ? JSON.parse(backendScore) : backendScore;
      } catch (e) {
        console.error("Failed to parse piotroski_f_score JSON", e);
      }
    }

    const c = parsedData?.checks || {};
    const totalScore = parsedData?.total_score ?? 0;

    const checksArray = [
      { 
        name: 'Positive ROA', passed: c.positive_roa ?? null, 
        desc: <>Is the Return on Assets (ROA) positive?<BlockMath math="\text{ROA} > 0" /></>
      },
      { 
        name: 'Positive OCF', passed: c.positive_ocf ?? null, 
        desc: <>Is the company generating positive operating cash flow?<BlockMath math="\text{OCF} > 0" /></>
      },
      { 
        name: 'Increasing ROA', passed: c.increasing_roa ?? null, 
        desc: <>Did the Return on Assets increase?<BlockMath math="\text{ROA}_{\text{current}} > \text{ROA}_{\text{previous}}" /></>
      },
      { 
        name: 'Cash > Profit', passed: c.quality_of_earnings ?? null, 
        desc: <>Calculates if the actual cash generated exceeds the accounting net profit.<BlockMath math="\text{OCF} > \text{Net Profit}" /></>
      },
      { 
        name: 'Low Leverage', passed: c.decreasing_leverage ?? null, 
        desc: <>Is the company keeping its debt under control?<BlockMath math="\frac{\text{Total Debt}}{\text{Total Equity}} < 0.5" /></>
      },
      { 
        name: 'High Liquidity', passed: c.increasing_current_ratio ?? null, 
        desc: <>Does the company have enough short-term assets to cover short-term liabilities?<BlockMath math="\text{Current Ratio} > 1.5" /></>
      },
      { 
        name: 'No Dilution', passed: c.no_dilution ?? null, 
        desc: <>Is the company avoiding shareholder dilution?</>
      },
      { 
        name: 'Margin Exp.', passed: c.increasing_margin ?? null, 
        desc: <>Did Profit Margins expand year-over-year?<BlockMath math="\text{Profit Margin}_{\text{current}} > \text{Profit Margin}_{\text{previous}}" /></>
      },
      { 
        name: 'Rev Growth', passed: c.increasing_revenue ?? null, 
        desc: <>Did the company grow its revenue year-over-year?<BlockMath math="\text{Revenue}_{\text{current}} > \text{Revenue}_{\text{previous}}" /></>
      },
    ];

    return { score: totalScore, checks: checksArray };
  }, [rel.health_scores?.piotroski_f_score]);

  const isHealthy = score >= 7;

  return (
    <div className="bg-surface p-4 rounded-lg border border-border h-full flex flex-col">
      <div className="flex justify-between items-start mb-4 shrink-0">
        <h3 className="text-lg font-medium text-text-primary flex items-center">
          Forensic X-Ray Matrix
          <InfoTooltip text="Strict 9-point Piotroski checklist. Evaluates deep accounting reality vs engineered earnings." />
        </h3>
        <div className="text-right">
          <div className="text-sm text-text-secondary font-medium">Piotroski F-Score</div>
          <div className={`text-xl font-bold ${isHealthy ? 'text-emerald-400' : 'text-amber-400'}`}>
            {score}/9
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col justify-center gap-2 mt-2">
        <div className="grid grid-cols-3 gap-2 flex-1">
          {checks.map((check, idx) => (
            <div 
              key={idx} 
              className={`rounded border flex flex-col items-center justify-center p-2 text-center transition-colors relative group
                ${check.passed === true
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : check.passed === false
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-surface-elevated border-border text-text-secondary'
                }
              `}
            >
              <div className="absolute top-1 right-1">
                <InfoTooltip text={check.desc} position="bottom" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider leading-tight mt-1">{check.name}</span>
              {check.passed === null ? (
                <span className="text-[10px] opacity-70 mt-3 font-medium leading-tight">Insufficient<br/>Data</span>
              ) : (
                <span className="text-2xl mt-1">{check.passed ? '✓' : '✗'}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
