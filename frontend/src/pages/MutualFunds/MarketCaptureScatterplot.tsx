import React, { useMemo } from 'react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell
} from 'recharts';
import { TrendingUp } from 'lucide-react';

interface MarketCaptureProps {
  funds?: any[];
}

export const MarketCaptureScatterplot: React.FC<MarketCaptureProps> = ({ funds = [] }) => {
  const scatterData = useMemo(() => {
    if (!Array.isArray(funds)) return [];
    return funds
      .map(f => ({
        name: f.fund_name || f.scheme_name,
        category: f.sub_category || f.category || 'Equity',
        expenseRatio: parseFloat(f.expense_ratio) || 0,
        return3y: parseFloat(f.return3y) || 0,
        aum: f.aum || 0
      }))
      .filter(f => f.expenseRatio > 0 && f.return3y > 0)
      .slice(0, 150);
  }, [funds]);

  return (
    <div className="flex flex-col justify-between h-full w-full">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" /> Fee Efficiency: Expense Ratio vs. 3Y Return
          </h2>
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
            Target: Low Fee (&lt;0.8%), High 3Y Return
          </span>
        </div>
        <p className="text-xs text-text-secondary mb-2">
          Plots Expense Ratio (%) against 3-Year CAGR Return. Top-left quadrant highlights low-fee, top-performing funds.
        </p>
      </div>

      <div className="h-56 w-full">
        {scatterData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-text-secondary text-xs">
            Loading fee efficiency matrix...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2E39" />
              <XAxis
                type="number"
                dataKey="expenseRatio"
                name="Expense Ratio"
                unit="%"
                stroke="#8E94A4"
                fontSize={11}
              />
              <YAxis
                type="number"
                dataKey="return3y"
                name="3Y Return"
                unit="%"
                stroke="#8E94A4"
                fontSize={11}
              />
              <RechartsTooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  if (!payload || !payload.length) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-surface-hover border border-border p-2 rounded shadow-xl text-xs space-y-1">
                      <p className="font-bold text-text-primary">{data.name}</p>
                      <p className="text-text-secondary">Category: <span className="text-text-primary font-bold">{data.category}</span></p>
                      <p className="text-text-secondary">Expense Ratio: <span className="text-emerald-400 font-bold">{data.expenseRatio}%</span></p>
                      <p className="text-text-secondary">3Y Return: <span className="text-indigo-400 font-bold">{data.return3y}%</span></p>
                    </div>
                  );
                }}
              />
              <Scatter data={scatterData}>
                {scatterData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.expenseRatio <= 0.8 && entry.return3y >= 20 ? '#10B981' : '#6366F1'}
                    opacity={0.8}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
