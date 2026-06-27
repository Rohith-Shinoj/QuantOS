import { BrowserRouter as Router, Routes, Route, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Activity, LayoutDashboard, LineChart, Target, FileText, Search } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks, fetchMutualFunds } from './api';
import { CompanySnapshot } from './pages/CompanySnapshot';
import { Screener } from './pages/Screener';
import { MarketOverview } from './pages/MarketOverview';
import { MarketHeatmap } from './pages/MarketHeatmap';
import { PairTrading } from './pages/PairTrading';
import { PortfolioTracker } from './pages/PortfolioTracker';
import { Watchlists } from './pages/Watchlists';
import { LandingPage } from './pages/LandingPage';
import { AIResearchDesk } from './pages/AIResearchDesk';
import { MutualFunds } from './pages/MutualFunds';
import { MutualFundSnapshot } from './pages/MutualFundSnapshot';
import { TerminalLayout } from './layouts/TerminalLayout';
import { useAppStore } from './store';

import { GlobalSearch } from './components/GlobalSearch';
// Layout Component
const Layout = () => {
  const { selectedStockSlug } = useAppStore();
  const location = useLocation();
  const isLandingPage = location.pathname === '/';

  if (isLandingPage) {
    return (
      <div className="flex h-screen bg-canvas text-text-primary overflow-auto smooth-scroll">
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-canvas text-text-primary overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className={`border-r border-border bg-surface flex flex-col shrink-0 transition-all duration-300 z-40 ${location.pathname === '/portfolio' ? 'hidden' : 'w-16 lg:w-64'}`}>
        <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-border shrink-0">
          <img src="../../logo-nobg.png" alt="Finugreek" className="h-8 w-auto object-contain" />
        </div>

        <nav className="flex-1 overflow-y-auto py-6 flex flex-col gap-2 px-2 lg:px-3">
          <Link to="/" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors group">
            <LayoutDashboard size={20} className="shrink-0" />
            <span className="text-sm font-medium hidden lg:block">Home</span>
          </Link>
          <Link to="/ai-research" className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors group border border-indigo-500/20">
            <Activity size={20} className="shrink-0" />
            <span className="text-sm font-medium hidden lg:block">AI Research Desk</span>
          </Link>
          <Link to="/overview" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors group">
            <Activity size={20} className="shrink-0" />
            <span className="text-sm font-medium hidden lg:block">Macro Overview</span>
          </Link>
          <Link to="/heatmap" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors group">
            <Activity size={20} className="shrink-0" />
            <span className="text-sm font-medium hidden lg:block">Heatmap</span>
          </Link>
          <Link to="/screener" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors group">
            <Target size={20} className="shrink-0" />
            <span className="text-sm font-medium hidden lg:block">Discover & Screen</span>
          </Link>
          <Link to="/watchlists" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors group">
            <Search size={20} className="shrink-0" />
            <span className="text-sm font-medium hidden lg:block">Watchlists & Alerts</span>
          </Link>
          <Link to="/pairs" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors group">
            <LineChart size={20} className="shrink-0" />
            <span className="text-sm font-medium hidden lg:block">Pairs Trading</span>
          </Link>
          <Link to="/portfolio" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors group">
            <Search size={20} className="shrink-0" />
            <span className="text-sm font-medium hidden lg:block">Portfolio Analyzer</span>
          </Link>
          <Link to="/mutual-funds" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors group">
            <LineChart size={20} className="shrink-0" />
            <span className="text-sm font-medium hidden lg:block">Mutual Funds</span>
          </Link>
        </nav>
      </aside>

      {/* Main Content Area Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 bg-canvas">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-canvas flex items-center px-6 justify-between shrink-0 z-30">
          <div className="flex-1" />
          <div className="flex-1 flex justify-end">
            <GlobalSearch />
          </div>
        </header>
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto flex flex-col min-h-0 relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
};


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<LandingPage />} />
          <Route path="ai-research" element={<AIResearchDesk />} />
          <Route path="overview" element={<MarketOverview />} />
          <Route path="heatmap" element={<MarketHeatmap />} />
          <Route path="screener" element={<Screener />} />
          <Route path="pairs" element={<PairTrading />} />
          <Route path="portfolio" element={<PortfolioTracker />} />
          <Route path="mutual-funds" element={<MutualFunds />} />
          <Route path="watchlists" element={<Watchlists />} />
        </Route>
        <Route path="/terminal/:slug" element={<TerminalLayout />} />
        <Route path="/mutual-funds/:code" element={<MutualFundSnapshot />} />
      </Routes>
    </Router>
  );
}

export default App;
