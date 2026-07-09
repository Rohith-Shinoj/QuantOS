import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { GlobalSearch } from './GlobalSearch';
import { Activity, Target, Search, LineChart, BrainCircuit, RefreshCw, Lock } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchAllStocks } from '../api';

export const TopNavigation = () => {
  const location = useLocation();
  const queryClient = useQueryClient();
  const isLandingPage = location.pathname === '/';
  
  // Admin Toggle Logic
  const searchParams = new URLSearchParams(location.search);
  const secretKey = import.meta.env.VITE_ADMIN_KEY;
  if (secretKey && searchParams.get('key') === secretKey) {
    localStorage.setItem('admin_mode', 'true');
  } else if (searchParams.get('key') === 'lock') {
    localStorage.removeItem('admin_mode');
  }
  const isAdmin = localStorage.getItem('admin_mode') === 'true';
  
  const navItems = [
    { name: 'Home', path: '/', icon: <Activity size={16} /> },
    { name: 'Heatmap', path: '/heatmap', icon: <Activity size={16} /> },
    { name: 'Discover & Screen', path: '/screener', icon: <Target size={16} /> },
    { name: 'Watchlists & Alerts', path: '/watchlists', icon: <Search size={16} /> },
    { name: 'Pairs Trading', path: '/pairs', icon: <LineChart size={16} /> },
    { name: 'Portfolio Analyzer', path: '/portfolio', icon: <Search size={16} /> },
    { name: 'Mutual Funds', path: '/mutual-funds', icon: <LineChart size={16} /> },
  ];

  const handleSync = async () => {
    await queryClient.invalidateQueries({ queryKey: ['allStocks'] });
    await fetchAllStocks();
  };

  return (
    <header className="h-14 border-b border-border bg-surface flex items-center px-4 justify-between shrink-0 select-none z-50 w-full">
      <div className="flex items-center gap-2 flex-1">
        {/* Global Search */}
        <GlobalSearch className="w-80 shrink-0" />

        {/* Navigation Links */}
        <nav className="flex items-center gap-2 overflow-x-auto custom-scrollbar flex-1">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap
                  ${isActive 
                    ? 'bg-surface-hover text-text-primary border border-border/50' 
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover/50 border border-transparent'
                  }`}
              >
                {item.icon}
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-2">
        {isAdmin ? (
          <Link 
            to="/ai-research"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/20 transition-all shadow-[0_0_10px_rgba(99,102,241,0.15)]"
          >
            <BrainCircuit size={16} /> AI Research
          </Link>
        ) : (
          <div className="group relative">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-surface border border-border text-text-secondary opacity-50 cursor-not-allowed">
              <BrainCircuit size={16} /> AI Research <Lock size={12} className="ml-1 opacity-70" />
            </div>
            <div className="absolute top-full mt-2 right-0 bg-[#1e1e24] border border-white/10 p-2 rounded text-[10px] w-48 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-text-secondary font-mono pointer-events-none text-right">
              Due to increased demand, AI Analyst Desk is currently restricted to Enterprise / Internal use only.
            </div>
          </div>
        )}
        
        {isLandingPage && (
          <button 
            onClick={handleSync}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover hover:bg-border border border-border rounded text-[10px] font-semibold text-text-primary transition-all shrink-0"
          >
            <RefreshCw size={12} />
            Sync
          </button>
        )}
      </div>
    </header>
  );
};
