import { create } from 'zustand';

interface AppState {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  selectedStockSlug: string;
  setSelectedStockSlug: (slug: string) => void;
  centralMode: 'PRICE' | 'PAIRS' | 'FINANCIALS';
  setCentralMode: (mode: 'PRICE' | 'PAIRS' | 'FINANCIALS') => void;
}

export const useAppStore = create<AppState>((set) => ({
  isDarkMode: true, // Priority is Dark Mode
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
  selectedStockSlug: 'state-bank-of-india',
  setSelectedStockSlug: (slug) => set({ selectedStockSlug: slug }),
  centralMode: 'PRICE',
  setCentralMode: (mode) => set({ centralMode: mode }),
}));
