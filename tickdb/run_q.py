import sys
import os
import pykx as kx
import time

if len(sys.argv) < 3:
    print("Usage: run_q.py <file.q> <port>")
    sys.exit(1)

q_file = sys.argv[1]
port = sys.argv[2]

# Need to be in tickdb dir to load tick.q correctly
os.chdir(os.path.dirname(os.path.abspath(__file__)))

kx.q.system(f"l {q_file}")
kx.q.system(f"p {port}")

print(f"Started {q_file} on port {port}")
while True:
    time.sleep(1)
