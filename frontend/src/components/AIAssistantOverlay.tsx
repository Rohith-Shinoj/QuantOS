import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAIStore } from '../store/aiStore';
import { X, Loader2, Database, Globe, BrainCircuit, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  ticker: string | undefined;
  isOpen: boolean;
  onClose: () => void;
}

export const AIAssistantOverlay: React.FC<Props> = ({ ticker, isOpen, onClose }) => {
  const navigate = useNavigate();
  const { 
    agentHistory, activeMemo, isProcessing, activeTicker, 
    addEvent, appendMemo, setProcessing, setActiveTicker, clearHistory 
  } = useAIStore();

  useEffect(() => {
    if (isOpen && ticker && (!activeTicker || activeTicker !== ticker)) {
      triggerAgent(ticker);
    }
  }, [isOpen, ticker]);

  const triggerAgent = async (targetTicker: string) => {
    if (isProcessing) return;
    
    setActiveTicker(targetTicker);
    clearHistory();
    setProcessing(true);
    addEvent({ type: 'user_query', message: `Analyze ${targetTicker}` });
    
    try {
      const response = await fetch('http://localhost:8000/api/agent/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: targetTicker, query: `Provide a comprehensive institutional investment memo for ${targetTicker}.` })
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

  return (
    <div className="absolute top-4 right-4 w-[500px] max-h-[80vh] bg-black/80 backdrop-blur-xl border border-indigo-500/30 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.8)] flex flex-col z-50 overflow-hidden">
      
      {/* Header */}
      <div className="bg-indigo-900/20 px-4 py-3 border-b border-indigo-500/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <BrainCircuit className="text-indigo-400 w-5 h-5" />
          <span className="font-bold text-white tracking-tight text-sm">Lead PM AI Analyst</span>
          {ticker && <span className="text-xs px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">{ticker}</span>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/ai-research')} className="text-gray-400 hover:text-white transition-colors" title="Open Full Dashboard">
            <Maximize2 size={16} />
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* State Transition Indicators */}
      {(isProcessing || agentHistory.length > 0) && (
        <div className="flex justify-center items-center py-4 bg-black/40 border-b border-gray-800 shrink-0">
          <div className={`flex flex-col items-center transition-opacity ${isQuantRunning ? 'opacity-100' : 'opacity-40'}`}>
            <Database className={`w-4 h-4 mb-1 ${isQuantRunning ? 'text-blue-400 animate-pulse' : 'text-gray-500'}`} />
            <div className={`h-1 w-8 rounded-full ${isQuantRunning ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'bg-gray-800'}`}></div>
          </div>
          <div className="w-8 border-t border-dashed border-gray-700 mx-1"></div>
          <div className={`flex flex-col items-center transition-opacity ${isMacroRunning ? 'opacity-100' : 'opacity-40'}`}>
            <Globe className={`w-4 h-4 mb-1 ${isMacroRunning ? 'text-emerald-400 animate-pulse' : 'text-gray-500'}`} />
            <div className={`h-1 w-8 rounded-full ${isMacroRunning ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-gray-800'}`}></div>
          </div>
          <div className="w-8 border-t border-dashed border-gray-700 mx-1"></div>
          <div className={`flex flex-col items-center transition-opacity ${isSynthesizing ? 'opacity-100' : 'opacity-40'}`}>
            <BrainCircuit className={`w-4 h-4 mb-1 ${isSynthesizing ? 'text-purple-400 animate-pulse' : 'text-gray-500'}`} />
            <div className={`h-1 w-8 rounded-full ${isSynthesizing ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]' : 'bg-gray-800'}`}></div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar text-sm">
        {activeMemo ? (
          <div className="prose prose-invert prose-sm prose-indigo max-w-none">
            <ReactMarkdown>{activeMemo}</ReactMarkdown>
          </div>
        ) : (
          <div className="h-40 flex flex-col items-center justify-center text-gray-500">
            {isProcessing ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin mb-3 text-indigo-500" />
                <span className="font-mono text-xs">AWAITING COMMITTEE SYNTHESIS...</span>
              </>
            ) : (
              <span>Ready to analyze.</span>
            )}
          </div>
        )}
      </div>

    </div>
  );
};
