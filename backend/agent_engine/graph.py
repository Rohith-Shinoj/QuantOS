from typing import TypedDict, Annotated, Sequence, List
import operator
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage, AIMessage
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import ToolNode
from langchain_core.runnables import RunnableConfig
import os
import json

from agent_engine.tools import query_quant_database, fetch_macro_context
from agent_engine.registry import COMPONENT_REGISTRY
from agent_engine.semantic_router import route_query

class InvestmentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    ticker: str
    selected_schemas: List[str]

async def supervisor_node(state: InvestmentState, config: RunnableConfig):
    # Run semantic vector search on the user's latest message
    last_msg = state["messages"][-1].content
    selected_keys = route_query(last_msg)
    return {"selected_schemas": selected_keys}

async def execution_node(state: InvestmentState, config: RunnableConfig):
    model = ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite", temperature=0)
    
    selected = state.get("selected_schemas", [])
    if "narrative_insight" not in selected:
        selected.insert(0, "narrative_insight")
        
    required_tools_set = set()
    
    schema_str = "{\n"
    for key in selected:
        if key in COMPONENT_REGISTRY:
            comp = COMPONENT_REGISTRY[key]
            required_tools_set.update(comp.get("required_tools", []))
            schema_str += f"  {comp['schema'][1:-1]},\n"
    if schema_str.endswith(",\n"):
        schema_str = schema_str[:-2] + "\n"
    schema_str += "}"
    
    # Dynamically bind tools
    tools = []
    if "query_quant_database" in required_tools_set:
        tools.append(query_quant_database)
    if "fetch_macro_context" in required_tools_set:
        tools.append(fetch_macro_context)
        
    model_with_tools = model.bind_tools(tools) if tools else model
    
    sys_msg = SystemMessage(content=(
        "You are an expert Institutional Portfolio Manager and a strict JSON-only API. Your absolute priority is to populate the requested JSON schemas accurately.\n\n"
        "CRITICAL INSTRUCTION 1 (GRACEFUL DEGRADATION): You are bound by the provided JSON schemas. However, if your tools (e.g., DuckDB, Tavily) return NO DATA for a requested schema, YOU MUST NOT HALLUCINATE VALUES. You must either omit that schema's key entirely from your final JSON payload, or return its value as null. It is perfectly acceptable to return only the 'narrative_insight' if all other data is missing.\n\n"
        "CRITICAL INSTRUCTION 2 (NARRATIVE ALWAYS): You must ALWAYS include the 'narrative_insight' key to provide a complete, rich textual explanation of the user's query using your vast internal Gemini knowledge base.\n\n"
        "CRITICAL INSTRUCTION 3 (JSON ONLY): You must generate ONLY valid JSON. Absolutely NO markdown formatting (do not use ```json), NO introductory text, and NO concluding text. Just the raw JSON object.\n\n"
        f"{schema_str}"
    ))
    
    messages = [sys_msg] + list(state["messages"])
    response = await model_with_tools.ainvoke(messages, config)
    
    return {"messages": [response]}

tool_node = ToolNode([query_quant_database, fetch_macro_context])

def execution_router(state: InvestmentState) -> str:
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and len(last_message.tool_calls) > 0:
        return "tools"
    return "end"

def build_graph():
    workflow = StateGraph(InvestmentState)
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("execution", execution_node)
    workflow.add_node("tools", tool_node)
    
    workflow.set_entry_point("supervisor")
    workflow.add_edge("supervisor", "execution")
    workflow.add_conditional_edges(
        "execution",
        execution_router,
        {"tools": "tools", "end": END}
    )
    workflow.add_edge("tools", "execution")
    
    return workflow.compile()

app = build_graph()
