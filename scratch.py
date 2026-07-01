import re
import ast

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Find the STOCK_METRICS dictionary
    # We will just regex replace the 4-tuple lines.
    # Looking for lines like: "key": ("sql", "label", "group", "type"),
    
    # Actually it's easier to just do it via regex
    # Match: "key": (..., ..., ..., ...),
    
    new_lines = []
    for line in content.split('\n'):
        # simple check if line looks like a metric definition without description
        if '":' in line and '),' in line and line.strip().startswith('"'):
            # Count commas inside the parenthesis to see if it's a 4-tuple
            parts = line.split('(')
            if len(parts) >= 2:
                in_parens = parts[-1].split(')')[0]
                # It's a bit fragile, let's just use Python's ast to parse the dict and rewrite? No, we lose formatting.
                pass
    
    # A safer regex:
    # Match strings ending with: "type"),
    # Replace with "type", "Description"),
    
    modified = re.sub(r'(,\s*"[^"]+"\s*)\),', r'\1, ""),', content)
    
    with open(filepath, 'w') as f:
        f.write(modified)
    print("Done")

process_file('backend/screener_api.py')
process_file('backend/mf_screener_api.py')
