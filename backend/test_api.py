import asyncio
from agent_api import stream_agent_events

async def main():
    async for event in stream_agent_events("SCREEN", "find defence stocks with PE below 20 but positive profit growth"):
        print(event, end="")
        
if __name__ == "__main__":
    asyncio.run(main())
