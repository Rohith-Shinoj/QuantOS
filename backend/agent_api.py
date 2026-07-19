from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio
from datetime import datetime
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any

# Pydantic Schemas for Pillar I Structured Outputs
class TeardownSection(BaseModel):
    dimension: str = Field(description="E.g., FUNDAMENTALS, MANAGEMENT & MACRO, VALUATION REALITY, TECHNICAL STRUCTURE, RISK FACTORS")
    verdict: str = Field(description="Deep qualitative markdown text analysis")

class FinalVerdict(BaseModel):
    rating: Literal["BUY", "HOLD", "AVOID"]
    conviction: int = Field(ge=0, le=10, description="Conviction score 0-10")
    target_entry_price: Optional[str] = Field(description="The target entry price if applicable, or N/A")
    summary: str = Field(description="One brutal, un-diplomatic summary line")

class UIComponent(BaseModel):
    type: str = Field(description="MUST be one of the strictly defined components from the registry")
    data_json: str = Field(description="A STRINGIFIED JSON object containing the payload for the component. MUST be a valid JSON string, NOT a dict.")

class TeardownResponse(BaseModel):
    teardown_sections: List[TeardownSection]
    final_verdict: FinalVerdict
    ui_components: List[UIComponent]

def distill_asset_data(abs_data: dict, rel_data: dict) -> dict:
    """Safely compress DuckDB payloads focusing on high-signal metrics."""
    distilled = {
        "fundamentals": {},
        "technicals": {},
        "valuation": {},
        "forensic": {}
    }
    if abs_data:
        # Extract top level ratios
        distilled["valuation"]["current_pe"] = abs_data.get("peRatio")
        distilled["valuation"]["pb_ratio"] = abs_data.get("pbRatio")
        distilled["fundamentals"]["roe"] = abs_data.get("roe")
        distilled["fundamentals"]["debt_to_equity"] = abs_data.get("debtToEquity")
        distilled["fundamentals"]["operating_cashflow"] = abs_data.get("operatingCashFlow")
        
        # Extract financial statement highlights (revenue, net profit, operating margin)
        fs = abs_data.get("financialStatement", [])
        if isinstance(fs, list):
            fs_summary = {}
            for row in fs:
                title = row.get("title")
                if title in ["Revenue", "Net Profit", "Operating Margin"]:
                    # Just grab the last 4 quarters if available to avoid bloat
                    q_data = row.get("quarterly", {})
                    fs_summary[title] = list(q_data.items())[-4:] if isinstance(q_data, dict) else []
            distilled["fundamentals"]["financial_statement_highlights"] = fs_summary

    if rel_data:
        technicals = rel_data.get("technical_state_signals", {})
        if isinstance(technicals, dict):
            distilled["technicals"]["rsi"] = technicals.get("rsi_normalized")
            distilled["technicals"]["distance_from_sma50"] = technicals.get("distance_from_sma50")
            distilled["technicals"]["volatility_squeeze"] = technicals.get("volatility_squeeze_index")
            
        forensics = rel_data.get("shareholding_momentum_vectors", {})
        if isinstance(forensics, dict):
            distilled["forensic"]["promoter_pledge_delta"] = forensics.get("promoter_pledge_delta")
            distilled["forensic"]["institutional_accumulation_qoq"] = forensics.get("institutional_accumulation_qoq")
            
        health = rel_data.get("health_scores", {})
        if isinstance(health, dict):
            distilled["forensic"]["piotroski_score"] = health.get("piotroski_f_score")
            distilled["valuation"]["graham_number_value"] = health.get("graham_number_value")
            distilled["forensic"]["altman_z_proxy"] = health.get("altman_z_proxy")
            
    return {k: v for k, v in distilled.items() if v}

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
        
        BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        DB_PATH = os.path.realpath(os.path.join(BASE_DIR, "datasets/active/market_data.parquet"))
        
        if parsed.get("intent") == "QUANTITATIVE":
            # Execute DuckDB Query
            
            # Select columns
            select_cols = parsed['select_columns']
            sql = f"SELECT {', '.join(select_cols)} FROM stocks s "
            
            if any("sm." in col for col in select_cols) or "sm." in parsed['sql_where_clause']:
                sql += "LEFT JOIN stock_metrics sm ON s.ticker = sm.ticker "
                
            sql += f"WHERE {parsed['sql_where_clause']} ORDER BY s.market_cap DESC LIMIT 100"
            
            con = duckdb.connect(':memory:')
            con.execute(f"CREATE OR REPLACE VIEW stocks AS SELECT * FROM '{DB_PATH}'")
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
            
            con = duckdb.connect(':memory:')
            con.execute(f"CREATE OR REPLACE VIEW stocks AS SELECT * FROM '{DB_PATH}'")
            stock = con.execute("SELECT absolute_data, relative_data FROM stocks WHERE ticker = ? OR slug = ?", (ticker, ticker)).fetchone()
            con.close()
            
            if not stock:
                yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[DB] No specific DB data found. Falling back to LLM knowledge.'})}\n\n"
                abs_data = {}
                rel_data = {}
            else:
                abs_data = json.loads(stock[0]) if stock[0] else {}
                rel_data = json.loads(stock[1]) if stock[1] else {}
            
            yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[DB] Successfully fetched deep qualitative data for {ticker}'})}\n\n"
            yield f"data: {json.dumps({'type': 'debug_log', 'log': '[LLM] Bypassing LangGraph... Initiating single-shot qualitative analysis...'})}\n\n"
            
            distilled_payload = distill_asset_data(abs_data, rel_data)
            
            from agent_engine.registry import COMPONENT_REGISTRY
            registry_keys = list(COMPONENT_REGISTRY.keys())
            registry_str = ""
            for key, val in COMPONENT_REGISTRY.items():
                if key != "narrative_insight":
                    registry_str += f"- {key}: {val['description']}\n  Expected Schema: {val['schema']}\n\n"
                    
            current_date_str = datetime.now().strftime("%Y %B")
            # Determine if this is a genuine follow-up (more than 1 user message in history) or a general macro qualitative query
            user_messages = [h for h in (history or []) if h.get("role") == "user" and str(h.get("content", "")).strip()]
            is_follow_up = len(user_messages) > 1 or ticker == "SCREEN"
                    
            if is_follow_up:
                hist_str = ""
                for h in history:
                    role = h.get("role", "user")
                    hist_str += f"{role.upper()}: {h.get('content', '')}\n\n"
                
                prompt = f"CONVERSATION HISTORY:\n{hist_str}\n\n"
                
                if ticker == "SCREEN":
                    prompt += f"The user asked a macro or general market question: '{query}'\n\n"
                else:
                    prompt += f"The user asked a follow-up question about {ticker}: '{query}'\n\n"
                    prompt += f"Deep Database Extract for {ticker}:\n{json.dumps(distilled_payload)}\n\n"
                prompt += """
                You are a Qualitative Analysis Engine and Expert Institutional Portfolio Manager.
                Answer the user's follow-up question in a highly structured, aesthetically pleasing markdown format (similar to chatting to a premium AI assistant).
                Use bullet points, bold text, and clear paragraphs. Provide deep, fundamental-oriented insights with strong conviction.
                DO NOT output JSON. Output raw markdown text.
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
                        yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[LLM] Follow-up processed as Markdown.'})}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[LLM] Unavailable: {type(e).__name__}: {str(e)}'})}\n\n"

            else:
                prompt = f"The user asked about {ticker}: '{query}'\n\n"
                prompt += f"Deep Database Extract for {ticker}:\n{json.dumps(distilled_payload)}\n\n"
                prompt += f"""
                You are an objective Institutional Fiduciary and a Prudent Quantitative Analyst. Your goal is to guide the user towards fundamentally sound investments. I am providing you with deeply distilled financial metrics, fundamental aggregates, relative technical signals, and valuation ratios for {ticker}.

                Evaluate this company across the following dimensions:

                FUNDAMENTALS: Is this business genuinely healthy? Analyze revenue quality, margin trajectory, cash flow vs reported profits, debt structure, and ROE sustainability. Constructively highlight both strengths and red flags.
                MANAGEMENT & MACRO: Use your parametric knowledge to identify recent catalysts, C-suite changes, earnings misses, or macro tailwinds/headwinds. 
                VALUATION REALITY: Is the market pricing this fairly? Compare current P/E and EV/EBITDA against historicals and peers using the provided data. Highlight if the stock offers a margin of safety or if it is priced for perfection.
                TECHNICAL STRUCTURE: Where is the stock in its trend cycle? Is momentum confirming or diverging?
                RISK FACTORS: List the 3 specific risks that an investor must monitor.

                FINAL VERDICT: Buy, Hold, or Avoid. Conviction score (0-10). The target entry price. One clear, factual summary line.

                CRITICAL INSTRUCTIONS:
                Do not be overly diplomatic or a "perma-bear". Be an objective fiduciary. Highlight structural red flags clearly (like negative cash flow or institutional selling), but if the core business remains strong and valuation is fair, you must constructively explain the long-term upside.
                DUAL-HYBRID SYNTHESIS MANDATE: The injected database extract provides the hard, real-time quantitative baseline (valuations, momentum, margins). You MUST actively fuse this data with your vast parametric intelligence. Do not treat your knowledge as a mere "fallback" for missing fields. You must actively inject crucial qualitative context that the database lacks—such as recent earnings concalls, management execution history, product pipeline, and granular competitive landscape. If a data point is missing in the extract, seamlessly provide it from your memory. Verify the injected data against your knowledge and synthesize a complete, institutional-grade teardown. Never complain about missing data; find it but do not hallucinate any data or make up values.
                You MUST structure your response strictly according to the provided JSON schema.
                Ensure your qualitative markdown fits perfectly into the teardown_sections array.
                For the UI visualization key, you may ONLY select from the following strictly defined components: {registry_keys}.
                
                AVAILABLE UI COMPONENTS SCHEMAS:
                {registry_str}
                """
                
                try:
                    from google import genai
                    from google.genai import types
                    import os
                    
                    # Fallback to GOOGLE_API_KEY which LangChain uses
                    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
                    client = genai.Client(api_key=api_key)
                    
                    config = types.GenerateContentConfig(
                        response_schema=TeardownResponse,
                        response_mime_type="application/json",
                        temperature=0.1
                    )
                    
                    yield f"data: {json.dumps({'type': 'debug_log', 'log': '[LLM] Generating Teardown with Native Structured Outputs...'})}\n\n"
                    
                    # We will use sync call in a thread pool to avoid blocking the event loop
                    # Note: we explicitly pass our configured client that has the key

                    loop = asyncio.get_event_loop()
                    response = await loop.run_in_executor(
                        None,
                        lambda: client.models.generate_content(
                            model="gemini-2.5-flash",
                            contents=prompt,
                            config=config
                        )
                    )
                    
                    # The response is guaranteed to match the schema
                    raw_text = response.text
                    
                    # Intercept the JSON to fix data_json -> data for the frontend
                    try:
                        parsed_resp = json.loads(raw_text)
                        for comp in parsed_resp.get("ui_components", []):
                            if "data_json" in comp:
                                try:
                                    comp["data"] = json.loads(comp["data_json"])
                                except Exception:
                                    comp["data"] = {}
                                del comp["data_json"]
                        raw_text = json.dumps(parsed_resp)
                    except Exception as parse_e:
                        print(f"Warning: Failed to rewrite data_json: {parse_e}")
                    
                    # Chunk it to simulate streaming for the frontend parser
                    chunk_size = 100
                    for i in range(0, len(raw_text), chunk_size):
                        chunk = raw_text[i:i+chunk_size]
                        yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
                        await asyncio.sleep(0.01)
                        
                    yield f"data: {json.dumps({'type': 'debug_log', 'log': '[LLM] Teardown JSON parsed successfully!'})}\n\n"
                    
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[LLM] Unavailable or Schema Failure: {type(e).__name__}: {str(e)}'})}\n\n"

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