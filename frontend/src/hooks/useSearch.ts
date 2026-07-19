import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks, fetchMutualFunds, fetchETFs } from '../api';

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
  const { data: stocks } = useQuery({ queryKey: ['allStocks'], queryFn: fetchAllStocks });
  const { data: etfs } = useQuery({ queryKey: ['allETFsSearch'], queryFn: fetchETFs });
  const { data: mfsResp } = useQuery({ queryKey: ['allMFsSearch'], queryFn: () => fetchMutualFunds({ limit: 5000, minimal: true }) });
  const mfs = (mfsResp as any)?.data;

  const results = useMemo(() => {
    if (!query || query.trim().length === 0) return [];
    
    const q = query.toLowerCase().trim();
    const qNormalized = q.replace(/[\s-]/g, '');
    const tokens = q.split(/\s+/);
    let combined: SearchResult[] = [];
    
    if (stocks) {
      const stockResults = stocks.map((s: any) => {
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
        
        const type = 'Stock';
        
        return { 
          item: s, 
          score, 
          type,
          slug: s.slug,
          title: s.ticker,
          subtitle: s.name,
          navPath: `/stocks/${s.slug}`,
          logoTicker: s.ticker
        };
      });
      combined = combined.concat(stockResults);
    }

    if (etfs) {
      const etfResults = etfs.map((s: any) => {
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
        
        return { 
          item: s, 
          score, 
          type: 'ETF' as const,
          slug: s.slug,
          title: s.ticker,
          subtitle: s.name,
          navPath: `/etf/${s.slug}`,
          logoTicker: s.ticker,
          logoUrl: s.header?.logoUrl
        };
      });
      combined = combined.concat(etfResults);
    }
    
    if (mfs) {
      const mfResults = mfs.map((m: any) => {
        let score = 0;
        const sname = m.scheme_name ? m.scheme_name.toLowerCase() : '';
        const fname = m.fund_name ? m.fund_name.toLowerCase() : '';
        const sid = m.search_id ? m.search_id.toLowerCase() : '';
        
        if (sname === q || fname === q || sid === q) score = 100;
        else if (sname.startsWith(q) || fname.startsWith(q) || sid.startsWith(q)) score = 80;
        else if (sname.includes(q) || fname.includes(q) || sid.includes(q)) score = 60;
        else if (tokens.every(token => sname.includes(token) || fname.includes(token) || sid.includes(token))) score = 40;
        
        const slug = m.scheme_code || m.direct_search_id || m.search_id;

        return {
          item: m,
          score,
          type: 'Mutual Fund' as const,
          slug: slug,
          title: m.fund_name || m.scheme_name,
          subtitle: m.category,
          navPath: `/mutual-funds/${slug}`,
          logoTicker: slug,
          logoUrl: m.logo_url
        };
      });
      combined = combined.concat(mfResults);
    }
    
    const sortedResults = combined
      .filter((res) => res.score > 0)
      .filter((res) => {
        if (activeFilter === 'All' || (Array.isArray(activeFilter) && activeFilter.includes('All'))) return true;
        
        const filterArray = Array.isArray(activeFilter) ? activeFilter : [activeFilter];
        const mappedFilters = filterArray.map(f => f === 'Mutual Funds' ? 'Mutual Fund' : f === 'Stocks' ? 'Stock' : f === 'ETFs' ? 'ETF' : f);
        
        return mappedFilters.includes(res.type);
      })
      .sort((a, b) => b.score - a.score);

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
  }, [query, stocks, mfs, activeFilter]);

  return results;
};
