import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllStocks, fetchMutualFunds } from '../api';

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

export const useSearch = (query: string, activeFilter: string = 'All'): SearchResult[] => {
  const { data: stocks } = useQuery({ queryKey: ['allStocks'], queryFn: fetchAllStocks });
  const { data: mfsResp } = useQuery({ queryKey: ['allMFs'], queryFn: () => fetchMutualFunds({ limit: 1000 }) });
  const mfs = (mfsResp as any)?.data;

  const results = useMemo(() => {
    if (!query || query.trim().length === 0) return [];
    
    const q = query.toLowerCase().trim();
    let combined: SearchResult[] = [];
    
    if (stocks) {
      const stockResults = stocks.map((s: any) => {
        let score = 0;
        const ticker = s.ticker ? s.ticker.toLowerCase() : '';
        const name = s.name ? s.name.toLowerCase() : '';
        
        if (ticker === q) score = 100;
        else if (name === q) score = 90;
        else if (ticker.startsWith(q)) score = 80;
        else if (name.startsWith(q)) score = 70;
        else if (ticker.includes(q)) score = 60;
        else if (name.includes(q)) score = 50;
        
        let type: 'Stock' | 'ETF' = 'Stock';
        const isETF = /\betf\b/i.test(name) || /\betf\b/i.test(s.industry || '') || /\betf\b/i.test(s.sector || '');
        if (isETF) type = 'ETF';
        
        return { 
          item: s, 
          score, 
          type,
          slug: s.slug,
          title: s.ticker,
          subtitle: s.name,
          navPath: `/terminal/${s.slug}`,
          logoTicker: s.ticker
        };
      });
      combined = combined.concat(stockResults);
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
    
    return combined
      .filter((res) => res.score > 0)
      .filter((res) => activeFilter === 'All' || res.type === (activeFilter === 'Mutual Funds' ? 'Mutual Fund' : activeFilter === 'Stocks' ? 'Stock' : 'ETF'))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }, [query, stocks, mfs, activeFilter]);

  return results;
};
