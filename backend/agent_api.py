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
                
            prompt += """
            
            You are a senior equity research analyst validating a stock screener's output.

            ## YOUR TASK
            The user asked a screening question. Our local database engine parsed it and returned results.
            Your job is to:
            1. VALIDATE: Check if each stock truly satisfies the user's intent (not just the SQL — the INTENT)
            2. REMOVE: Delete any stock that doesn't genuinely belong (e.g., loss-making company in a "value" screen)
            3. ADD: If you know of NSE/BSE-listed Indian stocks that clearly fit the criteria but are missing, suggest their ticker symbols
            4. ANALYZE: Write a detailed expert analysis of the validated results

            ## RESPONSE FORMAT (strict JSON)
            {
            "validated_stocks": [
                {"ticker": "BEL", "verdict": "KEEP", "reason": "..."},
                {"ticker": "WALCHANNAG", "verdict": "REMOVE", "reason": "Negative PE indicates loss-making..."},
                {"ticker": "NEWSTOCK", "verdict": "ADD", "reason": "Fits all criteria but missed by DB filter"}
            ],
            "analysis": "Multi-paragraph markdown analysis covering sector trends, risks, why these stocks fit...",
            "corrections_summary": "Removed 2 stocks (loss-making), added 1 stock (missed by DB filter)"
            }

            ## RULES
            - verdict must be exactly "KEEP", "REMOVE", or "ADD"
            - For ADD stocks, only suggest tickers listed on NSE/BSE that you are confident exist
            - The analysis should be 2-4 paragraphs
            - Do NOT hallucinate fundamental data — just explain your reasoning qualitatively
            - Do NOT wrap in markdown code fences — output raw JSON only
            """
            
            try:
                llm_response = await validation_model.ainvoke([HumanMessage(content=prompt)])
                raw_text = llm_response.content
                
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
                    
                    yield f"data: {json.dumps({'type': 'token', 'content': parsed_llm.get('analysis', '')})}\n\n"
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
                # Qualitative screen makes no sense for langgraph as it needs a specific ticker usually, 
                # but we will just pass it down and see.
                pass
                
    except Exception as e:
        print(f"Hybrid Interceptor Error: {e}")
        # Fallback to standard agent if router fails
        pass

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
        
        fallback_msg = "Oops, looks like the AI Agent is experiencing high demand currently. Please try again in a while :(\n\n"
        fallback_msg += f"### Pure-Data Fallback for {ticker}\n"
        
        try:
            from backend.database import get_db
            con = get_db()
            stock = con.execute("SELECT name, industry, pe_ratio, alpha_score, volatility_squeeze FROM stocks WHERE ticker = ? OR slug = ?", (ticker, ticker)).fetchone()
            if stock:
                fallback_msg += f"- **Name:** {stock[0]}\n"
                fallback_msg += f"- **Industry:** {stock[1]}\n"
                fallback_msg += f"- **P/E Ratio:** {stock[2]}\n"
                fallback_msg += f"- **Alpha Score:** {stock[3]}\n"
                fallback_msg += f"- **Volatility Squeeze:** {stock[4]}\n"
            else:
                fallback_msg += "No pure-data available in the database for this ticker.\n"
        except Exception as inner_e:
            pass
            
        yield f"data: {json.dumps({'type': 'token', 'content': fallback_msg})}\n\n"
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