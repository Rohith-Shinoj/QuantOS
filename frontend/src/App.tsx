import { BrowserRouter as Router, Routes, Route, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks, fetchMutualFunds } from './api';
import { CompanySnapshot } from './pages/CompanySnapshot';
import { Screener } from './pages/Screener';

import { MarketHeatmap } from './pages/MarketHeatmap';
import { PairTrading } from './pages/PairTrading';
import { PortfolioTracker } from './pages/PortfolioTracker';
import { Watchlists } from './pages/Watchlists';
import { LandingPage } from './pages/LandingPage';
import { ETFs } from './pages/ETFs';
import { ETFSnapshot } from './pages/ETFSnapshot';
import { AIResearchDesk } from './pages/AIResearchDesk';
import { MutualFunds } from './pages/MutualFunds';
import { MutualFundSnapshot } from './pages/MutualFundSnapshot';
import { TerminalLayout } from './layouts/TerminalLayout';
import { useAppStore } from './store';

import { TopNavigation } from './components/TopNavigation';
// Layout Component
const Layout = () => {
  return (
    <div className="flex flex-col h-screen bg-canvas text-text-primary overflow-hidden">
      <TopNavigation />
      <main className="flex-1 overflow-auto flex flex-col min-h-0 relative">
        <Outlet />
      </main>
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

          <Route path="heatmap" element={<MarketHeatmap />} />
          <Route path="screener" element={<Screener />} />
          <Route path="pairs" element={<PairTrading />} />
          <Route path="portfolio" element={<PortfolioTracker />} />
          <Route path="mutual-funds" element={<MutualFunds />} />
          <Route path="watchlists" element={<Watchlists />} />
          <Route path="/stocks/:slug" element={<TerminalLayout />} />
          <Route path="/etf" element={<ETFs />} />
          <Route path="/etf/:slug" element={<ETFSnapshot />} />

          <Route path="/mutual-funds/:slug" element={<MutualFundSnapshot />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
