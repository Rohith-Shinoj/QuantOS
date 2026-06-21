from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio

# Import the compiled LangGraph app
from agent_engine.graph import app as graph_app
from langchain_core.messages import HumanMessage

router = APIRouter()

class ResearchRequest(BaseModel):
    ticker: str
    query: str
    history: list = []

async def stream_agent_events(ticker: str, query: str, history: list = None):
    """
    Generator that runs the LangGraph agent and yields Server-Sent Events (SSE).
    """
    from langchain_core.messages import HumanMessage, AIMessage
    
    msgs = []
    if history:
        for h in history:
            if h.get("role") == "user":
                msgs.append(HumanMessage(content=h.get("content", "")))
            elif h.get("role") == "assistant":
                msgs.append(AIMessage(content=h.get("content", "")))
                
    msgs.append(HumanMessage(content=query))
    
    initial_state = {
        "messages": msgs,
        "ticker": ticker
    }
    
    try:
        # We use astream_events with version="v2" as recommended by LangChain
        async for event in graph_app.astream_events(initial_state, version="v2"):
            kind = event["event"]
            name = event.get("name")
            
            # Map LangGraph events to our custom frontend UI events
            if kind == "on_chat_model_stream" and name == "ChatGoogleGenerativeAI":
                # Ensure we only stream the execution node, not the architect node
                node_name = event.get("metadata", {}).get("langgraph_node")
                if node_name == "execution":
                    chunk = event["data"]["chunk"]
                    if chunk.content:
                        content_str = ""
                        if isinstance(chunk.content, str):
                            content_str = chunk.content
                        elif isinstance(chunk.content, list):
                            for block in chunk.content:
                                if isinstance(block, dict) and "text" in block:
                                    content_str += block["text"]
                                elif isinstance(block, str):
                                    content_str += block
                        if content_str:
                            yield f"data: {json.dumps({'type': 'token', 'content': content_str})}\n\n"
                    
            elif kind == "on_tool_start":
                tool_name = name
                yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name})}\n\n"
                
            elif kind == "on_tool_end":
                tool_name = name
                # We can choose not to send the full output if it's too large, but for now we just notify
                yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name})}\n\n"
                
            elif kind == "on_chain_end" and name == "LangGraph":
                # Final graph completion
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

            # Allow other coroutines to run
            await asyncio.sleep(0)
            
    except Exception as e:
        print(f"\n[AGENT_API ERROR] Fatal exception during agent execution for ticker {ticker}: {str(e)}")
        import traceback
        traceback.print_exc()
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

@router.post("/api/agent/research")
async def research_endpoint(req: ResearchRequest):
    return StreamingResponse(
        stream_agent_events(req.ticker, req.query, req.history),
        media_type="text/event-stream"
    )
