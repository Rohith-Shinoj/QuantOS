import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchMutualFundByCode } from '../../api';
import { ChevronLeft, ShieldAlert, BarChart2, Activity } from 'lucide-react';
import { MutualFundPriceChart } from './MutualFundPriceChart';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Treemap, Tooltip as RechartsTooltip } from 'recharts';

export const MutualFundSnapshot = () => {
  const { code } = useParams();
  
  const { data: fund, isLoading } = useQuery({
    queryKey: ['mutualFund', code],
    queryFn: () => fetchMutualFundByCode(code!),
    enabled: !!code
  });

  if (isLoading) return <div className="p-8 text-text-secondary text-center">Loading fund data...</div>;
  if (!fund) return <div className="p-8 text-text-secondary text-center">Fund not found.</div>;

  let advancedStats = [];
  try {
    advancedStats = typeof fund.advanced_stats === 'string' ? JSON.parse(fund.advanced_stats) : (fund.advanced_stats || []);
  } catch(e) {}

  let holdings = [];
  try {
    const raw = typeof fund.detailed_holdings === 'string' ? JSON.parse(fund.detailed_holdings) : (fund.detailed_holdings || []);
    holdings = raw.map((h: any) => ({
      name: h.company_name,
      size: parseFloat(h.corpus_per) || 0,
      sector: h.sector_name || 'Other'
    })).filter((h: any) => h.size > 0);
  } catch(e) {}

  const radarData = advancedStats.slice(0, 5).map((s: any) => ({
    metric: s.name,
    value: parseFloat(s.value) || 0
  }));

  return (
    <div className="flex flex-col h-full bg-canvas text-text-primary overflow-y-auto">
      <div className="sticky top-0 bg-surface/80 backdrop-blur-md border-b border-border z-10 p-4">
        <Link to="/mutual-funds" className="flex items-center text-sm font-bold text-text-secondary hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Mutual Funds
        </Link>
      </div>

      <div className="p-6 md:p-10 max-w-7xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-4">
          {fund.logo_url ? (
            <img src={fund.logo_url} alt="Logo" className="w-16 h-16 rounded-full bg-white object-contain border border-border" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-surface-hover flex items-center justify-center font-bold text-xl text-text-secondary border border-border">
              {fund.amc ? fund.amc.substring(0, 2) : 'MF'}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-black tracking-tight">{fund.fund_name || fund.scheme_name}</h1>
            <p className="text-text-secondary font-medium">{fund.amc} • {fund.category} • {fund.sub_category}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface border border-border p-5 rounded-xl">
            <div className="text-xs text-text-secondary font-bold uppercase tracking-widest mb-1">AUM</div>
            <div className="text-2xl font-mono">₹{fund.aum} Cr</div>
          </div>
          <div className="bg-surface border border-border p-5 rounded-xl">
            <div className="text-xs text-text-secondary font-bold uppercase tracking-widest mb-1">Expense Ratio</div>
            <div className={`text-2xl font-mono ${fund.expense_ratio > 1 ? 'text-beta' : 'text-alpha'}`}>{fund.expense_ratio}%</div>
          </div>
          <div className="bg-surface border border-border p-5 rounded-xl">
            <div className="text-xs text-text-secondary font-bold uppercase tracking-widest mb-1">Risk Rating</div>
            <div className="text-2xl font-mono">{fund.risk || fund.risk_rating || 'Moderate'}</div>
          </div>
          <div className="bg-surface border border-border p-5 rounded-xl">
            <div className="text-xs text-text-secondary font-bold uppercase tracking-widest mb-1">3Y Return</div>
            <div className="text-2xl font-mono text-alpha">+{fund.return3y}%</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-1 lg:col-span-2">
            <MutualFundPriceChart fund={fund} />
          </div>

          <div className="space-y-6">
            <div className="bg-surface border border-border rounded-xl p-6 h-80 flex flex-col">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest mb-4 flex items-center gap-2 shrink-0">
                <Activity size={16} className="text-indigo-400" /> Advanced Stats
              </h3>
              <div className="flex-1 min-h-0">
                {radarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#2D3748" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: '#A0AEC0', fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={['auto', 'auto']} tick={false} axisLine={false} />
                      <Radar name="Fund" dataKey="value" stroke="#6366F1" fill="#6366F1" fillOpacity={0.5} />
                      <RechartsTooltip contentStyle={{ backgroundColor: '#1A202C', borderColor: '#2D3748', borderRadius: '8px' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-text-secondary text-sm">No advanced stats available</div>
                )}
              </div>
            </div>

            <div className="bg-surface border border-border rounded-xl p-6 h-80 flex flex-col">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest mb-4 flex items-center gap-2 shrink-0">
                <BarChart2 size={16} className="text-alpha" /> Holdings Allocation
              </h3>
              <div className="flex-1 min-h-0">
                {holdings.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                      data={holdings}
                      dataKey="size"
                      aspectRatio={4 / 3}
                      stroke="#1A202C"
                      fill="#3B82F6"
                    >
                      <RechartsTooltip contentStyle={{ backgroundColor: '#1A202C', borderColor: '#2D3748', borderRadius: '8px' }} />
                    </Treemap>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-text-secondary text-sm">
                    <ShieldAlert size={24} className="mb-2 opacity-50" />
                    No holdings data available
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
