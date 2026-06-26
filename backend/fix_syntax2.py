import re

with open("agent_api.py", "r") as f:
    content = f.read()

# Replace any unterminated f-strings where the newline got messed up
content = re.sub(r'yield f"data: (.*?)}\n\n"', r'yield f"data: \1}}\\n\\n"', content)
# wait, actually the problem is that when I wrote the python script initially, I used `\n\n` in the string which got interpreted literally by `cat << 'EOF'` or something, splitting the string across multiple lines in python.
# Let's fix that.

import ast

try:
    ast.parse(content)
    print("Syntax OK")
except SyntaxError as e:
    print(f"Syntax Error: {e.lineno}")
    lines = content.split('\n')
    for i in range(max(0, e.lineno - 5), min(len(lines), e.lineno + 5)):
        print(f"{i+1}: {lines[i]}")
