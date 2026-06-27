import json
import glob
import os
from datetime import datetime

def parse_quarter_date(q_str):
    try:
        m, y = q_str.split(" '")
        months = {"Jan":1, "Feb":2, "Mar":3, "Apr":4, "May":5, "Jun":6, 
                  "Jul":7, "Aug":8, "Sep":9, "Oct":10, "Nov":11, "Dec":12}
        return datetime(2000 + int(y), months[m], 1)
    except: return datetime(1900, 1, 1)

def get_nested(data, path, default=float('nan')):
    keys = path.split('.')
    for key in keys:
        if isinstance(data, dict): data = data.get(key)
        else: return default
    return data if data is not None else default

for abs_file in glob.glob('datasets/A/absolute_dataset/*.json'):
    slug = os.path.basename(abs_file)
    rel_file = os.path.join('datasets/A/relative_dataset', slug)
    
    if not os.path.exists(rel_file): continue
    
    with open(abs_file, 'r') as f: abs_data = json.load(f)
    with open(rel_file, 'r') as f: rel_data = json.load(f)
    
    shp = abs_data.get("shareHoldingPattern", {})
    try: qs = sorted([q for q in shp.keys() if isinstance(shp[q], dict)], key=parse_quarter_date)
    except: qs = []
    
    if len(qs) >= 2:
        t, t1 = qs[-1], qs[-2]
        def get_inst(q): 
            return get_nested(shp[q], "mutualFunds.percent", 0.0) + get_nested(shp[q], "foreignInstitutions.percent", 0.0) + get_nested(shp[q], "otherDomesticInstitutions.percent", 0.0)
            
        inst_t, inst_t1 = get_inst(t), get_inst(t1)
        accum = inst_t - inst_t1
        
        if "shareholding_momentum_vectors" in rel_data:
            rel_data["shareholding_momentum_vectors"]["institutional_accumulation_qoq"] = accum
            with open(rel_file, 'w') as f: json.dump(rel_data, f, indent=4)
            
print("Patching complete!")
