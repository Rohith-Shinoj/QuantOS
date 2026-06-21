import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

export const fetchStockData = async (slug: string) => {
  const response = await axios.get(`${API_BASE_URL}/stocks/${slug}`);
  return response.data;
};

export const fetchAllStocks = async () => {
  const response = await axios.get(`${API_BASE_URL}/stocks`);
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

export const fetchPortfolioAIAnalysis = async (holdings: PortfolioHolding[], riskTolerance: string) => {
  const response = await axios.post(`${API_BASE_URL}/portfolio/ai-analyze`, {
    holdings,
    risk_tolerance: riskTolerance
  });
  return response.data;
};

export const sendPortfolioChat = async (holdings: PortfolioHolding[], riskTolerance: string, message: string, history: any[]) => {
  const response = await axios.post(`${API_BASE_URL}/portfolio/chat`, {
    holdings,
    risk_tolerance: riskTolerance,
    message,
    history
  });
  return response.data;
};
