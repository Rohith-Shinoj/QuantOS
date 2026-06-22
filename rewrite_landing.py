import re

with open('frontend/src/pages/LandingPage.tsx', 'r') as f:
    content = f.read()

# 1. Update imports
content = content.replace("import { fetchAllStocks, fetchStockData, fetchMacroData } from '../api';", "import { fetchLandingData, searchStocks, fetchStockData, fetchMacroData } from '../api';\n\nfunction useDebounce(value: string, delay: number) {\n  const [debouncedValue, setDebouncedValue] = React.useState(value);\n  React.useEffect(() => {\n    const handler = setTimeout(() => setDebouncedValue(value), delay);\n    return () => clearTimeout(handler);\n  }, [value, delay]);\n  return debouncedValue;\n}\n\nconst SkeletonBlock = ({ className }: { className?: string }) => (\n  <div className={`animate-pulse bg-surface-hover rounded-xl ${className}`}></div>\n);")

# 2. Update StockListGrid
old_grid = """const StockListGrid = ({ stocks }: { stocks: any[] }) => {
  // Calculate High-Conviction Lists (Only >5000 Cr Market Cap to avoid small-cap/penny anomalies)
  const validStocks = stocks?.filter((s: any) => s.ticker && s.day_change && (s.marketCap || 0) >= 5000) || [];
  const highestVolume = [...validStocks].sort((a, b) => (b.inst_accum || 0) - (a.inst_accum || 0)).slice(0, 5);
  const mostVolatile = [...validStocks].sort((a, b) => (b.rs_rating || 0) - (a.rs_rating || 0)).slice(0, 5);
  const topGainers = [...validStocks].sort((a, b) => (b.alpha_score || 0) - (a.alpha_score || 0)).slice(0, 5);
  const topLosers = [...stocks].sort((a, b) => (a.alpha_score || 0) - (b.alpha_score || 0)).slice(0, 5);"""

new_grid = """const StockListGrid = ({ highestVolume, mostVolatile, topGainers, topLosers, isLoading }: { highestVolume: any[], mostVolatile: any[], topGainers: any[], topLosers: any[], isLoading?: boolean }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-16 mb-16">
        {[1,2,3,4].map(i => (
          <div key={i} className="flex flex-col gap-4">
            <SkeletonBlock className="h-8 w-48 mb-2 bg-canvas border border-border" />
            {[1,2,3,4,5].map(j => <SkeletonBlock key={j} className="h-16 w-full" />)}
          </div>
        ))}
      </div>
    );
  }"""
content = content.replace(old_grid, new_grid)

# 3. Update LandingPage
old_landing = """export const LandingPage = () => {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const navigate = useNavigate();

  const { data: stocks } = useQuery({ queryKey: ['allStocks'], queryFn: fetchAllStocks });
  const { data: macro } = useQuery({ queryKey: ['macroData'], queryFn: fetchMacroData });
  
  const safeStocks = (stocks || []).filter((s: any) => 
    s && s.ticker && s.ticker !== 'N/A' && s.name && s.marketCap
  );

  const searchResults = React.useMemo(() => {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    return safeStocks.filter((s: any) => 
      (s.name && s.name.toLowerCase().includes(lowerQuery)) || 
      (s.ticker && s.ticker.toLowerCase().includes(lowerQuery))
    ).slice(0, 8);
  }, [query, safeStocks]);

  // Fetch the natively scraped NIFTY index
  const fallbackSlug = (stocks || []).find((s: any) => s.slug === 'nifty')?.slug || safeStocks[0]?.slug;
  const [summarySlug, setSummarySlug] = useState<string | null>(null);

  const activeSlug = summarySlug || fallbackSlug;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      const match = safeStocks.find((s: any) => 
        s.ticker.toLowerCase() === query.toLowerCase() || 
        s.ticker.toLowerCase().includes(query.toLowerCase())
      );
      if (match) {
        navigate(`/terminal/${match.slug}`);
      }
    }
  };

  const majorStocks = [...safeStocks].sort((a, b) => b.marketCap - a.marketCap).slice(0, 15);
  
  const coreSlugs = ['sp-bse-sensex', 'india-vix', 'multi-commodity-exchange-of-india-ltd'];
  const sectorSlugs = ['nifty-bank', 'nifty-it', 'nifty-metal', 'nifty-smallcap-100', 'nifty-midcap', 'nifty-total-market-index'];
  const commoditySlugs = ['reliance-etf-gold-bees', 'nippon-life-india-asset-management-ltd-nippon-india-silver-etf'];

  const getAssets = (slugs: string[]) => slugs.map(s => (stocks || []).find((stock: any) => stock.slug === s)).filter(Boolean);
  
  const coreAssets = getAssets(coreSlugs);
  const sectorAssets = getAssets(sectorSlugs);
  const commodityAssets = getAssets(commoditySlugs);

  const [tickerMode, setTickerMode] = useState<'stocks' | 'indices'>('stocks');
  const indexSlugs = ['nifty', ...coreSlugs, ...sectorSlugs];
  const indexAssets = getAssets(indexSlugs);
  const activeTickerItems = tickerMode === 'stocks' ? majorStocks.slice(0, 20) : indexAssets;"""

new_landing = """export const LandingPage = () => {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [showDropdown, setShowDropdown] = useState(false);
  const navigate = useNavigate();

  const { data: landingData, isLoading: isLandingLoading } = useQuery({ queryKey: ['landingData'], queryFn: fetchLandingData });
  const { data: macro } = useQuery({ queryKey: ['macroData'], queryFn: fetchMacroData });
  const { data: searchResults = [], isLoading: isSearchLoading } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchStocks(debouncedQuery),
    enabled: !!debouncedQuery
  });

  const [summarySlug, setSummarySlug] = useState<string | null>(null);
  
  const majorStocks = landingData?.majorStocks || [];
  const coreAssets = landingData?.coreAssets || [];
  const sectorAssets = landingData?.sectorAssets || [];
  const commodityAssets = landingData?.commodityAssets || [];
  const activeSlug = summarySlug || 'nifty';

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      navigate(`/terminal/${searchResults[0].slug}`);
    }
  };

  const [tickerMode, setTickerMode] = useState<'stocks' | 'indices'>('stocks');
  
  // Ticker items
  const activeTickerItems = tickerMode === 'stocks' 
    ? majorStocks.slice(0, 20) 
    : [...coreAssets, ...sectorAssets];"""

content = content.replace(old_landing, new_landing)

# 4. Update the MarketSectors and StockListGrid rendering at the bottom
content = content.replace("<MarketSectors macro={macro} stocks={safeStocks} />", "<MarketSectors macro={macro} stocks={majorStocks} />")
content = content.replace("<StockListGrid stocks={safeStocks} />", "<StockListGrid highestVolume={landingData?.institutionalFavorites || []} mostVolatile={landingData?.momentumLeaders || []} topGainers={landingData?.topAlpha || []} topLosers={landingData?.bottomAlpha || []} isLoading={isLandingLoading} />")

# 5. Fix the search dropdown rendering
old_search_res = """{searchResults.map((res: any) => ("""
new_search_res = """{isSearchLoading ? (
                  <div className="px-4 py-3 text-xs text-text-secondary">Searching...</div>
                ) : searchResults.map((res: any) => ("""
content = content.replace(old_search_res, new_search_res)
content = content.replace("""</div>\n            )}\n          </div>""", """</div>\n                )}</div>\n            )}\n          </div>""")

with open('frontend/src/pages/LandingPage.tsx', 'w') as f:
    f.write(content)
