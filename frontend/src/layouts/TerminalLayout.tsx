import React, { useState, useEffect } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { Skeleton } from '../components/Skeleton';
import { Search, Maximize2, Minimize2, Activity, Hexagon, Target, Settings, ActivitySquare, ArrowUpRight, ArrowDownRight, BrainCircuit } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../store';
import { AIAssistantOverlay } from '../components/AIAssistantOverlay';

import { MultidimensionalChart } from '../pages/CompanySnapshot/MultidimensionalChart';
import { DeepFinancials } from '../pages/CompanySnapshot/DeepFinancials';
import { PeerComparison } from '../pages/CompanySnapshot/PeerComparison';
import { FinancialHealth } from '../pages/CompanySnapshot/FinancialHealth';
import { ValuationGauges } from '../pages/CompanySnapshot/ValuationGauges';
import { OwnershipTrends } from '../pages/CompanySnapshot/OwnershipTrends';
import { EarningsQuality } from '../pages/CompanySnapshot/EarningsQuality';
import { FactorAttribution } from '../pages/CompanySnapshot/FactorAttribution';

import { MacroResilience } from '../pages/CompanySnapshot/MacroResilience';
import { NewsSentiment } from '../pages/CompanySnapshot/NewsSentiment';
import { RelatedStocks } from '../pages/CompanySnapshot/RelatedStocks';
import { BrokerTargets } from '../pages/CompanySnapshot/BrokerTargets';
import { PairTrading } from '../pages/PairTrading';
import { Watchlists } from '../pages/Watchlists';
import { StockLogo } from '../components/StockLogo';
import { fetchAllStocks, fetchStockData } from '../api';

import { GlobalSearch } from '../components/GlobalSearch';


export const TerminalLayout = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { selectedStockSlug, setSelectedStockSlug, centralMode, setCentralMode } = useAppStore();
  
  const [isAIOverlayOpen, setIsAIOverlayOpen] = useState(false);

  // Sync URL -> Store
  useEffect(() => {
    if (slug && slug !== selectedStockSlug) {
      setSelectedStockSlug(slug);
    } else if (!slug && selectedStockSlug) {
      navigate(`/stocks/${selectedStockSlug}`, { replace: true });
    }
  }, [slug, selectedStockSlug, setSelectedStockSlug, navigate]);

  // Active stock data
  const { data: stockData } = useQuery({ 
    queryKey: ['stockData', selectedStockSlug], 
    queryFn: () => fetchStockData(selectedStockSlug),
    enabled: !!selectedStockSlug
  });
  
  const abs = stockData?.absolute;
  const livePriceStr = String(abs?.['live price'] || '');
  const priceVal = parseFloat(livePriceStr.replace(/[^\d.]/g, '')) || 0;
  const isDelisted = stockData ? priceVal === 0 : false;
  
  return (
    <div className="flex flex-col h-screen w-full bg-canvas text-text-primary overflow-hidden text-sm">
      {/* Main Workspace (Panel Group) */}
      <div className="flex-1 min-h-0 flex">
        


        {/* Resizable Grid */}
        <div className="flex-1 w-full h-full relative">
          <AIAssistantOverlay 
            ticker={abs?.ticker} 
            isOpen={isAIOverlayOpen} 
            onClose={() => setIsAIOverlayOpen(false)} 
            displayName={abs?.name}
            internalPrompt={`Provide a verified expert investment breakdown for ${abs?.ticker} including Executive Analysis, Catalyst Path, Risk Asymmetry, and Execution Roadmap.`}
          />
              <div className="w-full h-full flex flex-col overflow-y-auto bg-canvas custom-scrollbar p-6">
                
                {/* Central Canvas (Chart) */}
                <div className="w-full min-h-[600px] flex flex-col relative shrink-0 mb-6">
                  {centralMode === 'PRICE' && stockData && <MultidimensionalChart data={stockData} setIsAIOverlayOpen={setIsAIOverlayOpen} />}
                  {centralMode === 'PRICE' && !stockData && (
                    <div className="w-full h-full min-h-[600px] rounded-xl bg-surface border border-border overflow-hidden flex flex-col">
                       <div className="h-16 border-b border-border/50 p-4 flex items-center justify-between">
                          <div className="flex gap-4">
                            <Skeleton className="w-24 h-8 rounded" />
                            <Skeleton className="w-24 h-8 rounded" />
                          </div>
                          <Skeleton className="w-32 h-8 rounded" />
                       </div>
                       <div className="flex-1 p-6 flex flex-col gap-4">
                          <div className="flex gap-4">
                            <Skeleton className="w-48 h-20 rounded" />
                            <Skeleton className="w-32 h-20 rounded" />
                          </div>
                          <Skeleton className="w-full flex-1 rounded" />
                       </div>
                    </div>
                  )}
                  {centralMode === 'PAIRS' && <PairTrading isPanel initialAssetA={slug} />}
                </div>

                {/* Bottom Panel (Quantitative Analytics Grid) */}
                {!isDelisted && (
                  <div className="w-full min-h-[600px] flex flex-col shrink-0 pb-24">
                    <div className="mb-6 flex items-center">
                      <div className="text-sm font-bold text-text-primary">
                        Quantitative Analytics Grid
                      </div>
                    </div>
                    <div>
                       {stockData ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[480px] [&>*]:min-h-0">
                           <FinancialHealth data={stockData} />
                           <ValuationGauges data={stockData} />
                           <OwnershipTrends data={stockData} />
                           <EarningsQuality data={stockData} />
                           <FactorAttribution data={stockData} />
                           <DeepFinancials data={stockData} />
                           <NewsSentiment data={stockData} />
                           <MacroResilience data={stockData} />
                           {selectedStockSlug && <RelatedStocks slug={selectedStockSlug} />}
                           {selectedStockSlug && <BrokerTargets slug={selectedStockSlug} />}
                         </div>
                       ) : (
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[480px]">
                           {[...Array(9)].map((_, i) => (
                             <div key={i} className="bg-surface border border-border rounded-xl flex flex-col overflow-hidden h-[480px]">
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
                       )}
                    </div>
                  </div>
                )}

              </div>
        </div>

      </div>
    </div>
  );
};
