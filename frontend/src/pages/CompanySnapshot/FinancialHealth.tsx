import React, { useMemo } from 'react';
import { InfoTooltip } from '../../components/InfoTooltip';
import { BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';

export const FinancialHealth = ({ data }: { data: any }) => {
  const rel = data.relative || {};
  const abs = data.absolute || {};
  const stats = abs || {};
  const financials = abs.financialStatement || [];

  const checks = useMemo(() => {
    // Helper to get yearly data
    const getYearly = (title: string) => {
      const item = financials.find((i: any) => i.title === title || i.title === title.toUpperCase());
      if (!item || !item.yearly) return [null, null];
      const years = Object.keys(item.yearly).sort();
      if (years.length >= 2) return [Number(item.yearly[years[years.length - 1]]), Number(item.yearly[years[years.length - 2]])];
      if (years.length === 1) return [Number(item.yearly[years[0]]), null];
      return [null, null];
    };

    const [p_cy, p_py] = getYearly('Profit');
    const [nw_cy, nw_py] = getYearly('Net Worth');
    const [rev_cy, rev_py] = getYearly('Revenue');

    // 1. Positive ROA
    const roa = Number(stats.returnOnAssets);
    const isRoaPositive = !isNaN(roa) && roa > 0;

    // 2. Positive OCF
    const pToOcf = Number(stats.priceToOcf);
    const isOcfPositive = !isNaN(pToOcf) && pToOcf > 0;

    // 3. Increasing ROE
    let roeIncreasing = false;
    if (p_cy !== null && p_py !== null && nw_cy !== null && nw_py !== null && nw_cy !== 0 && nw_py !== 0) {
      roeIncreasing = (p_cy / nw_cy) > (p_py / nw_py);
    }

    // 4. Accruals (OCF > Net Profit)
    const pe = Number(stats.peRatio);
    let ocfGreater = false;
    if (isOcfPositive && !isNaN(pe) && pe > 0) {
      ocfGreater = (1.0 / pToOcf) > (1.0 / pe); // OCF yield > Earnings yield
    }

    // 5. Leverage Control (D/E < 0.5)
    const de = Number(stats.debtToEquity);
    const leverageControl = !isNaN(de) && de < 0.5;

    // 6. Liquidity (Current Ratio > 1.5)
    const cr = Number(stats.currentRatio);
    const liquidity = !isNaN(cr) && cr > 1.5;

    // 7. Capital Dilution
    const mcap = Number(stats.marketCap);
    const dy = Number(stats.divYield) || 0;
    let noDilution = false;
    if (!isNaN(mcap) && nw_cy !== null && nw_py !== null && p_cy !== null) {
      const divPaid = !isNaN(dy) ? mcap * (dy / 100.0) : 0;
      noDilution = ((nw_cy - nw_py) - p_cy + divPaid) <= (0.05 * Math.abs(nw_py));
    } else {
      noDilution = true; // Give benefit of doubt if data missing
    }

    // 8. Margins Expansion
    let marginExpansion = false;
    if (p_cy !== null && p_py !== null && rev_cy !== null && rev_py !== null && rev_cy > 0 && rev_py > 0) {
      marginExpansion = (p_cy / rev_cy) > (p_py / rev_py);
    }

    // 9. Revenue Growth
    let revenueGrowth = false;
    if (rev_cy !== null && rev_py !== null) {
      revenueGrowth = rev_cy > rev_py;
    }

    return [
      { 
        name: 'Positive ROA', passed: isRoaPositive, 
        desc: <>Is the Return on Assets (ROA) positive?<BlockMath math="\text{ROA} > 0" /></>
      },
      { 
        name: 'Positive OCF', passed: isOcfPositive, 
        desc: <>Is the company generating positive operating cash flow?<BlockMath math="\text{OCF} > 0" /></>
      },
      { 
        name: 'Increasing ROE', passed: roeIncreasing, 
        desc: <>Did the Return on Equity increase?<BlockMath math="\text{ROE}_{\text{current}} > \text{ROE}_{\text{previous}}" /></>
      },
      { 
        name: 'Cash > Profit', passed: ocfGreater, 
        desc: <>Calculates if the actual cash generated exceeds the accounting net profit.<BlockMath math="\text{OCF Yield} > \text{Earnings Yield}" /></>
      },
      { 
        name: 'Low Leverage', passed: leverageControl, 
        desc: <>Is the company keeping its debt under control?<BlockMath math="\frac{\text{Total Debt}}{\text{Total Equity}} < 0.5" /></>
      },
      { 
        name: 'High Liquidity', passed: liquidity, 
        desc: <>Does the company have enough short-term assets to cover short-term liabilities?<BlockMath math="\text{Current Ratio} > 1.5" /></>
      },
      { 
        name: 'No Dilution', passed: noDilution, 
        desc: <>Is the company avoiding shareholder dilution?<BlockMath math="\Delta \text{Net Worth} - \text{Net Income} + \text{Dividends} \le 0.05 \times \text{Net Worth}_{\text{previous}}" /></>
      },
      { 
        name: 'Margin Exp.', passed: marginExpansion, 
        desc: <>Did Profit Margins expand year-over-year?<BlockMath math="\text{Profit Margin}_{\text{current}} > \text{Profit Margin}_{\text{previous}}" /></>
      },
      { 
        name: 'Rev Growth', passed: revenueGrowth, 
        desc: <>Did the company grow its revenue year-over-year?<BlockMath math="\text{Revenue}_{\text{current}} > \text{Revenue}_{\text{previous}}" /></>
      },
    ];
  }, [stats, financials]);

  // Use the exact score from backend to prevent calculation mismatches
  const backendScore = rel.health_scores?.piotroski_f_score;
  const score = backendScore !== undefined && backendScore !== null ? Number(backendScore) : checks.filter(c => c.passed).length;
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
                ${check.passed 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-red-500/10 border-red-500/30 text-red-400'}
              `}
            >
              <div className="absolute top-1 right-1">
                <InfoTooltip text={check.desc} position="bottom" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider leading-tight mt-1">{check.name}</span>
              <span className="text-2xl mt-1">{check.passed ? '✓' : '✗'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
