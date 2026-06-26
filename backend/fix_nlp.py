import re

# ... I will just replace the parsing logic in nlp_router.py ...
with open('nlp_router.py', 'r') as f:
    content = f.read()

new_logic = """
    # 4. Extract Metrics
    query_clean = re.sub(r'([<>])\s*(\d+)', r' \1 \2 ', query_lower)
    original_query = query_clean

    mentioned = []
    # Find all mentioned metrics
    for metric_synonym in sorted_metrics:
        idx = query_clean.find(metric_synonym)
        while idx != -1:
            # Check boundaries to avoid matching "pe" in "rupee"
            # simple check:
            is_valid = True
            if idx > 0 and query_clean[idx-1].isalpha():
                is_valid = False
            end_idx = idx + len(metric_synonym)
            if end_idx < len(query_clean) and query_clean[end_idx].isalpha():
                is_valid = False
                
            if is_valid:
                mentioned.append({
                    "synonym": metric_synonym,
                    "db_col": METRIC_SYNONYMS[metric_synonym],
                    "idx": idx,
                    "end_idx": end_idx
                })
                mentioned_metrics.append(METRIC_SYNONYMS[metric_synonym])
                alias = METRIC_SYNONYMS[metric_synonym].split('.')[-1].replace('(', '').replace(')', '').replace('* 100', '').replace(' ', '').strip()
                select_columns[alias] = f"{METRIC_SYNONYMS[metric_synonym]} as {alias}"
            
            # Mask out
            query_clean = query_clean[:idx] + (" " * len(metric_synonym)) + query_clean[end_idx:]
            idx = query_clean.find(metric_synonym)

    # Find between numbers
    between_pattern = re.compile(r'between\s+(\d+\.?\d*)\s+and\s+(\d+\.?\d*)')
    for b_match in between_pattern.finditer(original_query):
        # Find closest metric
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

    # Find standalone numbers
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

    # Check qualitative adjectives
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
                if "not" in original_query[max(0, adj_idx-8):adj_idx] or "n't" in original_query[max(0, adj_idx-8):adj_idx]:
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

    # Fallback to vague thresholds for unassigned metrics
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
"""

start_str = "    # Pre-process operators\n    query_clean = re.sub(r'([<>])\s*(\d+)', r' \1 \2 ', query_lower)"
end_str = "    if is_relative:"

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + new_logic[4:] + content[end_idx:]
    with open('nlp_router.py', 'w') as f:
        f.write(new_content)
    print("Replaced logic successfully")
else:
    print("Could not find boundaries")
