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



  return (
    <div className="flex flex-col h-screen w-full bg-canvas text-text-primary overflow-hidden text-sm">
      
      {/* Top Navbar */}
      <header className="h-12 border-b border-border bg-surface flex items-center px-4 justify-between shrink-0 select-none">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Hexagon size={20} className="text-alpha" />
            <span className="font-bold text-white tracking-tight">Q<span className="text-alpha">OS</span></span>
          </div>
          
          <GlobalSearch />
        </div>

        <div className="flex flex-1 justify-center gap-1">
          <button 
            onClick={() => setCentralMode('PRICE')}
            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${centralMode === 'PRICE' ? 'bg-alpha/20 text-alpha' : 'text-text-secondary hover:text-white hover:bg-surface-hover'}`}
          >
            Price Action
          </button>
          <button 
            onClick={() => setCentralMode('PAIRS')}
            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${centralMode === 'PAIRS' ? 'bg-alpha/20 text-alpha' : 'text-text-secondary hover:text-white hover:bg-surface-hover'}`}
          >
            Pair Trading
          </button>
          
          <div className="h-6 w-[1px] bg-border mx-2 self-center"></div>
          
          <button 
            onClick={() => setIsAIOverlayOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/20 transition-all shadow-[0_0_10px_rgba(99,102,241,0.15)]"
          >
            <BrainCircuit size={14} /> AI Analysis
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button className="text-text-secondary hover:text-white transition-colors" title="Settings"><Settings size={18} /></button>
          <div className="w-8 h-8 rounded-full bg-surface-hover border border-border flex items-center justify-center font-bold text-xs text-alpha">
            USR
          </div>
        </div>
      </header>

      {/* Main Workspace (Panel Group) */}
      <div className="flex-1 min-h-0 flex">
        
        {/* Left Thin Toolbar */}
        <div className="w-12 border-r border-border bg-surface flex flex-col items-center py-4 gap-4 shrink-0">
          <button className="text-text-secondary hover:text-white p-2 rounded hover:bg-surface-hover transition-colors" title="Macro Overview" onClick={() => navigate('/overview')}>
            <ActivitySquare size={20} />
          </button>
          <button className="text-text-secondary hover:text-white p-2 rounded hover:bg-surface-hover transition-colors" title="Stock Screener" onClick={() => navigate('/screener')}>
            <Target size={20} />
          </button>
        </div>

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
                  {centralMode === 'PRICE' && stockData && <MultidimensionalChart data={stockData} />}
                  {centralMode === 'PAIRS' && <PairTrading isPanel initialAssetA={slug} />}
                </div>

                {/* Bottom Panel (Quantitative Analytics Grid) */}
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
                       </div>
                     ) : (
                       <div className="w-full h-full flex items-center justify-center text-text-secondary text-sm">Loading analytics...</div>
                     )}
                  </div>
                </div>

              </div>
        </div>

      </div>
    </div>
  );
};
