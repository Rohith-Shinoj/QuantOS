from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio

# Import the compiled LangGraph apps
from agent_engine.graph import app as graph_app
from agent_engine.memo_graph import memo_app
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
    
    # --- HYBRID INTERCEPTOR: DB FIRST EXECUTION ---
    try:
        from nlp_router import parse_natural_language_to_sql
        import duckdb
        import os
        from langchain_google_genai import ChatGoogleGenerativeAI
        import httpx
        from google.api_core.exceptions import ResourceExhausted
        
        parsed = parse_natural_language_to_sql(query)
        
        intent_str = parsed.get('intent', '')
        yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[NLP] Intent: {intent_str}'})}\n\n"
        sql_where = parsed.get('sql_where_clause', '')
        if sql_where:
            yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[NLP] SQL WHERE: {sql_where}'})}\n\n"
        for log in parsed.get('parsed_logs', []):
            yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[NLP] {log}'})}\n\n"
        
        if parsed.get("intent") == "QUANTITATIVE":
            # Execute DuckDB Query
            BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            DB_PATH = os.path.realpath(os.path.join(BASE_DIR, "datasets/A/market_data.duckdb"))
            
            # Select columns
            select_cols = parsed['select_columns']
            sql = f"SELECT {', '.join(select_cols)} FROM stocks s "
            
            if any("sm." in col for col in select_cols) or "sm." in parsed['sql_where_clause']:
                sql += "LEFT JOIN stock_metrics sm ON s.ticker = sm.ticker "
                
            sql += f"WHERE {parsed['sql_where_clause']} ORDER BY s.market_cap DESC LIMIT 100"
            
            con = duckdb.connect(DB_PATH, read_only=True)
            results = con.execute(sql).fetchall()
            
            # --- SOFT FALLBACK UX ---
            if not results:
                fallback_sql = f"SELECT {', '.join(select_cols)} FROM stocks s "
                if any("sm." in col for col in select_cols) or "sm." in parsed['sql_where_clause']:
                    fallback_sql += "LEFT JOIN stock_metrics sm ON s.ticker = sm.ticker "
                
                industry_filter = ""
                for condition in parsed['sql_where_clause'].split(' AND '):
                    if "s.industry" in condition:
                        industry_filter = condition
                        break
                
                if industry_filter:
                    fallback_sql += f"WHERE {industry_filter} ORDER BY s.market_cap DESC LIMIT 5"
                else:
                    fallback_sql += "ORDER BY s.market_cap DESC LIMIT 5"
                
                results = con.execute(fallback_sql).fetchall()
                if 'parsed_logs' not in parsed:
                    parsed['parsed_logs'] = []
                parsed['parsed_logs'].append("Strict filter yielded 0 results. Showing top 5 sector leaders instead.")
                yield f"data: {json.dumps({'type': 'debug_log', 'log': '[DB] Strict filter yielded 0 results. Showing top 5 sector leaders instead.'})}\n\n"

            columns = [desc[0] for desc in con.description]
            output = [dict(zip(columns, row)) for row in results]
            
            yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[DB] Query returned {len(results)} rows'})}\n\n"

            # --- LLM VALIDATION ---
            LLM_COLUMNS = ['ticker', 'Name', 'industry', 'market_cap', 'pe_ratio']
            for col in parsed.get('mentioned_metrics', []):
                alias = col.split('.')[-1].replace('(', '').replace(')', '').replace('* 100', '').replace(' ', '').strip()
                if alias not in LLM_COLUMNS:
                    LLM_COLUMNS.append(alias)
                    
            MAX_LLM_ROWS = 40
            llm_payload = []
            for row_dict in output[:MAX_LLM_ROWS]:
                slim_row = {}
                for k in LLM_COLUMNS:
                    # case-insensitive check because of aliases
                    found_key = next((key for key in row_dict.keys() if key.lower() == k.lower()), None)
                    if found_key:
                        slim_row[found_key] = row_dict[found_key]
                llm_payload.append(slim_row)
                
            yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[DB] Sending {min(len(output), 40)} rows to LLM (slim payload: {len(LLM_COLUMNS)} cols)'})}\n\n"
            yield f"data: {json.dumps({'type': 'debug_log', 'log': '[LLM] Sending to validation engine (gemini-3.1-flash-lite)...'})}\n\n"

            validation_model = ChatGoogleGenerativeAI(
                model="gemini-3.1-flash-lite",
                temperature=0.1
            )
            
            prompt = f"The user asked: '{query}'\n"
            prompt += f"Parsed DB SQL WHERE clause: '{parsed['sql_where_clause']}'\n"
            prompt += f"Slim DB results: {json.dumps(llm_payload)}\n"
            if len(output) > MAX_LLM_ROWS:
                prompt += f"\nNote: DB returned {len(output)} total rows. Showing top {MAX_LLM_ROWS} by market cap."
                
            from agent_engine.registry import COMPONENT_REGISTRY
            
            registry_str = ""
            for key, val in COMPONENT_REGISTRY.items():
                if key != "narrative_insight":
                    registry_str += f"- {key}: {val['description']}\n  Expected Schema: {val['schema']}\n\n"

            prompt = f"""
            You are a Quantitative Validation Engine and Expert Institutional Portfolio Manager.
            A user asked this screening query: "{query}"
            The database was queried and returned these stocks (pre-filtered): 
            {json.dumps(output)}
            
            Your tasks:
            1. VALIDATION: Decide which stocks to KEEP or REMOVE based strictly on the query context. You can ADD highly relevant NSE/BSE stocks if they were missed by the basic database filter.
            2. ANALYSIS & DASHBOARD GENERATION: Generate a 'narrative_insight' summary providing a massive, deep CIO macro view of the results. 
               Additionally, choose 3 to 5 visual components from the Component Registry below that best explain the macro sector risks, alpha drivers, or thematic trends for this specific screen.
            
            COMPONENT REGISTRY:
            {registry_str}
            - narrative_insight: A comprehensive multi-paragraph CIO analysis of the sector and stocks.
              Expected Schema: {{"narrative_insight": {{"text": "STR"}}}}
            
            OUTPUT FORMAT:
            You must output a SINGLE raw JSON object containing exactly:
            - "validated_stocks": [ {{"ticker": "TCS", "verdict": "KEEP|REMOVE|ADD", "reason": "..."}} ]
            - "narrative_insight": {{ ... }}
            - And the 3 to 5 component keys you selected, matching their exact Expected Schemas.
            
            Do NOT hallucinate fundamental data. If data is missing for a schema, synthesize qualitative insights.
            Do NOT wrap your response in markdown code fences (```json). Output ONLY the raw JSON string starting with {{.
            """
            
            try:
                raw_text = ""
                async for chunk in validation_model.astream([HumanMessage(content=prompt)]):
                    content = chunk.content
                    if isinstance(content, list):
                        text_chunk = "".join(block.get("text", "") for block in content if isinstance(block, dict))
                    else:
                        text_chunk = str(content)
                        
                    if text_chunk:
                        raw_text += text_chunk
                        yield f"data: {json.dumps({'type': 'token', 'content': text_chunk})}\n\n"
                
                try:
                    import re
                    json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
                    if not json_match:
                        raise json.JSONDecodeError("No JSON found", raw_text, 0)
                    parsed_llm = json.loads(json_match.group(0))
                    
                    kept_tickers = [s["ticker"] for s in parsed_llm.get("validated_stocks", []) if s.get("verdict") == "KEEP"]
                    removed_tickers = [s["ticker"] for s in parsed_llm.get("validated_stocks", []) if s.get("verdict") == "REMOVE"]
                    added_tickers = [s["ticker"] for s in parsed_llm.get("validated_stocks", []) if s.get("verdict") == "ADD"]
                    
                    yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[LLM] Validation complete. Kept: {len(kept_tickers)}, Removed: {len(removed_tickers)}, Added: {len(added_tickers)}'})}\n\n"
                    
                    # Filter output based on KEEP
                    final_output = [row for row in output if row['ticker'] in kept_tickers]
                    
                    # Process ADD
                    if added_tickers:
                        placeholders = ",".join(["?" for _ in added_tickers])
                        add_sql = f"SELECT {', '.join(select_cols)} FROM stocks s "
                        if any("sm." in col for col in select_cols) or "sm." in parsed['sql_where_clause']:
                            add_sql += "LEFT JOIN stock_metrics sm ON s.ticker = sm.ticker "
                        add_sql += f"WHERE s.ticker IN ({placeholders})"
                        
                        new_rows = con.execute(add_sql, added_tickers).fetchall()
                        
                        def passes_conditions(row_dict, conditions):
                            for cond in conditions:
                                col = cond['col']
                                op = cond['op']
                                val = cond['val']
                                key = col.split('.')[-1]
                                actual = row_dict.get(key)
                                if actual is None:
                                    continue
                                if op == '<' and not (actual < val): return False
                                if op == '>' and not (actual > val): return False
                                if op == '=' and not (actual == val): return False
                                if op == 'BETWEEN' and not (val[0] <= actual <= val[1]): return False
                            return True
                            
                        for r in new_rows:
                            row_dict = dict(zip(columns, r))
                            if passes_conditions(row_dict, parsed.get('conditions', [])):
                                final_output.append(row_dict)
                                ticker_val = row_dict.get('ticker', '')
                                yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[LLM] ADD {ticker_val}: passed condition check — merged'})}\n\n"
                            else:
                                ticker_val = row_dict.get('ticker', '')
                                yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[LLM] ADD {ticker_val}: FAILED condition check — skipped'})}\n\n"
                    
                    # Sort final output by market cap desc
                    final_output.sort(key=lambda x: x.get('market_cap', 0) or 0, reverse=True)
                    
                    yield f"data: {json.dumps({'type': 'hybrid_data', 'data': final_output, 'logs': parsed.get('parsed_logs', []), 'unverified': False, 'parse_failed': False})}\n\n"
                except (json.JSONDecodeError, KeyError, TypeError) as parse_err:
                    yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[LLM] Response received but JSON malformed: {str(parse_err)}'})}\n\n"
                    analysis_text = raw_text if len(raw_text) > 50 else ""
                    yield f"data: {json.dumps({'type': 'hybrid_data', 'data': output, 'logs': parsed.get('parsed_logs', []), 'unverified': False, 'parse_failed': True})}\n\n"
                    if analysis_text:
                        yield f"data: {json.dumps({'type': 'token', 'content': analysis_text})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[LLM] Unavailable: {type(e).__name__}: {str(e)}'})}\n\n"
                yield f"data: {json.dumps({'type': 'hybrid_data', 'data': output, 'logs': parsed.get('parsed_logs', []), 'unverified': True, 'parse_failed': False})}\n\n"
            
            con.close()
            
            if ticker == "SCREEN":
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return
            
            # If not SCREEN, maybe we want to run the LangGraph? 
            # But quantitative intent already handles it. So we return here for all quantitative queries.
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return
            
        else:
            # Qualitative query
            if ticker == "SCREEN":
                pass
            
            yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[DB] Fetching qualitative data for {ticker} from DuckDB...'})}\n\n"
            
            con = duckdb.connect(DB_PATH, read_only=True)
            stock = con.execute("SELECT absolute_data, relative_data FROM stocks WHERE ticker = ? OR slug = ?", (ticker, ticker)).fetchone()
            con.close()
            
            if not stock:
                yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[DB] No data found for {ticker}'})}\n\n"
                yield f"data: {json.dumps({'type': 'token', 'content': f'No data found for {ticker} in the database.'})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return
                
            abs_data = json.loads(stock[0]) if stock[0] else {}
            rel_data = json.loads(stock[1]) if stock[1] else {}
            
            yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[DB] Successfully fetched deep qualitative data for {ticker}'})}\n\n"
            yield f"data: {json.dumps({'type': 'debug_log', 'log': '[LLM] Bypassing LangGraph... Initiating single-shot qualitative analysis...'})}\n\n"
            
            from agent_engine.registry import COMPONENT_REGISTRY
            registry_str = ""
            for key, val in COMPONENT_REGISTRY.items():
                if key != "narrative_insight":
                    registry_str += f"- {key}: {val['description']}\n  Expected Schema: {val['schema']}\n\n"
                    
            prompt = f"The user asked about {ticker}: '{query}'\n\n"
            prompt += f"Deep Database Extract for {ticker}:\n"
            prompt += f"Absolute Fundamentals: {json.dumps(abs_data)[:5000]}...\n"
            prompt += f"Relative Metrics: {json.dumps(rel_data)[:5000]}...\n\n"
            prompt += f"""
            You are a Qualitative Analysis Engine and Expert Institutional Portfolio Manager.
            A user asked about {ticker}: "{query}"
            
            CRITICAL INSTRUCTION 1: You MUST output strictly in JSON format. NO MARKDOWN WRAPPERS, NO CODE BLOCKS, NO TEXT OUTSIDE THE JSON.
            CRITICAL INSTRUCTION 2: You MUST include the `narrative_insight` key containing a deep, multi-paragraph qualitative analysis addressing the user's query.
            CRITICAL INSTRUCTION 3: You MUST select EXACTLY 3 additional UI components from the registry below that best fit the analysis. You must populate their schemas using the data provided.
            
            AVAILABLE UI COMPONENTS:
            {registry_str}
            
            REQUIRED OUTPUT JSON SCHEMA:
            {{
              "narrative_insight": {{
                "title": "A compelling title",
                "summary": "Deep, multi-paragraph analysis addressing the query",
                "trend": "bullish | bearish | neutral"
              }},
              "metadata": {{
                "ticker": "{ticker}",
                "industry": "Extracted Industry",
                "recommendation": "BUY | HOLD | SELL",
                "current_price": "$0.00"
              }},
              // ... inject the 3 components you chose here using their exact keys and expected schemas
            }}
            """
            
            model = ChatGoogleGenerativeAI(
                model="gemini-3.1-flash-lite",
                temperature=0.1
            )
            
            try:
                raw_text = ""
                async for chunk in model.astream([HumanMessage(content=prompt)]):
                    content = chunk.content
                    if isinstance(content, list):
                        text_chunk = "".join(block.get("text", "") for block in content if isinstance(block, dict))
                    else:
                        text_chunk = str(content)
                        
                    if text_chunk:
                        raw_text += text_chunk
                        yield f"data: {json.dumps({'type': 'token', 'content': text_chunk})}\n\n"
                        
                try:
                    import re
                    match = re.search(r'\{.*\}', raw_text, re.DOTALL)
                    if match:
                        raw_text = match.group(0)
                    parsed_json = json.loads(raw_text)
                    yield f"data: {json.dumps({'type': 'debug_log', 'log': '[LLM] Qualitative JSON parsed successfully!'})}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[LLM] Qualitative JSON parse failed: {str(e)}'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[LLM] Unavailable: {type(e).__name__}: {str(e)}'})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return
            
    except Exception as e:
        print(f"Hybrid Interceptor Error: {e}")
        import traceback
        traceback.print_exc()
        yield f"data: {json.dumps({'type': 'token', 'content': f'Oops, looks like the AI Agent is experiencing high demand currently. Please try again in a while :('})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"


@router.post("/api/agent/research")
async def research_endpoint(req: ResearchRequest):
    return StreamingResponse(
        stream_agent_events(req.ticker, req.query, req.history),
        media_type="text/event-stream"
    )


async def stream_memo_events(ticker: str, query: str, history: list = None):
    """
    Generator that runs the memo agent and yields Server-Sent Events (SSE).
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
        "messages": msgs
    }
    
    try:
        async for event in memo_app.astream_events(initial_state, version="v2"):
            kind = event["event"]
            name = event.get("name")
            
            if kind == "on_chat_model_stream":
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
                yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name})}\n\n"
                
            elif kind == "on_chain_end" and name == "LangGraph":
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

            await asyncio.sleep(0)
            
    except Exception as e:
        print(f"\n[AGENT_API ERROR] Fatal exception during memo execution for ticker {ticker}: {str(e)}")
        fallback_msg = "Oops, looks like the AI Agent is experiencing high demand currently. Please try again in a while :("
        yield f"data: {json.dumps({'type': 'token', 'content': fallback_msg})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"


@router.post("/api/agent/memo")
async def memo_endpoint(req: ResearchRequest):
    return StreamingResponse(
        stream_memo_events(req.ticker, req.query, req.history),
        media_type="text/event-stream"
    )