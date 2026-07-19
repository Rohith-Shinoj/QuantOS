import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { GlobalSearch } from './GlobalSearch';
import { Activity, Target, Search, LineChart, BrainCircuit, Map, RefreshCw, Lock, Briefcase, Sun, Moon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchAllStocks } from '../api';

export const TopNavigation = () => {
  const location = useLocation();
  const queryClient = useQueryClient();
  const isLandingPage = location.pathname === '/';
  
  const [isDark, setIsDark] = React.useState(() => {
    return localStorage.getItem('theme') !== 'light';
  });

  React.useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);
  
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
    { name: 'Heatmap', path: '/heatmap', icon: <Map size={16} /> },
    { name: 'ETFs', path: '/etf', icon: <Target size={16} /> },
    { name: 'Mutual Funds', path: '/mutual-funds', icon: <LineChart size={16} /> },
    { name: 'Screen', path: '/screener', icon: <Target size={16} /> },
    { name: 'Watchlists', path: '/watchlists', icon: <Search size={16} /> },
    { name: 'Pairs Trading', path: '/pairs', icon: <LineChart size={16} /> },
    { name: 'Portfolio Analyzer', path: '/portfolio', icon: <Briefcase size={16} /> }
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
            const isPortfolio = item.path === '/portfolio';
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap
                  ${
                    isPortfolio
                      ? isActive
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow-[0_0_8px_rgba(168,85,247,0.35)]'
                        : 'text-purple-300 border border-purple-500/30 hover:bg-purple-500/10 hover:shadow-[0_0_6px_rgba(168,85,247,0.25)] shadow-[0_0_4px_rgba(168,85,247,0.15)]'
                      : isActive 
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-purple-500/10 text-purple-300 border border-purple-500/40 hover:bg-purple-500/20 transition-all shadow-[0_0_10px_rgba(168,85,247,0.3)] hover:shadow-[0_0_14px_rgba(168,85,247,0.5)]"
          >
            <BrainCircuit size={14} /> Ask AI
          </Link>
        ) : (
          <div className="group relative">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-surface border border-border text-text-secondary opacity-50 cursor-not-allowed">
              <BrainCircuit size={14} /> Ask AI <Lock size={12} className="ml-1 opacity-70" />
            </div>
            <div className="absolute top-full mt-2 right-0 bg-surface-hover border border-border p-2 rounded text-[10px] w-48 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-text-secondary font-mono pointer-events-none text-right">
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

        <button
          onClick={() => setIsDark(!isDark)}
          className="flex items-center justify-center w-8 h-8 rounded bg-surface-hover hover:bg-border border border-border text-text-primary transition-all shrink-0 ml-1"
          title="Toggle Theme"
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  );
};
