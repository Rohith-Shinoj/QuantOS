import type { ChatMessage } from '../store/aiStore';
import { useAIStore } from '../store/aiStore';
import { parse } from 'partial-json';

export const useAgentStream = () => {
  const { 
    setProcessing, addMessage, updateLastMessageString, 
    updateLastMessageData, completeLastMessage, failLastMessage 
  } = useAIStore();

  const streamQuery = async (ticker: string, query: string) => {
    setProcessing(true);
    
    // Add user message
    const userId = Date.now().toString();
    addMessage({
      id: userId,
      role: 'user',
      rawString: query,
      parsedData: null,
      isStreaming: false
    });

    // Add empty assistant message placeholder
    const assistantId = (Date.now() + 1).toString();
    addMessage({
      id: assistantId,
      role: 'assistant',
      rawString: '',
      parsedData: null,
      isStreaming: true
    });

    let accumulator = "";

    try {
      // Build history payload from current messages
      const history = useAIStore.getState().messages.map(m => ({
        role: m.role,
        content: m.rawString
      })).slice(-10); // Keep last 10 messages for context

      const response = await fetch('http://localhost:8000/api/agent/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, query, history })
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
              if (data.type === 'token') {
                accumulator += data.content;
                updateLastMessageString(data.content);
                
                try {
                  let cleanJson = accumulator.replace(/^```json\n/, '').replace(/\n```$/, '');
                  cleanJson = cleanJson.replace(/```$/, '').replace(/^```/, '');
                  const parsed = parse(cleanJson);
                  updateLastMessageData(parsed);
                } catch (parseErr) {
                  // Silent fail for incomplete JSON chunks
                }
              } else if (data.type === 'done') {
                completeLastMessage();
                setProcessing(false);
              } else if (data.type === 'error') {
                failLastMessage(data.message);
                setProcessing(false);
              }
            } catch (err) {
              console.error("Failed to parse SSE JSON", err, dataStr);
            }
          }
        }
      }
    } catch (error) {
      failLastMessage(String(error));
      setProcessing(false);
    } finally {
      completeLastMessage();
      setProcessing(false);
    }
  };

  return { streamQuery };
};
