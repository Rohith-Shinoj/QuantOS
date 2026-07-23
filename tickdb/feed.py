"""
Finugreek Feed Handler — Binance WebSocket → kdb+ Tickerplant
Connects to Binance combined streams, decodes JSON, publishes via PyKX.
Run as: python tickdb/feed.py
"""

import asyncio
import json
import time
import sys
import os
import signal
from datetime import datetime, timezone
import numpy as np

# ── Symbol Universe (hardcoded — no separate config file) ───
SYMBOLS = ["btcusdt", "ethusdt", "solusdt", "bnbusdt", "xrpusdt", "dogeusdt"]

# ── Binance WebSocket Configuration ─────────────────────────
# Combined streams: trade + depth20@100ms per symbol
# Max 1024 streams per connection, max 5 connections per IP
# We use ~12 streams in 1 connection — well within limits.
STREAMS = []
for sym in SYMBOLS:
    STREAMS.append(f"{sym}@trade")
    STREAMS.append(f"{sym}@depth20@100ms")

BINANCE_URL = f"wss://stream.binance.com:9443/stream?streams={'/'.join(STREAMS)}"

# ── kdb+ Tickerplant Configuration ──────────────────────────
TP_HOST = os.environ.get("TP_HOST", "localhost")
TP_PORT = int(os.environ.get("TP_PORT", "5010"))


class TickPublisher:
    """Publishes normalized ticks to kdb+ Tickerplant via PyKX IPC."""

    def __init__(self, host: str = TP_HOST, port: int = TP_PORT):
        self.host = host
        self.port = port
        self.conn = None
        self._connect()

    def _connect(self):
        try:
            import pykx as kx
            self.kx = kx
            self.conn = kx.SyncQConnection(host=self.host, port=self.port)
            print(f"[Publisher] Connected to Tickerplant at {self.host}:{self.port}")
        except Exception as e:
            print(f"[Publisher] Cannot connect to Tickerplant: {e}")
            self.conn = None

    def _reconnect(self):
        try:
            if self.conn is not None:
                try:
                    self.conn.close()
                except Exception:
                    pass
            self._connect()
        except Exception as e:
            print(f"[Publisher] Reconnect failed: {e}")
            self.conn = None

    def publish_trade(self, sym: str, price: float, size: float, side: str, timestamp_ns: int):
        """Publish a single trade to the tickerplant."""
        if self.conn is None:
            self._reconnect()
            if self.conn is None:
                return False
        try:
            kx = self.kx
            self.conn(
                ".u.upd",
                kx.SymbolAtom("trade"),
                [
                    kx.toq(np.datetime64(timestamp_ns, 'ns')),
                    kx.SymbolAtom(sym),
                    kx.FloatAtom(price),
                    kx.FloatAtom(size),
                    kx.SymbolAtom(side),
                ],
            )
            return True
        except Exception as e:
            print(f"[Publisher] Trade publish failed: {e}")
            self._reconnect()
            return False

    def publish_quote(self, sym: str, bid: float, ask: float, bsize: float, asize: float, timestamp_ns: int):
        """Publish a top-of-book quote derived from depth level 1."""
        if self.conn is None:
            return False
        try:
            kx = self.kx
            self.conn(
                ".u.upd",
                kx.SymbolAtom("quote"),
                [
                    kx.toq(np.datetime64(timestamp_ns, 'ns')),
                    kx.SymbolAtom(sym),
                    kx.FloatAtom(bid),
                    kx.FloatAtom(ask),
                    kx.FloatAtom(bsize),
                    kx.FloatAtom(asize),
                ],
            )
            return True
        except Exception as e:
            print(f"[Publisher] Quote publish failed: {e}")
            self._reconnect()
            return False

    def publish_depth(self, sym: str, levels: list, timestamp_ns: int):
        """
        Publish L2 order book depth snapshot.
        levels: list of (level_num, bid_price, ask_price, bid_size, ask_size)
        """
        if self.conn is None:
            return False
        try:
            kx = self.kx
            for lvl_num, bid, ask, bsize, asize in levels:
                self.conn(
                    ".u.upd",
                    kx.SymbolAtom("depth"),
                    [
                        kx.toq(np.datetime64(timestamp_ns, 'ns')),
                        kx.SymbolAtom(sym),
                        kx.IntAtom(lvl_num),
                        kx.FloatAtom(bid),
                        kx.FloatAtom(ask),
                        kx.FloatAtom(bsize),
                        kx.FloatAtom(asize),
                    ],
                )
            return True
        except Exception as e:
            print(f"[Publisher] Depth publish failed: {e}")
            self._reconnect()
            return False


def normalize_trade(data: dict) -> dict:
    """
    Normalize a Binance trade event.
    Binance trade JSON:
    {
      "e": "trade", "s": "BTCUSDT", "p": "63241.50", "q": "0.004",
      "T": 1690000000000, "m": true  (m=true means buyer is maker → seller aggressor → side=sell)
    }
    """
    return {
        "sym": data["s"],
        "price": float(data["p"]),
        "size": float(data["q"]),
        "side": "sell" if data.get("m", False) else "buy",
        "timestamp_ns": int(data["T"]) * 1_000_000,  # ms → ns
    }


def normalize_depth(data: dict, sym_from_stream: str = "") -> dict:
    """
    Normalize a Binance depth event.
    Binance depth JSON:
    {
      "e": "depthUpdate", "s": "BTCUSDT",
      "b": [["63241.00", "1.200"], ...],  # bids: [price, qty]
      "a": [["63242.00", "0.800"], ...],  # asks: [price, qty]
    }
    """
    sym = data.get("s", sym_from_stream)
    timestamp_ns = int(time.time_ns())
    bids = data.get("b", data.get("bids", []))
    asks = data.get("a", data.get("asks", []))

    # Pair up bid/ask levels
    max_levels = max(len(bids), len(asks))
    levels = []
    for i in range(min(max_levels, 20)):
        bid_price = float(bids[i][0]) if i < len(bids) else 0.0
        bid_size = float(bids[i][1]) if i < len(bids) else 0.0
        ask_price = float(asks[i][0]) if i < len(asks) else 0.0
        ask_size = float(asks[i][1]) if i < len(asks) else 0.0
        levels.append((i + 1, bid_price, ask_price, bid_size, ask_size))

    # Derive top-of-book quote from level 1
    quote = None
    if len(bids) > 0 and len(asks) > 0:
        quote = {
            "sym": sym,
            "bid": float(bids[0][0]),
            "ask": float(asks[0][0]),
            "bsize": float(bids[0][1]),
            "asize": float(asks[0][1]),
            "timestamp_ns": timestamp_ns,
        }

    return {
        "sym": sym,
        "levels": levels,
        "quote": quote,
        "timestamp_ns": timestamp_ns,
    }


# ── Statistics Tracking ─────────────────────────────────────
class Stats:
    def __init__(self):
        self.trade_count = 0
        self.depth_count = 0
        self.quote_count = 0
        self.errors = 0
        self.start_time = time.time()
        self.last_report = time.time()

    def report(self):
        now = time.time()
        if now - self.last_report >= 10.0:  # report every 10s
            elapsed = now - self.start_time
            rate = self.trade_count / elapsed if elapsed > 0 else 0
            print(
                f"[Stats] Trades: {self.trade_count} | "
                f"Depth: {self.depth_count} | "
                f"Quotes: {self.quote_count} | "
                f"Rate: {rate:.1f} trades/sec | "
                f"Errors: {self.errors} | "
                f"Uptime: {elapsed:.0f}s"
            )
            self.last_report = now


# ── Main Async Loop ─────────────────────────────────────────
async def run_feed(publisher: TickPublisher, stats: Stats):
    """Connect to Binance and stream ticks to kdb+."""
    try:
        import websockets
    except ImportError:
        print("ERROR: 'websockets' package not installed. Run: pip install websockets")
        sys.exit(1)

    backoff = 1
    max_backoff = 30

    while True:
        try:
            print(f"[Feed] Connecting to Binance... ({len(SYMBOLS)} symbols, {len(STREAMS)} streams)")
            async with websockets.connect(BINANCE_URL, ping_interval=20, ping_timeout=10) as ws:
                print("[Feed] Connected to Binance WebSocket")
                backoff = 1  # reset on successful connect

                async for raw_msg in ws:
                    try:
                        msg = json.loads(raw_msg)
                        data = msg.get("data", msg)  # combined stream wraps in {"stream": ..., "data": ...}
                        event_type = data.get("e", "")

                        if event_type == "trade":
                            trade = normalize_trade(data)
                            publisher.publish_trade(
                                trade["sym"], trade["price"], trade["size"],
                                trade["side"], trade["timestamp_ns"]
                            )
                            stats.trade_count += 1

                        elif event_type == "depthUpdate" or "bids" in data:
                            stream_name = msg.get("stream", "")
                            sym_from_stream = stream_name.split("@")[0].upper() if stream_name else ""
                            depth = normalize_depth(data, sym_from_stream)
                            publisher.publish_depth(
                                depth["sym"], depth["levels"], depth["timestamp_ns"]
                            )
                            stats.depth_count += 1

                            if depth["quote"]:
                                q = depth["quote"]
                                publisher.publish_quote(
                                    q["sym"], q["bid"], q["ask"],
                                    q["bsize"], q["asize"], q["timestamp_ns"]
                                )
                                stats.quote_count += 1

                    except Exception as e:
                        stats.errors += 1
                        if stats.errors % 100 == 1:
                            print(f"[Feed] Message processing error: {e}")

                    stats.report()

        except asyncio.CancelledError:
            print("[Feed] Shutting down...")
            break
        except Exception as e:
            print(f"[Feed] Connection error: {e}. Reconnecting in {backoff}s...")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, max_backoff)


def main():
    print("=" * 60)
    print("Finugreek Feed Handler — Binance → kdb+ Tickerplant")
    print(f"Symbols: {', '.join(s.upper() for s in SYMBOLS)}")
    print(f"Tickerplant: {TP_HOST}:{TP_PORT}")
    print("=" * 60)

    publisher = TickPublisher()
    stats = Stats()

    # Graceful shutdown on SIGINT/SIGTERM
    loop = asyncio.new_event_loop()

    def shutdown(sig, frame):
        print(f"\n[Feed] Received signal {sig}, shutting down...")
        for task in asyncio.all_tasks(loop):
            task.cancel()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        loop.run_until_complete(run_feed(publisher, stats))
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        print(f"\n[Feed] Final stats — Trades: {stats.trade_count}, Depth: {stats.depth_count}, Errors: {stats.errors}")
        loop.close()


if __name__ == "__main__":
    main()
