const fs = require('fs');
let code = fs.readFileSync('src/pages/PortfolioTracker.tsx', 'utf8');

// 1. Update state
code = code.replace(
  "const [chartMode, setChartMode] = useState<'alpha' | 'stress' | 'shap' | 'drawdown'>('alpha');",
  "const [chartMode, setChartMode] = useState<'allocation' | 'performance' | 'stress' | 'drawdown'>('allocation');"
);

// 2. Remove scatterData
code = code.replace(/\/\/ CHART 1: Alpha-Risk Scatter Plot[\s\S]*?\}, \[stockHoldings, mfHoldings, allStocks, allMFs, mfDetails\]\);/, 
`// CHART 1: Asset Allocation Data
  const allocationData = useMemo(() => {
    const sectors: Record<string, number> = {};
    const marketCaps: Record<string, number> = {};
    const assetTypes = { 'Direct Equity': 0, 'Mutual Funds': 0 };

    stockHoldings.forEach(h => {
      const stock = allStocks?.find((st: any) => st.slug === h.slug);
      const val = h.units * getLivePrice(h.slug, 'STOCKS');
      
      const sector = stock?.industry || 'Unknown';
      sectors[sector] = (sectors[sector] || 0) + val;
      
      const mc = stock?.market_cap_type || 'Unknown';
      marketCaps[mc] = (marketCaps[mc] || 0) + val;
      
      assetTypes['Direct Equity'] += val;
    });

    mfHoldings.forEach(h => {
      const mf = allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
      const val = h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS');
      
      const cat = mf?.category || 'Fund';
      sectors[cat] = (sectors[cat] || 0) + val;
      
      marketCaps['Diversified (MF)'] = (marketCaps['Diversified (MF)'] || 0) + val;
      
      assetTypes['Mutual Funds'] += val;
    });

    return {
      sectors: Object.entries(sectors).map(([n, v]) => ({ name: n, value: v })).sort((a, b) => b.value - a.value),
      marketCaps: Object.entries(marketCaps).map(([n, v]) => ({ name: n, value: v })).sort((a, b) => b.value - a.value),
      assetTypes: Object.entries(assetTypes).map(([n, v]) => ({ name: n, value: v }))
    };
  }, [stockHoldings, mfHoldings, allStocks, allMFs]);`);

// 3. Replace shapWaterfallData with performanceData
code = code.replace(/\/\/ CHART 3: SHAP Waterfall Data[\s\S]*?\}, \[stockHoldings, allStocks, totalValue\]\);/,
`// CHART 3: Historical Performance Matrix
  const performanceData = useMemo(() => {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    
    const oneMonthAgo = new Date(today); oneMonthAgo.setMonth(today.getMonth() - 1);
    const sixMonthsAgo = new Date(today); sixMonthsAgo.setMonth(today.getMonth() - 6);
    const oneYearAgo = new Date(today); oneYearAgo.setFullYear(today.getFullYear() - 1);
    const todayStr = formatDate(today);
    
    const data: any[] = [];
    
    stockHoldings.forEach(h => {
      const stock = allStocks?.find((st: any) => st.slug === h.slug);
      const detail = batchStockData?.[h.slug];
      const ohlcv = detail?.absolute?.OHLCV;
      
      if (stock && ohlcv) {
        data.push({
          name: stock.ticker || h.slug,
          type: 'stock',
          value: h.units * getLivePrice(h.slug, 'STOCKS'),
          ret1m: getReturnForPeriod(ohlcv, formatDate(oneMonthAgo), todayStr),
          ret6m: getReturnForPeriod(ohlcv, formatDate(sixMonthsAgo), todayStr),
          ret1y: getReturnForPeriod(ohlcv, formatDate(oneYearAgo), todayStr),
        });
      }
    });

    mfHoldings.forEach(h => {
      const mf = allMFs?.find((m: any) => (m.scheme_code || m.direct_search_id) === h.slug);
      if (mf && mf.historical_navs) {
        data.push({
          name: (mf.fund_name || h.slug).substring(0, 20),
          type: 'fund',
          value: h.units * getLivePrice(h.slug, 'MUTUAL_FUNDS'),
          ret1m: getReturnForPeriod(mf.historical_navs, formatDate(oneMonthAgo), todayStr),
          ret6m: getReturnForPeriod(mf.historical_navs, formatDate(sixMonthsAgo), todayStr),
          ret1y: getReturnForPeriod(mf.historical_navs, formatDate(oneYearAgo), todayStr),
        });
      }
    });
    
    return data.sort((a, b) => b.value - a.value);
  }, [stockHoldings, mfHoldings, allStocks, allMFs, batchStockData]);`);

// 4. Update the Tab headers
code = code.replace(
  "{ key: 'alpha' as const, label: 'X-Ray', color: 'indigo' },",
  "{ key: 'allocation' as const, label: 'Allocation', color: 'indigo' },"
);
code = code.replace(
  "{ key: 'shap' as const, label: 'SHAP', color: 'emerald' },",
  "{ key: 'performance' as const, label: 'Performance', color: 'emerald' },"
);
code = code.replace(
  "{chartMode === 'alpha' && <><Activity size={12} className=\"text-alpha\" /> Alpha-Risk X-Ray</>}",
  "{chartMode === 'allocation' && <><PieChartIcon size={12} className=\"text-indigo-400\" /> Asset Allocation</>}"
);
code = code.replace(
  "{chartMode === 'shap' && <><BarChart3 size={12} className=\"text-emerald-400\" /> Factor Attribution</>}",
  "{chartMode === 'performance' && <><List size={12} className=\"text-emerald-400\" /> Performance Matrix</>}"
);

// 5. Replace 'alpha' block rendering
code = code.replace(
  "chartMode === 'alpha' ? (",
  "chartMode === 'allocation' ? ("
);

// 6. Replace 'shap' block rendering
code = code.replace(
  "chartMode === 'shap' ? (",
  "chartMode === 'performance' ? ("
);

// 7. Write a placeholder UI for allocation instead of scatter plot
const scatterUIRegex = /<ResponsiveContainer width="100%" height="100%">[\s\S]*?<\/ResponsiveContainer>/;
code = code.replace(scatterUIRegex,
`{allocationData.sectors.length > 0 ? (
  <div className="flex flex-col md:flex-row gap-4 h-full overflow-y-auto">
    <div className="flex-1 bg-surface-hover/20 rounded-lg p-4 border border-border">
      <h4 className="text-xs font-bold text-text-secondary uppercase mb-4 tracking-wider">Sector Weighting</h4>
      <div className="space-y-3">
        {allocationData.sectors.map((s, i) => (
          <div key={i}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-primary truncate pr-2">{s.name}</span>
              <span className="text-text-secondary whitespace-nowrap">{(s.value / (totalValue || 1) * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-surface-hover rounded-full h-1.5">
              <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: \`\${(s.value / (totalValue || 1)) * 100}%\` }}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="flex-1 bg-surface-hover/20 rounded-lg p-4 border border-border">
      <h4 className="text-xs font-bold text-text-secondary uppercase mb-4 tracking-wider">Market Cap</h4>
      <div className="space-y-3">
        {allocationData.marketCaps.map((s, i) => (
          <div key={i}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-primary truncate pr-2">{s.name}</span>
              <span className="text-text-secondary whitespace-nowrap">{(s.value / (totalValue || 1) * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-surface-hover rounded-full h-1.5">
              <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: \`\${(s.value / (totalValue || 1)) * 100}%\` }}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
) : (
  <div className="h-full flex flex-col items-center justify-center text-text-secondary/50">
    <PieChartIcon size={48} className="mb-3 opacity-20" />
    <p className="text-xs">Add holdings to see allocation</p>
  </div>
)}`);

// 8. Write a placeholder UI for performance instead of SHAP BarChart
const shapUIRegex = /<ResponsiveContainer width="100%" height="100%">\s*<BarChart[\s\S]*?<\/ResponsiveContainer>/;
code = code.replace(shapUIRegex, 
`<div className="w-full h-full overflow-y-auto">
  <table className="w-full text-left border-collapse">
    <thead>
      <tr className="border-b border-border/50 text-[10px] text-text-secondary uppercase tracking-wider">
        <th className="p-3 font-medium">Asset</th>
        <th className="p-3 font-medium text-right">Value (₹)</th>
        <th className="p-3 font-medium text-right">1M Return</th>
        <th className="p-3 font-medium text-right">6M Return</th>
        <th className="p-3 font-medium text-right">1Y Return</th>
      </tr>
    </thead>
    <tbody>
      {performanceData.map((d, i) => {
        const fmt = (val: number | null) => {
          if (val === null) return '-';
          const pct = val * 100;
          return <span className={pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{pct > 0 ? '+' : ''}{pct.toFixed(1)}%</span>;
        };
        return (
          <tr key={i} className="border-b border-border/30 hover:bg-surface-hover/30 transition-colors">
            <td className="p-3">
              <div className="text-sm font-bold text-text-primary">{d.name}</div>
              <div className="text-[10px] text-text-secondary capitalize">{d.type}</div>
            </td>
            <td className="p-3 text-right text-sm text-text-primary">
              ₹{d.value.toLocaleString(undefined, {maximumFractionDigits: 0})}
            </td>
            <td className="p-3 text-right text-sm">{fmt(d.ret1m)}</td>
            <td className="p-3 text-right text-sm">{fmt(d.ret6m)}</td>
            <td className="p-3 text-right text-sm">{fmt(d.ret1y)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
</div>`);

// Need to replace the empty state for SHAP too
code = code.replace(
  /<div className="h-full flex flex-col items-center justify-center text-text-secondary\/50 text-center px-6">[\s\S]*?<\/div>/,
  ""
);

fs.writeFileSync('src/pages/PortfolioTracker.tsx', code);
console.log('Done replacing!');
