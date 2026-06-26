with open("agent_api.py", "r") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if line.strip() == '"':
        continue
    new_lines.append(line)
    
with open("agent_api.py", "w") as f:
    f.write("".join(new_lines))

