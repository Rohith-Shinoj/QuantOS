with open('backend/screener_api.py', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    # If it ends with .",\n or .", \n and doesn't have )
    if '":' in line and (line.rstrip().endswith(',"')) or line.rstrip().endswith('",'):
        if line.count('(') > line.count(')'):
            # It's missing a closing parenthesis before the trailing comma
            line = line.rstrip()
            if line.endswith(','):
                line = line[:-1] + '),\n'
    
    # Actually, let's just use regex to fix: `",\n` where it's part of a tuple missing `)`
    new_lines.append(line)

# Wait, a more robust way: 
# Look for lines containing `": (` that end with `",` instead of `"),`
res = []
for line in lines:
    stripped = line.rstrip()
    if '":' in stripped and stripped.endswith('",'):
        if '(' in stripped and not stripped.endswith('"),'):
            # Replace trailing `,` with `),`
            line = stripped[:-1] + '),\n'
    res.append(line)

with open('backend/screener_api.py', 'w') as f:
    f.writelines(res)

print("Fixed")
