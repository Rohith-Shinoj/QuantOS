import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
      navigate(`/terminal/${selectedStockSlug}`, { replace: true });
    }
  }, [slug, selectedStockSlug, setSelectedStockSlug, navigate]);

  // Active stock data
  const { data: stockData } = useQuery({ 
    queryKey: ['stockData', selectedStockSlug], 
    queryFn: () => fetchStockData(selectedStockSlug),
    enabled: !!selectedStockSlug
  });
  
  const abs = stockData?.absolute;
  const isDelisted = abs?.['live price'] === '₹0.00' || abs?.['live price'] === '0.00';  return (
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
              <div className="w-full h-full flex flex-col overflow-y-auto bg-canvas">
                
                {/* Central Canvas (Chart) */}
                <div className="w-full min-h-[600px] flex flex-col relative shrink-0">
                  {centralMode === 'PRICE' && stockData && <MultidimensionalChart data={stockData} setIsAIOverlayOpen={setIsAIOverlayOpen} />}
                  {centralMode === 'PAIRS' && <PairTrading isPanel initialAssetA={slug} />}
                </div>

                {/* Bottom Panel (Quantitative Analytics Grid) */}
                {!isDelisted && (
                  <div className="w-full min-h-[600px] bg-surface border-t border-border flex flex-col shrink-0">
                    <div className="h-10 border-b border-border flex items-center px-4 shrink-0 bg-surface">
                      <div className="flex gap-4">
                        <div className="text-xs font-bold h-10 flex items-center text-alpha border-b-2 border-alpha">
                          Quantitative Analytics Grid
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                       {stockData ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[400px] [&>*]:min-h-0">
                           <FinancialHealth data={stockData} />
                           <ValuationGauges data={stockData} />
                           <OwnershipTrends data={stockData} />
                           <EarningsQuality data={stockData} />
                           <FactorAttribution data={stockData} />
                           <DeepFinancials data={stockData} />
                           <NewsSentiment data={stockData} />
                           {selectedStockSlug && <RelatedStocks slug={selectedStockSlug} />}
                           {selectedStockSlug && <BrokerTargets slug={selectedStockSlug} />}
                         </div>
                       ) : (
                         <div className="w-full h-full flex items-center justify-center text-text-secondary text-sm">Loading analytics...</div>
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
