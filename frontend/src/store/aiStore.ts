import { create } from 'zustand';

export interface DashboardData {
  metadata?: any;
  narrative_insight?: any;
  technical_levels?: any;
  catalyst_feed?: any;
  financial_matrix?: any;
  peer_valuation?: any;
  macro_stress_test?: any;
}

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  rawString: string;
  parsedData: DashboardData | null;
  isStreaming: boolean;
  error?: string | null;
};

interface AIState {
  isProcessing: boolean;
  messages: ChatMessage[];
  activeTicker: string | null;
  agentHistory: any[];
  activeMemo: string;
  setProcessing: (status: boolean) => void;
  addMessage: (message: ChatMessage) => void;
  updateLastMessageString: (chunk: string) => void;
  updateLastMessageData: (data: DashboardData) => void;
  completeLastMessage: () => void;
  failLastMessage: (error: string) => void;
  clearWorkspace: () => void;
  setActiveTicker: (ticker: string | null) => void;
  addEvent: (e: any) => void;
  appendMemo: (m: string) => void;
  clearHistory: () => void;
}

export const useAIStore = create<AIState>((set) => ({
  isProcessing: false,
  messages: [],
  activeTicker: null,
  agentHistory: [],
  activeMemo: '',
  
  setProcessing: (status) => set({ isProcessing: status }),
  setActiveTicker: (ticker) => set({ activeTicker: ticker }),
  addEvent: (e) => set((state) => ({ agentHistory: [...state.agentHistory, e] })),
  appendMemo: (m) => set((state) => ({ activeMemo: state.activeMemo + m })),
  clearHistory: () => set({ agentHistory: [], activeMemo: '' }),
  
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message] 
  })),
  
  updateLastMessageString: (chunk) => set((state) => {
    const msgs = [...state.messages];
    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
      msgs[msgs.length - 1].rawString += chunk;
    }
    return { messages: msgs };
  }),
  
  updateLastMessageData: (data) => set((state) => {
    const msgs = [...state.messages];
    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
      msgs[msgs.length - 1].parsedData = data;
    }
    return { messages: msgs };
  }),
  
  completeLastMessage: () => set((state) => {
    const msgs = [...state.messages];
    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
      msgs[msgs.length - 1].isStreaming = false;
    }
    return { messages: msgs };
  }),
  
  failLastMessage: (error) => set((state) => {
    const msgs = [...state.messages];
    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
      msgs[msgs.length - 1].isStreaming = false;
      msgs[msgs.length - 1].error = error;
    }
    return { messages: msgs };
  }),
  
  clearWorkspace: () => set({ messages: [] }),
}));
