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
  hybridData: any[] | null;
  hybridLogs: string[];
  debugLogs: string[];
  isStreaming: boolean;
  error?: string | null;
  unverified?: boolean;
  parseFailed?: boolean;
};

interface AIState {
  isProcessing: boolean;
  messages: ChatMessage[];
  activeTicker: string | null;
  agentHistory: any[];
  activeMemo: string;
  memoHistory: {role: 'user'|'assistant', content: string}[];
  setProcessing: (status: boolean) => void;
  addMessage: (message: ChatMessage) => void;
  updateLastMessageString: (chunk: string) => void;
  updateLastMessageData: (data: DashboardData) => void;
  updateLastMessageHybridData: (data: any[] | null, logs: string[], unverified?: boolean, parseFailed?: boolean) => void;
  appendDebugLog: (log: string) => void;
  completeLastMessage: () => void;
  failLastMessage: (error: string) => void;
  clearWorkspace: () => void;
  setActiveTicker: (ticker: string | null) => void;
  addEvent: (e: any) => void;
  appendMemo: (m: string) => void;
  addMemoHistory: (msg: {role: 'user'|'assistant', content: string}) => void;
  clearHistory: () => void;
}

export const useAIStore = create<AIState>((set) => ({
  isProcessing: false,
  messages: [],
  activeTicker: null,
  agentHistory: [],
  activeMemo: '',
  memoHistory: [],
  
  setProcessing: (status) => set({ isProcessing: status }),
  setActiveTicker: (ticker) => set({ activeTicker: ticker }),
  addEvent: (e) => set((state) => ({ agentHistory: [...state.agentHistory, e] })),
  appendMemo: (m) => set((state) => {
    // If we're appending to activeMemo, let's also update the last assistant message in memoHistory
    const hist = [...state.memoHistory];
    if (hist.length > 0 && hist[hist.length - 1].role === 'assistant') {
      hist[hist.length - 1].content += m;
    }
    return { activeMemo: state.activeMemo + m, memoHistory: hist };
  }),
  addMemoHistory: (msg) => set((state) => ({ memoHistory: [...state.memoHistory, msg] })),
  clearHistory: () => set({ agentHistory: [], activeMemo: '', memoHistory: [] }),
  
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
  
  updateLastMessageHybridData: (data, logs, unverified, parseFailed) => set((state) => {
    const msgs = [...state.messages];
    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
      msgs[msgs.length - 1].hybridData = data;
      msgs[msgs.length - 1].hybridLogs = logs;
      msgs[msgs.length - 1].unverified = unverified;
      msgs[msgs.length - 1].parseFailed = parseFailed;
    }
    return { messages: msgs };
  }),
  
  appendDebugLog: (log) => set((state) => {
    const msgs = [...state.messages];
    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
      msgs[msgs.length - 1].debugLogs = [...(msgs[msgs.length - 1].debugLogs || []), `[${timestamp}] ${log}`];
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
