import re

with open("agent_api.py", "r") as f:
    content = f.read()

# Fix broken string literals across lines
# specifically: yield f"data: ... }\n\n"
content = re.sub(r'(yield f"data: {json.dumps\([^)]+\)})\s*\n\s*', r'\1}\\n\\n"', content)

with open("agent_api.py", "w") as f:
    f.write(content)

