import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const fetchPortfolio = async () => {
  const response = await axios.get(`${API_BASE_URL}/portfolio`);
  return response.data;
};

export const savePortfolio = async (payload: any) => {
  const response = await axios.post(`${API_BASE_URL}/portfolio`, payload);
  return response.data;
};

export const fetchMatrixPrefetch = async (payload: any) => {
  const response = await axios.post(`${API_BASE_URL}/portfolio/matrix-prefetch`, payload);
  return response.data;
};

export const fetchStockData = async (slug: string) => {
  const response = await axios.get(`${API_BASE_URL}/stocks/${slug}`);
  return response.data;
};

export const fetchLandingWidgets = async () => {
  const response = await axios.get(`${API_BASE_URL}/landing_widgets`);
  return response.data;
};

export const fetchSearchIndex = async () => {
  const response = await axios.get(`${API_BASE_URL}/search_index`);
  return response.data;
};

export const fetchAllStocks = async (params?: any) => {
  const response = await axios.get(`${API_BASE_URL}/stocks`, { params });
  return response.data.data ? response.data.data : response.data;
};

export const fetchETFs = async (params?: any) => {
  const response = await axios.get(`${API_BASE_URL}/etfs`, { params });
  return response.data.data ? response.data.data : response.data;
};

export const fetchETFData = async (slug: string) => {
  const response = await axios.get(`${API_BASE_URL}/etfs/${slug}`);
  return response.data;
};

export const fetchBatchStockData = async (slugs: string[]) => {
  const response = await axios.post(`${API_BASE_URL}/stocks/batch`, { slugs });
  return response.data;
};

export const fetchMacroData = async () => {
  const response = await axios.get(`${API_BASE_URL}/macro`);
  return response.data;
};

export const fetchPairAnalysis = async (assetA: string, assetB: string, lookback: number = 252) => {
  const response = await axios.post(`${API_BASE_URL}/pairs`, {
    asset_a: assetA,
    asset_b: assetB,
    lookback_days: lookback
  });
  return response.data;
};

export const fetchRelatedStocks = async (slug: string) => {
  const response = await axios.get(`${API_BASE_URL}/stocks/${slug}/related`);
  return response.data;
};

export const fetchPortfolioAnalysis = async (slugs: string[]) => {
  const response = await axios.post(`${API_BASE_URL}/portfolio/analyze`, {
    slugs: slugs
  });
  return response.data;
};

export interface PortfolioHolding {
  slug: string;
  amount: number;
}

export const fetchPortfolioAIAnalysis = async (payload: {
  stockHoldings: PortfolioHolding[],
  mfHoldings: PortfolioHolding[],
  stockRisk: string,
  mfRisk: string,
  holdingPeriod: string
}) => {
  const response = await axios.post(`${API_BASE_URL}/portfolio/ai-analyze`, payload);
  return response.data;
};

export const sendPortfolioChat = async (payload: {
  stockHoldings: PortfolioHolding[],
  mfHoldings: PortfolioHolding[],
  stockRisk: string,
  mfRisk: string,
  holdingPeriod: string,
  message: string,
  history: any[],
  initialAnalysis?: any
}) => {
  const response = await axios.post(`${API_BASE_URL}/portfolio/chat`, payload);
  return response.data;
};

export const fetchMutualFunds = async (params?: { 
  page?: number, 
  limit?: number,
  category?: string,
  sort_by?: string,
  sort_order?: string,
  minimal?: boolean
}) => {
  const response = await axios.get(`${API_BASE_URL}/mutual_funds`, { params });
  return response.data;
};

export const fetchMutualFundScreener = async (query: any) => {
  const params = new URLSearchParams({ query: JSON.stringify(query) });
  const response = await fetch(`${API_BASE_URL}/screener/mf?${params}`);
  if (!response.ok) throw new Error('Failed to fetch MF screener results');
  return response.json();
};

export const fetchBrokerTargets = async (slug: string) => {
  const response = await fetch(`${API_BASE_URL}/stocks/${slug}/targets`);
  if (!response.ok) throw new Error('Failed to fetch broker targets');
  return response.json();
};

export const fetchMutualFundByCode = async (schemeCode: string) => {
  const response = await axios.get(`${API_BASE_URL}/mutual_funds/${schemeCode}`);
  return response.data;
};



export interface LiveQuote {
  slug: string;
  currentPrice: number;
  dayChange: number;
  dayChangePerc: number;
}

export const fetchLiveQuote = async (slug: string): Promise<LiveQuote> => {
  const res = await axios.get(`${API_BASE_URL}/quotes/live/${slug}`);
  return res.data;
};

export const fetchBatchLiveQuotes = async (slugs: string[]): Promise<Record<string, LiveQuote>> => {
  const res = await axios.post(`${API_BASE_URL}/quotes/refresh-batch`, { slugs });
  return res.data;
};

export const fetchCaptureRatios = async () => {
  const res = await axios.get(`${API_BASE_URL}/funds/capture-ratios`);
  return res.data;
};
