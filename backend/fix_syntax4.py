with open("agent_api.py", "r") as f:
    lines = f.readlines()

out = []
i = 0
while i < len(lines):
    line = lines[i]
    if "yield f\"data: {json.dumps" in line and not line.rstrip().endswith('"'):
        # It's broken
        out.append(line.rstrip() + "\\n\\n\"\n")
        # skip the next empty lines and the line with just a quote
        i += 1
        while i < len(lines) and (lines[i].strip() == "" or lines[i].strip() == '"'):
            i += 1
        continue
    out.append(line)
    i += 1

with open("agent_api.py", "w") as f:
    f.writelines(out)
