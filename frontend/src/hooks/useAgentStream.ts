import type { ChatMessage } from '../store/aiStore';
import { useAIStore } from '../store/aiStore';
import { parse } from 'partial-json';

export const useAgentStream = () => {
  const { 
    setProcessing, addMessage, updateLastMessageString, 
    updateLastMessageData, updateLastMessageHybridData, appendDebugLog, completeLastMessage, failLastMessage 
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
      hybridData: null,
      hybridLogs: [],
      debugLogs: [],
      isStreaming: false
    });

    // Add empty assistant message placeholder
    const assistantId = (Date.now() + 1).toString();
    addMessage({
      id: assistantId,
      role: 'assistant',
      rawString: '',
      parsedData: null,
      hybridData: null,
      hybridLogs: [],
      debugLogs: [],
      isStreaming: true
    });

    let accumulator = "";

    try {
      // Build history payload from current messages
      const history = useAIStore.getState().messages.map(m => ({
        role: m.role,
        content: m.rawString
      })).slice(-10); // Keep last 10 messages for context

      const VITE_API_BASE = import.meta.env.VITE_API_URL || '/api';
      appendDebugLog(`[HTTP] Sending POST to ${VITE_API_BASE}/agent/research for ticker: ${ticker || 'GLOBAL'}`);
      const response = await fetch(`${VITE_API_BASE}/agent/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, query, history })
      });

      appendDebugLog(`[HTTP] Status: ${response.status} ${response.statusText}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        appendDebugLog("[HTTP] Error: No response body returned.");
        throw new Error("No response body");
      }

      appendDebugLog("[STREAM] Connection established. Waiting for chunks...");
      let sseBuffer = "";
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          appendDebugLog("[STREAM] Reader returned done=true. Stream closed.");
          break;
        }

        chunkCount++;
        const decoded = decoder.decode(value, { stream: true });
        appendDebugLog(`[STREAM] Received chunk #${chunkCount} (${decoded.length} bytes)`);
        
        sseBuffer += decoded;
        const lines = sseBuffer.split('\n\n');
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (!dataStr.trim()) continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'hybrid_data') {
                appendDebugLog(`[EVENT] Parsed hybrid_data: Found ${data.data?.length || 0} rows. Unverified: ${data.unverified}, ParseFailed: ${data.parse_failed}`);
                updateLastMessageHybridData(data.data, data.logs, data.unverified, data.parse_failed);
              } else if (data.type === 'debug_log') {
                appendDebugLog(data.log);
              } else if (data.type === 'token') {
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
              } else if (data.type === 'tool_start') {
                appendDebugLog(`[EVENT] Tool started: ${data.tool}`);
              } else if (data.type === 'tool_end') {
                appendDebugLog(`[EVENT] Tool ended: ${data.tool}`);
              } else if (data.type === 'done') {
                appendDebugLog(`[EVENT] Done event received.`);
                completeLastMessage();
                setProcessing(false);
              } else if (data.type === 'error') {
                appendDebugLog(`[EVENT] Server Error: ${data.message}`);
                failLastMessage(data.message);
                setProcessing(false);
              } else {
                appendDebugLog(`[EVENT] Unknown type: ${data.type}`);
              }
            } catch (err) {
              appendDebugLog(`[PARSE ERROR] Failed to parse SSE JSON. Raw: ${dataStr}`);
              console.error("Failed to parse SSE JSON", err, dataStr);
            }
          }
        }
      }
    } catch (error) {
      appendDebugLog(`[FATAL ERROR] ${String(error)}`);
      failLastMessage(String(error));
      setProcessing(false);
    } finally {
      appendDebugLog(`[STREAM] Execution finalized.`);
      completeLastMessage();
      setProcessing(false);
    }
  };

  return { streamQuery };
};
