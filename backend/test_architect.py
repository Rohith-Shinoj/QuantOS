import asyncio
from agent_engine.graph import architect_node
from langchain_core.messages import HumanMessage

async def main():
    state = {
        "messages": [
            HumanMessage(content="Tell me about Hindustan Aeronauticals stocks"),
            HumanMessage(content="Describe me the full fundamentals of this stock")
        ],
        "ticker": "UNKNOWN"
    }
    result = await architect_node(state, None)
    print("ARCHITECT RESULT:", result)

asyncio.run(main())
