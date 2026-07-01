import re

with open('backend/screener_api.py', 'r') as f:
    content = f.read()

# Replace empty strings with some generic text if they are still ""
def replacer(match):
    prefix = match.group(1)
    label = match.group(2)
    # The empty string is match.group(3) which is `""`
    return f'{prefix}"{label}."'

content = re.sub(r'(\([^\)]+,\s*"([^"]+)",\s*"[^"]+",\s*"[^"]+",\s*)"([^"]*)"\)', replacer, content)

with open('backend/screener_api.py', 'w') as f:
    f.write(content)

print("Done")
