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

    // 1. Positive ROA (Proxy using ROE if ROA missing)
    const roa = Number(stats.returnOnAssets) || Number(stats.roe) || 0;
    const isRoaPositive = roa > 0;

    // 2. Positive OCF
    const pToOcf = Number(stats.priceToOcf);
    const isOcfPositive = !isNaN(pToOcf) && pToOcf > 0;

    // 3. Accruals (OCF > Net Profit)
    const pe = Number(stats.peRatio);
    let ocfGreater = false;
    if (isOcfPositive && !isNaN(pe) && pe > 0) {
      ocfGreater = (1.0 / pToOcf) > (1.0 / pe); // OCF yield > Earnings yield
    }

    // 4. Margins Expansion
    let marginExpansion = false;
    if (p_cy !== null && p_py !== null && rev_cy !== null && rev_py !== null && rev_cy > 0 && rev_py > 0) {
      marginExpansion = (p_cy / rev_cy) > (p_py / rev_py);
    }

    // 5. Revenue Growth
    let revenueGrowth = false;
    if (rev_cy !== null && rev_py !== null) {
      revenueGrowth = rev_cy > rev_py;
    }

    // 6. Leverage Control (D/E < 0.5)
    const de = Number(stats.debtToEquity);
    const leverageControl = !isNaN(de) && de < 0.5;

    // 7. Liquidity (Current Ratio > 1.5)
    const cr = Number(stats.currentRatio);
    const liquidity = !isNaN(cr) && cr > 1.5;

    // 8. Capital Dilution
    const mcap = Number(stats.marketCap);
    const dy = Number(stats.divYield) || 0;
    let noDilution = false;
    if (!isNaN(mcap) && nw_cy !== null && nw_py !== null && p_cy !== null) {
      const divPaid = mcap * (dy / 100.0);
      noDilution = ((nw_cy - nw_py) - p_cy + divPaid) <= (0.05 * Math.abs(nw_py));
    } else {
      noDilution = true; // Give benefit of doubt if data missing
    }

    // 9. Forensic Tax Audit
    const forensicPass = rel.qes_forensic_red_flag !== 1;

    return [
      { 
        name: 'Positive ROA', passed: isRoaPositive, 
        desc: <>Is the Return on Assets (ROA) positive?<BlockMath math="\text{ROA} > 0" /></>
      },
      { 
        name: 'Cash > Profit', passed: ocfGreater, 
        desc: <>Quality of Earnings: Calculates if the actual cash generated exceeds the accounting net profit.<BlockMath math="\text{Operating Cash Flow Yield} > \text{Earnings Yield}" /></>
      },
      { 
        name: 'Margin Exp.', passed: marginExpansion, 
        desc: <>Did Profit Margins expand year-over-year?<BlockMath math="\text{Profit Margin}_{\text{current}} > \text{Profit Margin}_{\text{previous}}" /></>
      },
      { 
        name: 'Rev Growth', passed: revenueGrowth, 
        desc: <>Did the company grow its revenue year-over-year?<BlockMath math="\text{Revenue}_{\text{current}} > \text{Revenue}_{\text{previous}}" /></>
      },
      { 
        name: 'Low Leverage', passed: leverageControl, 
        desc: <>Is the company keeping its debt under control?<BlockMath math="\frac{\text{Total Debt}}{\text{Total Equity}} < 0.5" /></>
      },
      { 
        name: 'High Liquidity', passed: liquidity, 
        desc: <>Does the company have enough short-term assets to cover its short-term liabilities?<BlockMath math="\text{Current Ratio} > 1.5" /></>
      },
      { 
        name: 'No Dilution', passed: noDilution, 
        desc: <>Is the company avoiding shareholder dilution by not issuing excessive new equity?<BlockMath math="\Delta \text{Net Worth} - \text{Net Income} + \text{Dividends} \le 0.05 \times \text{Net Worth}_{\text{previous}}" /></>
      },
      { 
        name: 'Positive OCF', passed: isOcfPositive, 
        desc: <>Is the company generating positive operating cash flow from its core business?<BlockMath math="\text{Operating Cash Flow} > 0" /></>
      },
      { 
        name: 'Tax Forensic', passed: forensicPass, 
        desc: <>Does the reported Tax expense growth align closely with Profit Before Tax growth? Major divergences can indicate accounting manipulation.<BlockMath math="|\Delta \text{Tax}_{\%} - \Delta \text{PBT}_{\%}| < 30\%" /></>
      },
    ];
  }, [stats, financials, rel.qes_forensic_red_flag]);

  const score = checks.filter(c => c.passed).length;
  const isHealthy = score >= 6;

  return (
    <div className="bg-surface p-4 rounded-lg border border-border h-full flex flex-col">
      <div className="flex justify-between items-start mb-4 shrink-0">
        <h3 className="text-lg font-medium text-text-primary flex items-center">
          Forensic X-Ray Matrix
          <InfoTooltip text="Strict 9-point Piotroski & Forensic checklist. Evaluates deep accounting reality vs engineered earnings." />
        </h3>
        <div className="text-right">
          <div className="text-sm text-text-secondary font-medium">Audit Score</div>
          <div className={`text-xl font-bold ${isHealthy ? 'text-alpha' : 'text-beta'}`}>
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
