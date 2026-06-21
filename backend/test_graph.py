import asyncio
from agent_engine.graph import app
from langchain_core.messages import HumanMessage

async def main():
    initial_state = {
        "messages": [HumanMessage(content="What are the institutional holdings and the movemeent of smart money for SBIN")],
        "ticker": "SBIN"
    }
    
    async for event in app.astream(initial_state, stream_mode="values"):
        messages = event.get("messages", [])
        if messages:
            last_msg = messages[-1]
            print(f"\n--- {last_msg.__class__.__name__} ---")
            if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
                print("TOOL CALLS:", last_msg.tool_calls)
            else:
                print("CONTENT:", last_msg.content)
            
        if "selected_schemas" in event:
            print("SELECTED SCHEMAS:", event["selected_schemas"])

asyncio.run(main())
