import re

with open('agent_api.py', 'r') as f:
    content = f.read()

new_logic = """
    # --- HYBRID INTERCEPTOR: DB FIRST EXECUTION ---
    try:
        from nlp_router import parse_natural_language_to_sql
        import duckdb
        import os
        from langchain_google_genai import ChatGoogleGenerativeAI
        import httpx
        from google.api_core.exceptions import ResourceExhausted
        
        parsed = parse_natural_language_to_sql(query)
        
        yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[NLP] Intent: {parsed.get(\\'intent\\')}'})}\n\n"
        if parsed.get('sql_where_clause'):
            yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[NLP] SQL WHERE: {parsed.get(\\'sql_where_clause\\')}'})}\n\n"
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
            
            prompt = f"The user asked: '{query}'\\n"
            prompt += f"Parsed DB SQL WHERE clause: '{parsed['sql_where_clause']}'\\n"
            prompt += f"Slim DB results: {json.dumps(llm_payload)}\\n"
            if len(output) > MAX_LLM_ROWS:
                prompt += f"\\nNote: DB returned {len(output)} total rows. Showing top {MAX_LLM_ROWS} by market cap."
                
            prompt += \"\"\"
            
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
\"\"\"
            
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
                                yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[LLM] ADD {row_dict.get(\\'ticker\\')}: passed condition check — merged'})}\n\n"
                            else:
                                yield f"data: {json.dumps({'type': 'debug_log', 'log': f'[LLM] ADD {row_dict.get(\\'ticker\\')}: FAILED condition check — skipped'})}\n\n"
                    
                    # Sort final output by market cap desc
                    final_output.sort(key=lambda x: x.get('market_cap', 0) or 0, reverse=True)
                    
                    yield f"data: {json.dumps({'type': 'hybrid_data', 'data': final_output, 'logs': parsed.get('parsed_logs', []), 'unverified': False, 'parse_failed': False})}\n\n"
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
                
"""

start_str = "    # --- HYBRID INTERCEPTOR: DB FIRST EXECUTION ---"
end_str = "    except Exception as e:\n        print(f\"Hybrid Interceptor Error: {e}\")"

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + new_logic[4:] + content[end_idx:]
    with open('agent_api.py', 'w') as f:
        f.write(new_content)
    print("Replaced logic successfully")
else:
    print("Could not find boundaries")
