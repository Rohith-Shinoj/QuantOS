import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchStockData } from '../../api';
import { PriceChart } from './PriceChart';
import { FinancialHealth } from './FinancialHealth';
import { OwnershipTrends } from './OwnershipTrends';
import { EarningsQuality } from './EarningsQuality';
import { FactorAttribution } from './FactorAttribution';
import { NewsSentiment } from './NewsSentiment';
import { MacroResilience } from './MacroResilience';
import { RelatedStocks } from './RelatedStocks';
import { PeerComparison } from './PeerComparison';
import { DeepFinancials } from './DeepFinancials';
import { ValuationGauges } from './ValuationGauges';
import { AdvancedCharting } from './AdvancedCharting';
import { BrokerTargets } from './BrokerTargets';
import { useAppStore } from '../../store';
import { Skeleton } from '../../components/Skeleton';

import { MultidimensionalChart } from './MultidimensionalChart';

export const CompanySnapshot = () => {
  const { slug } = useParams<{ slug: string }>();
  const { setSelectedStockSlug } = useAppStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'peers' | 'chart'>('overview');
  
  useEffect(() => {
    if (slug) {
      setSelectedStockSlug(slug);
    }
  }, [slug, setSelectedStockSlug]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['stock', slug],
    queryFn: () => fetchStockData(slug as string),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col gap-6 w-full h-full pb-24 flex-1">
        <div className="w-full h-24 rounded-xl bg-surface border border-border flex items-center p-6 gap-4">
           <Skeleton className="w-16 h-16 rounded-full" />
           <div className="flex flex-col gap-2">
             <Skeleton className="w-48 h-6 rounded" />
             <Skeleton className="w-24 h-4 rounded" />
           </div>
        </div>
        
        <div className="flex border-b border-border/50 mb-2 gap-6 pb-2">
          <Skeleton className="h-8 w-32 rounded" />
          <Skeleton className="h-8 w-32 rounded" />
          <Skeleton className="h-8 w-32 rounded" />
          <Skeleton className="h-8 w-32 rounded" />
        </div>

        <div className="w-full h-[500px] rounded-xl bg-surface border border-border p-6 flex flex-col gap-4">
           <Skeleton className="w-48 h-8 rounded" />
           <Skeleton className="w-full flex-1 rounded bg-gradient-to-t from-surface-hover/20 to-transparent" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[480px]">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl flex flex-col overflow-hidden h-full">
               <div className="p-4 border-b border-border/50">
                  <Skeleton className="w-40 h-5 mb-2 rounded" />
                  <Skeleton className="w-24 h-3 rounded opacity-50" />
               </div>
               <div className="flex-1 p-4 flex flex-col gap-4">
                  <Skeleton className="w-full flex-1 rounded bg-gradient-to-t from-surface-hover/20 to-transparent" />
                  <div className="flex justify-between">
                     <Skeleton className="w-16 h-4 rounded" />
                     <Skeleton className="w-16 h-4 rounded" />
                  </div>
               </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-beta">Error loading stock data.</div>;
  }

  return (
    <div className="flex flex-col w-full h-full bg-canvas text-text-primary flex-1">
      <div className="p-6 flex flex-col gap-6 w-full h-full pb-24 overflow-y-auto custom-scrollbar">
      
      {/* Tabs */}
      <div className="flex border-b border-border mb-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'Snapshot Overview' },
          { id: 'financials', label: 'Deep Financials' },
          { id: 'peers', label: 'Peer Comparison' },
          { id: 'chart', label: 'Advanced Chart' }
        ].map(tab => (
           <button 
             key={tab.id} 
             onClick={() => setActiveTab(tab.id as any)}
             className={`px-6 py-3 uppercase font-bold text-xs tracking-wider border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-alpha text-alpha' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
           >
             {tab.label}
           </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">
          <div className="h-[600px] w-full shrink-0">
            <MultidimensionalChart data={data} />
          </div>
          <BrokerTargets slug={slug as string} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[480px] [&>*]:min-h-0">
            <FinancialHealth data={data} />
            <ValuationGauges data={data} />
            <OwnershipTrends data={data} />
            <EarningsQuality data={data} />
            <FactorAttribution data={data} />
            <MacroResilience data={data} />
            <NewsSentiment data={data} />
            <RelatedStocks slug={slug as string} />
          </div>
        </div>
      )}

      {activeTab === 'financials' && (
        <DeepFinancials data={data} />
      )}

      {activeTab === 'peers' && (
        <PeerComparison data={data} />
      )}

      {activeTab === 'chart' && (
        <AdvancedCharting data={data} />
      )}
      </div>
    </div>
  );
};
