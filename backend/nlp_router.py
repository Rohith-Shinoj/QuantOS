import spacy
import re

# Load the spaCy NLP pipeline
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    nlp = None

# --- Semantic Dictionaries ---
METRIC_SYNONYMS = {
    "price to earning": "s.pe_ratio",
    "profit growth": "(sm.profit_3yr_cagr * 100)",
    "earnings growth": "(sm.profit_3yr_cagr * 100)",
    "sales growth": "(sm.revenue_3yr_cagr * 100)",
    "revenue growth": "(sm.revenue_3yr_cagr * 100)",
    "return on equity": "sm.roe",
    "return on capital": "sm.roic",
    "market cap": "s.market_cap",
    "valuation": "s.pe_ratio",
    "dividend": "sm.dividend_yield",
    "ev/ebitda": "sm.ev_to_ebitda",
    "alpha": "s.alpha_score",
    "debt": "sm.debt_to_equity",
    "roce": "sm.roic",
    "roe": "sm.roe",
    "peg": "sm.peg_ratio",
    "eps": "sm.eps_ttm",
    "d/e": "sm.debt_to_equity",
    "p/e": "s.pe_ratio",
    "p/b": "sm.pb_ratio",
    "p/s": "sm.price_to_sales",
    "pe": "s.pe_ratio",
    "pb": "sm.pb_ratio",
    "ps": "sm.price_to_sales",
    "roa": "sm.return_on_assets",
}
sorted_metrics = sorted(METRIC_SYNONYMS.keys(), key=len, reverse=True)

INDUSTRY_SYNONYMS = {
    "pharma": "Pharmaceuticals",
    "pharmaceuticals": "Pharmaceuticals",
    "banks": "Banks",
    "banking": "Banks",
    "it": "Information Technology",
    "tech": "Information Technology",
    "software": "Information Technology",
    "auto": "Auto Manufacturers",
    "automobiles": "Auto Manufacturers",
    "fmcg": "FMCG",
    "cement": "Cement",
    "oil": "Oil",
    "energy": "Power",
    "power": "Power",
    "telecom": "Telecom",
    "finance": "Financial Services",
    "nbfc": "Financial Services",
    "chemicals": "Chemicals",
    "infra": "Infrastructure",
    "defence": "Defence",
    "defense": "Defence"
}

MARKET_CAP_FILTERS = {
    "large-cap": "s.market_cap > 25000",
    "large cap": "s.market_cap > 25000",
    "mid-cap": "s.market_cap BETWEEN 5000 AND 25000",
    "mid cap": "s.market_cap BETWEEN 5000 AND 25000",
    "small-cap": "s.market_cap < 5000",
    "small cap": "s.market_cap < 5000",
    "micro-cap": "s.market_cap < 1000"
}

BENCHMARK_VERBS = ["beat", "outperform", "crush", "better", "higher than nifty"]

OPERATOR_MAP = {
    "under": "<", "below": "<", "less than": "<", "<": "<",
    "over": ">", "above": ">", "greater than": ">", ">": ">", "more than": ">",
    "equal to": "=", "=": "="
}

ADJECTIVE_OPERATORS = {
    "positive": {"op": ">", "val": 0},
    "good": {"op": ">", "val": 0},  
    "strong": {"op": ">", "val": 0},
    "high": None,
    "low": None,
    "negative": {"op": "<", "val": 0},
    "weak": {"op": "<", "val": 0},
}

VAGUE_THRESHOLDS = {
    "s.pe_ratio": {"op": "<", "val": 20},
    "sm.roe": {"op": ">", "val": 15},
    "sm.roic": {"op": ">", "val": 15},
    "sm.dividend_yield": {"op": ">", "val": 2.5},
    "s.market_cap": {"op": ">", "val": 10000},
    "sm.debt_to_equity": {"op": "<", "val": 1.0}
}

SECTOR_VAGUE_THRESHOLDS = {
    "Banks": {
        "sm.roe": {"op": ">", "val": 12},
        "sm.roic": {"op": ">", "val": 10},
    },
    "Information Technology": {
        "sm.roe": {"op": ">", "val": 20},
        "sm.roic": {"op": ">", "val": 18},
    },
}

NEGATIVE_GUARD_METRICS = ["s.pe_ratio", "sm.pb_ratio", "sm.price_to_sales", "sm.ev_to_ebitda", "sm.debt_to_equity"]


def parse_natural_language_to_sql(query: str) -> dict:
    if not nlp:
        return {"intent": "QUALITATIVE", "sql_where_clause": "", "select_columns": [], "fallback_reason": "spaCy not loaded", "parsed_logs": [], "conditions": []}

    query_lower = query.lower().replace("%", "")
    doc = nlp(query_lower)

    for ent in doc.ents:
        if ent.label_ in ["DATE", "TIME", "EVENT"]:
            if any(kw in ent.text for kw in ["year", "month", "covid", "crash", "20", "19"]):
                return {
                    "intent": "QUALITATIVE",
                    "sql_where_clause": "",
                    "select_columns": [],
                    "fallback_reason": f"Temporal modifier detected: '{ent.text}' requires historical LLM analysis.",
                    "parsed_logs": [], "conditions": []
                }

    is_relative = any(token.lemma_ in BENCHMARK_VERBS or token.text in BENCHMARK_VERBS for token in doc)

    sql_conditions = []
    select_columns = {"ticker": "s.ticker", "name": "s.name as Name"}
    parsed_logs = []
    conditions_list = []
    mentioned_metrics = []

    industry_match = None
    for token in doc:
        if token.text in INDUSTRY_SYNONYMS:
            industry_match = INDUSTRY_SYNONYMS[token.text]
            break

    if industry_match:
        sql_conditions.append(f"s.industry = '{industry_match}'")
        parsed_logs.append(f"Sector: {industry_match}")
        select_columns["industry"] = "s.industry"
        conditions_list.append({"col": "s.industry", "op": "=", "val": industry_match})

    for cap_key, cap_sql in MARKET_CAP_FILTERS.items():
        if cap_key in query_lower:
            sql_conditions.append(cap_sql)
            parsed_logs.append(f"Market Cap: {cap_key.title()}")
            select_columns["market_cap"] = "s.market_cap as market_cap"
            break

    # Count pattern extraction to exclude from numeric logic
    count_pattern = re.compile(r'(?:top|show|find|give|list)\s+(\d+)|(\d+)\s+(?:stocks|companies|results)')
    excluded_number_indices = set()
    for m in count_pattern.finditer(query_lower):
        if m.start(1) != -1:
            excluded_number_indices.add(m.start(1))
        elif m.start(2) != -1:
            excluded_number_indices.add(m.start(2))

    claimed_numbers = set()
    
    query_clean = re.sub(r'([<>])\s*(\d+)', r' \1 \2 ', query_lower)
    original_query = query_clean
    
    mentioned = []
    for metric_synonym in sorted_metrics:
        idx = query_clean.find(metric_synonym)
        while idx != -1:
            is_valid = True
            if idx > 0 and query_clean[idx-1].isalpha():
                is_valid = False
            end_idx = idx + len(metric_synonym)
            if end_idx < len(query_clean) and query_clean[end_idx].isalpha():
                is_valid = False
                
            if is_valid:
                db_col = METRIC_SYNONYMS[metric_synonym]
                mentioned.append({
                    "synonym": metric_synonym,
                    "db_col": db_col,
                    "idx": idx,
                    "end_idx": end_idx
                })
                mentioned_metrics.append(db_col)
                alias = db_col.split('.')[-1].replace('(', '').replace(')', '').replace('* 100', '').replace(' ', '').strip()
                select_columns[alias] = f"{db_col} as {alias}"
            
            # Mask out found metric so shorter metrics don't trigger (e.g. profit growth vs profit)
            query_clean = query_clean[:idx] + (" " * len(metric_synonym)) + query_clean[end_idx:]
            idx = query_clean.find(metric_synonym)

    # Between
    between_pattern = re.compile(r'between\s+(\d+\.?\d*)\s+and\s+(\d+\.?\d*)')
    for b_match in between_pattern.finditer(original_query):
        best_metric = None
        min_dist = 30
        for m in mentioned:
            dist = min(abs(m['idx'] - b_match.start()), abs(m['end_idx'] - b_match.start()))
            if dist < min_dist:
                min_dist = dist
                best_metric = m
        
        if best_metric:
            val1, val2 = map(float, b_match.groups())
            sql_conditions.append(f"{best_metric['db_col']} BETWEEN {val1} AND {val2}")
            parsed_logs.append(f"{best_metric['synonym'].upper()} BETWEEN {val1} AND {val2}")
            conditions_list.append({"col": best_metric['db_col'], "op": "BETWEEN", "val": (val1, val2)})
            claimed_numbers.update([b_match.start(1), b_match.start(2)])
            best_metric['assigned'] = True

    # Standalone numbers
    pattern = re.compile(r'(under|below|less than|<|over|above|greater than|>|more than)?\s*(\d+\.?\d*)')
    for match in pattern.finditer(original_query):
        num_idx = match.start(2)
        if num_idx in claimed_numbers or num_idx in excluded_number_indices:
            continue
            
        op_str, val_str = match.groups()
        
        best_metric = None
        min_dist = 30
        for m in mentioned:
            dist = min(abs(m['idx'] - match.start()), abs(m['end_idx'] - match.start()))
            if dist < min_dist:
                min_dist = dist
                best_metric = m
                
        if best_metric:
            db_col = best_metric['db_col']
            if not op_str:
                op = "="
                for o_str, o_sym in OPERATOR_MAP.items():
                    if o_str in original_query[max(0, num_idx-15):num_idx] or o_str in original_query[max(0, best_metric['idx']-15):best_metric['idx']]:
                        op = o_sym
                        break
            else:
                op = OPERATOR_MAP.get(op_str.strip(), "=")
                
            val_num = float(val_str)
            sql_conditions.append(f"{db_col} {op} {val_str}")
            parsed_logs.append(f"{best_metric['synonym'].upper()} {op} {val_str}")
            conditions_list.append({"col": db_col, "op": op, "val": val_num})
            
            if op == "<" and db_col in NEGATIVE_GUARD_METRICS:
                sql_conditions.append(f"{db_col} > 0")
                parsed_logs.append(f"Implicit guard: {db_col} > 0 (negative indicates loss)")
                conditions_list.append({"col": db_col, "op": ">", "val": 0})
                
            claimed_numbers.add(num_idx)
            best_metric['assigned'] = True

    # Adjectives
    for adj, info in ADJECTIVE_OPERATORS.items():
        for match in re.finditer(r'\b' + adj + r'\b', original_query):
            adj_idx = match.start()
            best_metric = None
            min_dist = 30
            for m in mentioned:
                dist = min(abs(m['idx'] - adj_idx), abs(m['end_idx'] - adj_idx))
                if dist < min_dist:
                    min_dist = dist
                    best_metric = m
            
            if best_metric:
                db_col = best_metric['db_col']
                is_negated = False
                if "not" in original_query[max(0, adj_idx-8):adj_idx] or "n't" in original_query[max(0, adj_idx-8):adj_idx] or "no" in original_query[max(0, adj_idx-8):adj_idx]:
                    is_negated = True
                    
                if info is not None:
                    op = info["op"]
                    val = info["val"]
                    if is_negated:
                        op = "<" if op == ">" else ">"
                    sql_conditions.append(f"{db_col} {op} {val}")
                    parsed_logs.append(f"Qualitative '{adj}': {best_metric['synonym'].upper()} {op} {val}")
                    conditions_list.append({"col": db_col, "op": op, "val": val})
                else:
                    t_dict = VAGUE_THRESHOLDS.get(db_col)
                    if industry_match and industry_match in SECTOR_VAGUE_THRESHOLDS and db_col in SECTOR_VAGUE_THRESHOLDS[industry_match]:
                        t_dict = SECTOR_VAGUE_THRESHOLDS[industry_match][db_col]
                        
                    if t_dict:
                        op = t_dict["op"]
                        val = t_dict["val"]
                        invert = (adj == "low") ^ is_negated
                        if invert:
                            op = "<" if op == ">" else ">"
                        sql_conditions.append(f"{db_col} {op} {val}")
                        parsed_logs.append(f"Qualitative '{adj}': {best_metric['synonym'].upper()} {op} {val}")
                        conditions_list.append({"col": db_col, "op": op, "val": val})
                        if op == "<" and db_col in NEGATIVE_GUARD_METRICS:
                            sql_conditions.append(f"{db_col} > 0")
                            parsed_logs.append(f"Implicit guard: {db_col} > 0 (negative indicates loss)")
                            conditions_list.append({"col": db_col, "op": ">", "val": 0})
                
                best_metric['assigned'] = True

    # Fallback to vague thresholds
    for m in mentioned:
        if not m.get('assigned'):
            db_col = m['db_col']
            t_dict = VAGUE_THRESHOLDS.get(db_col)
            if industry_match and industry_match in SECTOR_VAGUE_THRESHOLDS and db_col in SECTOR_VAGUE_THRESHOLDS[industry_match]:
                t_dict = SECTOR_VAGUE_THRESHOLDS[industry_match][db_col]
                
            if t_dict:
                op = t_dict["op"]
                val = t_dict["val"]
                sql_conditions.append(f"{db_col} {op} {val}")
                parsed_logs.append(f"Vague '{m['synonym']}' -> {op} {val}")
                conditions_list.append({"col": db_col, "op": op, "val": val})
                if op == "<" and db_col in NEGATIVE_GUARD_METRICS:
                    sql_conditions.append(f"{db_col} > 0")
                    parsed_logs.append(f"Implicit guard: {db_col} > 0 (negative indicates loss)")
                    conditions_list.append({"col": db_col, "op": ">", "val": 0})

    if is_relative:
        sql_conditions.append("s.alpha_score > 0")
        select_columns["alpha_score"] = "s.alpha_score as Alpha"
        parsed_logs.append("Relative Benchmark: Beating NIFTY (Alpha > 0)")
        conditions_list.append({"col": "s.alpha_score", "op": ">", "val": 0})

    if len(sql_conditions) == 0:
        return {
            "intent": "QUALITATIVE",
            "sql_where_clause": "",
            "select_columns": [],
            "fallback_reason": "No quantitative metrics or industries identified.",
            "parsed_logs": parsed_logs,
            "conditions": conditions_list,
            "mentioned_metrics": mentioned_metrics
        }
        
    if len(sql_conditions) == 1 and industry_match:
        sql_conditions.append("s.market_cap > 1000")
        parsed_logs.append("Added default filter: Market Cap > 1000")
        conditions_list.append({"col": "s.market_cap", "op": ">", "val": 1000})

    where_clause = " AND ".join(sql_conditions)
    
    return {
        "intent": "QUANTITATIVE",
        "sql_where_clause": where_clause,
        "select_columns": list(select_columns.values()),
        "parsed_logs": parsed_logs,
        "conditions": conditions_list,
        "mentioned_metrics": list(set(mentioned_metrics))
    }
