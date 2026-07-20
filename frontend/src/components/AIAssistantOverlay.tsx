import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAIStore } from '../store/aiStore';
import { X, Loader2, Database, Globe, BrainCircuit, Maximize2, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Props {
  ticker: string | undefined;
  isOpen: boolean;
  onClose: () => void;
  displayName?: string;
  internalPrompt?: string;
}

export const AIAssistantOverlay: React.FC<Props> = ({ ticker, isOpen, onClose, displayName, internalPrompt }) => {
  const navigate = useNavigate();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { 
    agentHistory, memoHistory, isProcessing, activeTicker, 
    addEvent, appendMemo, addMemoHistory, setProcessing, setActiveTicker, clearHistory 
  } = useAIStore();

  useEffect(() => {
    if (isOpen && ticker && activeTicker !== ticker) {
      clearHistory();
      setActiveTicker(ticker);
    }
  }, [isOpen, ticker]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [memoHistory]);

  const triggerAgent = async (targetTicker: string, displayPrompt: string, queryText: string) => {
    if (isProcessing) return;
    
    addMemoHistory({ role: 'user', content: displayPrompt });
    addMemoHistory({ role: 'assistant', content: '' });
    setProcessing(true);
    addEvent({ type: 'user_query', message: displayPrompt });
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/agent/memo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: targetTicker, query: queryText, history: memoHistory })
      });
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) throw new Error("No response body");
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (!dataStr.trim()) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'token') appendMemo(data.content);
              else if (data.type === 'tool_start') addEvent({ type: 'tool_start', tool: data.tool });
              else if (data.type === 'tool_end') addEvent({ type: 'tool_end', tool: data.tool });
              else if (data.type === 'done') {
                setProcessing(false);
                addEvent({ type: 'done' });
              }
              else if (data.type === 'error') {
                setProcessing(false);
                addEvent({ type: 'error', message: data.message });
              }
            } catch (err) {}
          }
        }
      }
    } catch (error) {
      setProcessing(false);
      addEvent({ type: 'error', message: String(error) });
    }
  };

  if (!isOpen) return null;

  const activeTool = agentHistory.slice().reverse().find(e => e.type === 'tool_start' || e.type === 'tool_end')?.tool;
  const isQuantRunning = isProcessing && activeTool === 'query_quant_database' && agentHistory[agentHistory.length-1].type !== 'tool_end';
  const isMacroRunning = isProcessing && activeTool === 'fetch_macro_context' && agentHistory[agentHistory.length-1].type !== 'tool_end';
  const isSynthesizing = isProcessing && (!activeTool || agentHistory[agentHistory.length-1].type === 'tool_end');

  const handleSend = () => {
    if (inputText.trim() && ticker && !isProcessing) {
      triggerAgent(ticker, inputText, inputText);
      setInputText('');
    }
  };

  return (
    <div className="absolute top-4 right-4 w-[500px] h-[80vh] bg-black/90 backdrop-blur-2xl border border-indigo-500/30 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.8)] flex flex-col z-[100] overflow-hidden">
      
      {/* Header */}
      <div className="bg-indigo-900/20 px-4 py-3 border-b border-indigo-500/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <BrainCircuit className="text-indigo-400 w-5 h-5" />
          <span className="font-bold text-text-primary tracking-tight text-sm">AI breakdown</span>
          {(displayName || ticker) && <span className="text-xs px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30 truncate max-w-[200px]">{displayName || ticker}</span>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/ai-research')} className="text-text-secondary hover:text-text-primary transition-colors" title="Open Full Dashboard">
            <Maximize2 size={16} />
          </button>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* State Transition Indicators */}
      {(isProcessing || agentHistory.length > 0) && (
        <div className="flex justify-center items-center py-4 bg-black/40 border-b border-border shrink-0">
          <div className={`flex flex-col items-center transition-opacity ${isQuantRunning ? 'opacity-100' : 'opacity-40'}`}>
            <Database className={`w-4 h-4 mb-1 ${isQuantRunning ? 'text-blue-400 animate-pulse' : 'text-text-secondary'}`} />
            <div className={`h-1 w-8 rounded-full ${isQuantRunning ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'bg-surface-hover'}`}></div>
          </div>
          <div className="w-8 border-t border-dashed border-border mx-1"></div>
          <div className={`flex flex-col items-center transition-opacity ${isMacroRunning ? 'opacity-100' : 'opacity-40'}`}>
            <Globe className={`w-4 h-4 mb-1 ${isMacroRunning ? 'text-emerald-400 animate-pulse' : 'text-text-secondary'}`} />
            <div className={`h-1 w-8 rounded-full ${isMacroRunning ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-surface-hover'}`}></div>
          </div>
          <div className="w-8 border-t border-dashed border-border mx-1"></div>
          <div className={`flex flex-col items-center transition-opacity ${isSynthesizing ? 'opacity-100' : 'opacity-40'}`}>
            <BrainCircuit className={`w-4 h-4 mb-1 ${isSynthesizing ? 'text-purple-400 animate-pulse' : 'text-text-secondary'}`} />
            <div className={`h-1 w-8 rounded-full ${isSynthesizing ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]' : 'bg-surface-hover'}`}></div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar text-sm">
        {memoHistory.length > 0 ? (
          <div className="flex flex-col space-y-6">
            {memoHistory.map((msg, idx) => (
              <div key={idx} className={`w-full flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`${msg.role === 'user' ? 'bg-indigo-500/20 border border-indigo-500/30 px-4 py-2 rounded-xl text-indigo-100 max-w-[85%]' : 'w-full bg-surface/90 backdrop-blur-md border border-border/80 rounded-xl p-6 shadow-xl prose prose-invert prose-sm max-w-none'}`}>
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <ReactMarkdown
                      components={{
                        h2: ({node, ...props}) => <h2 className="text-base font-bold text-indigo-400 mt-8 mb-3 pb-2 border-b border-indigo-500/30 uppercase tracking-wider" {...props} />,
                        h3: ({node, ...props}) => <h3 className="text-sm font-bold text-text-primary mt-5 mb-2" {...props} />,
                        p: ({node, ...props}) => <p className="text-text-primary leading-relaxed mb-4 text-[13px]" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-2 text-text-primary text-[13px]" {...props} />,
                        li: ({node, ...props}) => <li className="marker:text-indigo-500" {...props} />,
                        strong: ({node, ...props}) => <strong className="text-indigo-200 font-semibold" {...props} />,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            ))}
            {isProcessing && memoHistory[memoHistory.length - 1]?.role === 'user' && (
               <div className="w-full flex justify-start">
                 <div className="flex items-center text-indigo-500/70 text-xs">
                   <Loader2 className="w-4 h-4 animate-spin mr-2" />
                   Thinking...
                 </div>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-text-secondary">
            <BrainCircuit className="w-12 h-12 text-indigo-500/30 mb-4" />
            <p className="mb-6 text-center px-4">Ready to analyze {displayName || ticker}.</p>
            <button
              onClick={() => {
                if (!ticker) return;
                const dName = displayName || ticker;
                const iPrompt = internalPrompt || `Provide a verified expert investment breakdown for ${dName} including Executive Analysis, Catalyst Path, Risk Asymmetry, and Execution Roadmap.`;
                const dPrompt = `Conduct an expert analysis of ${dName}.`;
                triggerAgent(ticker, dPrompt, iPrompt);
              }}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-text-primary font-semibold rounded-md transition-colors shadow-lg shadow-indigo-500/20"
            >
              Give me a detailed breakdown
            </button>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="p-4 bg-black/60 border-t border-border shrink-0">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Enter questions regarding this stock..."
            className="w-full bg-surface-hover border border-border focus:border-indigo-500/50 rounded-lg pl-4 pr-10 py-2.5 text-sm text-text-primary placeholder-gray-500 focus:outline-none transition-colors"
          />
          <button 
            onClick={handleSend}
            disabled={isProcessing || !inputText.trim()}
            className="absolute right-2 text-indigo-400 hover:text-indigo-300 disabled:text-gray-600 transition-colors p-1"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

    </div>
  );
};
