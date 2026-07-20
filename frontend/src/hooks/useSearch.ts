import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSearchIndex } from '../api';

export interface SearchResult {
  item: any;
  score: number;
  type: 'Stock' | 'ETF' | 'Mutual Fund';
  slug: string;
  title: string;
  subtitle: string;
  navPath: string;
  logoTicker?: string;
  logoUrl?: string;
}

export function useSearch(query: string, activeFilter: string | string[] = 'All') {
  const [shouldFetch, setShouldFetch] = useState(false);
  
  useEffect(() => {
    // Sequence the heavy search dictionary downloads 2.5s AFTER the app loads
    const timer = setTimeout(() => setShouldFetch(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  const { data: searchIndex } = useQuery({ 
    queryKey: ['searchIndex'], 
    queryFn: fetchSearchIndex,
    enabled: shouldFetch,
    staleTime: Infinity
  });

  const results = useMemo(() => {
    if (!query || query.trim().length === 0 || !searchIndex) return [];
    
    const q = query.toLowerCase().trim();
    const qNormalized = q.replace(/[\s-]/g, '');
    const tokens = q.split(/\s+/);
    
    const combined = searchIndex.map((s: any) => {
      let score = 0;
      const ticker = s.ticker ? s.ticker.toLowerCase() : '';
      const name = s.name ? s.name.toLowerCase() : '';
      const nameNormalized = name.replace(/[\s-]/g, '');
      const slugNormalized = s.slug ? s.slug.replace(/[\s-]/g, '') : '';
      
      if (ticker === q || ticker === qNormalized) score = 100;
      else if (name === q || nameNormalized === qNormalized) score = 90;
      else if (ticker.startsWith(q) || ticker.startsWith(qNormalized)) score = 80;
      else if (name.startsWith(q) || nameNormalized.startsWith(qNormalized)) score = 70;
      else if (ticker.includes(q) || ticker.includes(qNormalized)) score = 60;
      else if (name.includes(q) || nameNormalized.includes(qNormalized)) score = 50;
      else if (slugNormalized.includes(qNormalized)) score = 45;
      else if (tokens.every(token => ticker.includes(token) || name.includes(token) || nameNormalized.includes(token))) score = 40;
      
      const navPath = s.type === 'ETF' ? `/etf/${s.slug}` : s.type === 'Mutual Fund' ? `/mutual-funds/${s.slug}` : `/stocks/${s.slug}`;
      
      return { 
        item: s, 
        score, 
        type: s.type,
        slug: s.slug,
        title: s.type === 'Mutual Fund' ? s.name : s.ticker,
        subtitle: s.type === 'Mutual Fund' ? 'Mutual Fund' : s.name,
        navPath,
        logoTicker: s.type === 'Mutual Fund' ? s.slug : s.ticker
      };
    });
    
    const sortedResults = combined
      .filter((res: any) => res.score > 0)
      .filter((res: any) => {
        if (activeFilter === 'All' || (Array.isArray(activeFilter) && activeFilter.includes('All'))) return true;
        
        const filterArray = Array.isArray(activeFilter) ? activeFilter : [activeFilter];
        const mappedFilters = filterArray.map(f => f === 'Mutual Funds' ? 'Mutual Fund' : f === 'Stocks' ? 'Stock' : f === 'ETFs' ? 'ETF' : f);
        
        return mappedFilters.includes(res.type);
      })
      .sort((a: any, b: any) => b.score - a.score);

    const seen = new Set();
    const uniqueResults = [];
    for (const res of sortedResults) {
      if (!seen.has(res.slug)) {
        seen.add(res.slug);
        uniqueResults.push(res);
        if (uniqueResults.length >= 50) break;
      }
    }
    return uniqueResults;
  }, [query, searchIndex, activeFilter]);

  return results;
}
