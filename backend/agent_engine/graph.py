from typing import TypedDict, Annotated, Sequence, List
import operator
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage, AIMessage
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import ToolNode
from langchain_core.runnables import RunnableConfig
import os
import json

from agent_engine.tools import query_quant_database, fetch_macro_context, execute_duckdb_query
from agent_engine.registry import COMPONENT_REGISTRY
class InvestmentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    ticker: str
    selected_schemas: List[str]

async def architect_node(state: InvestmentState, config: RunnableConfig):
    registry_str = ""
    for key, val in COMPONENT_REGISTRY.items():
        if key != "narrative_insight":
            registry_str += f"- {key}: {val['description']}\n"
            
    sys_msg = SystemMessage(content=(
        "You are the UI Architect. Analyze the user's intent and design a holistic, 360-degree visual dashboard. "
        "CRITICAL CONSTRAINT: You must fix the UI rendering based heavily on the knowledge of the dataset fields we have. "
        "The quantitative database ONLY contains these fields: [market_cap, pe_ratio, rs_rating, inst_accum, volatility_squeeze, pledge_delta, peer_comps]. "
        "If the user asks for something we don't have (like insider trading or specific charts), you must intelligently pivot and select components we CAN fulfill (like valuation or momentum). "
        "You MUST output your selection as a strict, raw JSON array of strings corresponding to the exact component keys. "
        "Do not output markdown code blocks. Example: [\"current_valuation_grid\", \"narrative_insight\"]\n\n"
        "You must select between 3 and 5 components to ensure a rich UI.\n\n"
        "Available Components:\n"
        f"{registry_str}"
    ))
    
    model = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite", temperature=0)
    messages = [sys_msg] + list(state["messages"])
    
    response = await model.ainvoke(messages, config)
    
    try:
        import re
        
        content = response.content
        if isinstance(content, list):
            raw_text = "".join(block.get("text", "") for block in content if isinstance(block, dict))
        else:
            raw_text = str(content)
            
        raw_text = raw_text.strip()
        match = re.search(r'\[.*\]', raw_text, re.DOTALL)
        if match:
            json_str = match.group(0)
            selected_keys = json.loads(json_str)
        else:
            selected_keys = []
            
        if not isinstance(selected_keys, list) or len(selected_keys) == 0:
            # Fallback if Architect LLM hallucinated or returned empty
            selected_keys = ["current_valuation_grid", "institutional_accumulation_trend", "quantitative_earnings_quality_scorecard", "cross_sectional_peer_multiples_table"]
    except Exception as e:
        print(f"Architect JSON Decode Error: {e}")
        selected_keys = ["current_valuation_grid", "institutional_accumulation_trend", "quantitative_earnings_quality_scorecard", "cross_sectional_peer_multiples_table"]
        
    return {"selected_schemas": selected_keys}

async def execution_node(state: InvestmentState, config: RunnableConfig):
    model = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite", temperature=0)
    
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
    # Give the agent execution capability unconditionally for deep complex queries
    tools.append(execute_duckdb_query)
        
    model_with_tools = model.bind_tools(tools) if tools else model
    
    sys_msg = SystemMessage(content=(
        "You are an expert Institutional Portfolio Manager and a strict JSON-only API. Your absolute priority is to populate the requested JSON schemas accurately.\n\n"
        "CRITICAL INSTRUCTION 1 (CALL TOOLS FIRST): You MUST use the provided tools (e.g., query_quant_database) to fetch the real data FIRST. DO NOT attempt to output the final JSON until after you have successfully called the tools and received their data.\n\n"
        "CRITICAL INSTRUCTION 2 (FLEXIBLE DEGRADATION): You are bound by the provided JSON schemas. Your tools provide sparse data. YOU MUST NOT OMIT A SCHEMA just because some fields are missing. Instead, map the tool data to the schema the best you can. Synthesize qualitative fields (like 'trend' or 'quality_tier') from the numerical data you do have. For numerical fields you absolutely lack (like pb_ratio), output 0.0. Only omit a schema if you have absolutely NO relevant tool data for it.\n\n"
        "CRITICAL INSTRUCTION 3 (LONG NARRATIVE ALWAYS): You must ALWAYS include the 'narrative_insight' key. The narrative must provide an EXTENSIVE, highly detailed, multi-paragraph qualitative market analysis. Do not write a short summary; write a comprehensive report to fully utilize the wide UI space. DO NOT just blindly repeat numbers visible in other widgets.\n\n"
        "CRITICAL INSTRUCTION 4 (JSON ONLY): When you finally have the data and are ready to respond, you must generate ONLY valid JSON. Absolutely NO markdown formatting, NO introductory text, and NO concluding text.\n\n"
        f"{schema_str}"
    ))
    
    messages = [sys_msg] + list(state["messages"])
    response = await model_with_tools.ainvoke(messages, config)
    
    return {"messages": [response]}

tool_node = ToolNode([query_quant_database, fetch_macro_context, execute_duckdb_query])

def execution_router(state: InvestmentState) -> str:
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and len(last_message.tool_calls) > 0:
        return "tools"
    return "end"

def build_graph():
    workflow = StateGraph(InvestmentState)
    workflow.add_node("architect", architect_node)
    workflow.add_node("execution", execution_node)
    workflow.add_node("tools", tool_node)
    
    workflow.set_entry_point("architect")
    workflow.add_edge("architect", "execution")
    workflow.add_conditional_edges(
        "execution",
        execution_router,
        {"tools": "tools", "end": END}
    )
    workflow.add_edge("tools", "execution")
    
    return workflow.compile()

app = build_graph()
