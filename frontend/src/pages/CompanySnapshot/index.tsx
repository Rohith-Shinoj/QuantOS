import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchStockData } from '../../api';
import { TopStrip } from './TopStrip';
import { PriceChart } from './PriceChart';
import { FinancialHealth } from './FinancialHealth';
import { OwnershipTrends } from './OwnershipTrends';
import { EarningsQuality } from './EarningsQuality';
import { FactorAttribution } from './FactorAttribution';
import { NewsSentiment } from './NewsSentiment';
import { RelatedStocks } from './RelatedStocks';
import { PeerComparison } from './PeerComparison';
import { DeepFinancials } from './DeepFinancials';
import { AdvancedCharting } from './AdvancedCharting';
import { useAppStore } from '../../store';

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
      <div className="p-8 animate-pulse flex flex-col gap-6">
        <div className="h-24 bg-surface rounded-lg"></div>
        <div className="h-96 bg-surface rounded-lg"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="h-72 bg-surface rounded-lg"></div>
          <div className="h-72 bg-surface rounded-lg"></div>
          <div className="h-72 bg-surface rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-beta">Error loading stock data.</div>;
  }

  return (
    <div className="p-6 flex flex-col gap-6 w-full h-full pb-24 flex-1">
      <TopStrip data={data} />
      
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
        <>
          <PriceChart data={data} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[400px] [&>*]:min-h-0">
            <FinancialHealth data={data} />
            <OwnershipTrends data={data} />
            <EarningsQuality data={data} />
            <FactorAttribution data={data} />
            <NewsSentiment data={data} />
            <RelatedStocks slug={slug as string} />
          </div>
        </>
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
  );
};
