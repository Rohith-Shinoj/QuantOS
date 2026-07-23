"""
Finugreek Crypto API — FastAPI Router + PyKX Connection Pool
All /api/crypto/* endpoints for the kdb+ real-time crypto module.
Includes WebSocket relay at /ws/crypto.
"""

import os
import json
import asyncio
import time
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import JSONResponse

router = APIRouter()

# ============================================================
# PyKX Connection Pool (inline singleton)
# ============================================================

class KDBPool:
    """Thread-safe singleton connection to kdb+ RDB via PyKX."""

    _rdb = None
    _hdb = None
    _last_attempt = 0
    _retry_interval = 5  # seconds between reconnect attempts

    @classmethod
    def _try_connect(cls, port: int):
        try:
            import pykx as kx
            conn = kx.SyncQConnection(
                host=os.environ.get("KDB_HOST", "localhost"),
                port=port,
                timeout=2.0
            )
            return conn
        except Exception:
            return None

    @classmethod
    def rdb(cls):
        """Get connection to RDB (port 5011). Returns None if offline."""
        now = time.time()
        if cls._rdb is None and (now - cls._last_attempt) > cls._retry_interval:
            cls._last_attempt = now
            cls._rdb = cls._try_connect(int(os.environ.get("RDB_PORT", "5011")))
            if cls._rdb:
                print("[KDBPool] Connected to RDB")
        return cls._rdb

    @classmethod
    def query(cls, q_expr: str, *args):
        """Execute a q expression against the RDB. Returns None if offline."""
        conn = cls.rdb()
        if conn is None:
            return None
        try:
            result = conn(q_expr, *args) if args else conn(q_expr)
            return result
        except Exception as e:
            print(f"[KDBPool] Query failed: {e}")
            cls._rdb = None  # force reconnect next time
            return None

    @classmethod
    def query_to_dict(cls, q_expr: str, *args) -> Optional[list]:
        """Execute q and convert result to list of dicts (Python-friendly)."""
        result = cls.query(q_expr, *args)
        if result is None:
            return None
        try:
            import pykx as kx
            if isinstance(result, kx.Table) or isinstance(result, kx.KeyedTable):
                return result.pd().reset_index().to_dict(orient="records")
            elif isinstance(result, kx.Dictionary):
                return result.py()
            else:
                return result.py()
        except Exception as e:
            print(f"[KDBPool] Conversion failed: {e}")
            return None

    @classmethod
    def is_connected(cls) -> bool:
        """Check if RDB is reachable."""
        conn = cls.rdb()
        if conn is None:
            return False
        try:
            conn("1+1")
            return True
        except Exception:
            cls._rdb = None
            return False


# ============================================================
# Helper: offline response
# ============================================================

def offline_response(detail: str = "kdb+ is not running"):
    return JSONResponse(
        status_code=503,
        content={"status": "offline", "detail": detail}
    )


# ============================================================
# REST Endpoints — /api/crypto/*
# ============================================================

@router.get("/api/crypto/status")
async def crypto_status():
    """System health: TP/RDB status, active symbols, tick count."""
    if not KDBPool.is_connected():
        return {"status": "offline", "rdb": "down", "ticks_today": 0, "symbols": []}

    try:
        tick_count = KDBPool.query("count trade")
        symbols = KDBPool.query("distinct exec sym from trade")
        import pykx as kx
        return {
            "status": "online",
            "rdb": "up",
            "ticks_today": int(tick_count.py()) if tick_count is not None else 0,
            "symbols": list(symbols.py()) if symbols is not None else [],
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@router.get("/api/crypto/vwap/{sym}")
async def crypto_vwap(sym: str):
    """Real-time VWAP for a symbol."""
    result = KDBPool.query_to_dict(f"vwap[`{sym.upper()}]")
    if result is None:
        return offline_response()
    return {"data": result[0] if isinstance(result, list) and len(result) > 0 else result}


@router.get("/api/crypto/ohlc/{sym}")
async def crypto_ohlc(sym: str, bar: str = Query(default="1m")):
    """OHLC bars for a symbol. bar: 1m, 5m, 1h."""
    bar_map = {"1m": "0D00:01", "5m": "0D00:05", "1h": "0D01:00", "1s": "0D00:00:01"}
    q_bar = bar_map.get(bar, "0D00:01")
    result = KDBPool.query_to_dict(f"ohlcBars[`{sym.upper()}; {q_bar}]")
    if result is None:
        return offline_response()
    # Convert timestamps to ISO strings for JSON serialization and map keys
    bars = []
    if isinstance(result, list):
        # Key mappings from KDB (r.q) to Frontend (CryptoLive.tsx)
        key_map = {
            'bucket': 'time',
            'o': 'open',
            'h': 'high',
            'l': 'low',
            'c': 'close',
            'v': 'volume'
        }
        for row in result:
            bar_data = {}
            for k, v in row.items():
                mapped_k = key_map.get(k, k)
                if hasattr(v, 'isoformat'):
                    bar_data[mapped_k] = v.isoformat()
                elif hasattr(v, 'timestamp'):
                    bar_data[mapped_k] = int(v.timestamp() * 1000)
                else:
                    bar_data[mapped_k] = float(v) if isinstance(v, (int, float)) else str(v)
            bars.append(bar_data)
    return {"data": bars}


@router.get("/api/crypto/orderbook/{sym}")
async def crypto_orderbook(sym: str):
    """L2 order book depth (20 levels)."""
    result = KDBPool.query_to_dict(f"orderBook[`{sym.upper()}]")
    if result is None:
        return offline_response()

    bids = []
    asks = []
    if isinstance(result, list):
        for row in result:
            bids.append({"price": float(row.get("bid", 0)), "size": float(row.get("bsize", 0)), "level": int(row.get("level", 0))})
            asks.append({"price": float(row.get("ask", 0)), "size": float(row.get("asize", 0)), "level": int(row.get("level", 0))})

    # Get spread and mid from top-of-book
    tob = KDBPool.query_to_dict(f"topOfBook[`{sym.upper()}]")
    spread = 0.0
    mid = 0.0
    if tob and isinstance(tob, (list, dict)):
        tob_data = tob[0] if isinstance(tob, list) else tob
        spread = float(tob_data.get("spread", 0))
        mid = float(tob_data.get("mid", 0))

    return {"bids": bids, "asks": asks, "spread": spread, "mid": mid}


@router.get("/api/crypto/imbalance/{sym}")
async def crypto_imbalance(sym: str):
    """Bid/ask volume imbalance signal (-1 to +1)."""
    result = KDBPool.query_to_dict(f"bookImbalance[`{sym.upper()}; 10]")
    if result is None:
        return offline_response()
    data = result[0] if isinstance(result, list) and len(result) > 0 else result
    return {"data": data}


@router.get("/api/crypto/stats/{sym}")
async def crypto_stats(sym: str):
    """Combined microstructure stats."""
    result = KDBPool.query_to_dict(f"allStats[`{sym.upper()}]")
    if result is None:
        return offline_response()
    data = result[0] if isinstance(result, list) and len(result) > 0 else result
    return {"data": data}


@router.get("/api/crypto/trades/{sym}")
async def crypto_trades(sym: str, n: int = Query(default=100, le=500)):
    """Last N trades for a symbol."""
    result = KDBPool.query_to_dict(f"recentTrades[`{sym.upper()}; {n}]")
    if result is None:
        return offline_response()

    trades = []
    if isinstance(result, list):
        for row in result:
            trade = {}
            for k, v in row.items():
                if hasattr(v, 'isoformat'):
                    trade[k] = v.isoformat()
                elif hasattr(v, 'timestamp'):
                    trade[k] = int(v.timestamp() * 1000)
                else:
                    trade[k] = float(v) if isinstance(v, (int, float)) else str(v)
            trades.append(trade)
    return {"data": trades}


# ============================================================
# WebSocket Relay — /ws/crypto
# Streams live ticks from kdb+ to the React frontend
# ============================================================

# Track active WebSocket connections
_ws_connections: list[WebSocket] = []


@router.websocket("/ws/crypto")
async def crypto_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for live crypto tick streaming.
    Client sends: {"subscribe": "BTCUSDT"} or {"unsubscribe": "BTCUSDT"}
    Server sends: {"type": "trade", ...} / {"type": "depth", ...} / {"type": "stats", ...}
    """
    await websocket.accept()
    _ws_connections.append(websocket)
    subscribed_sym = "BTCUSDT"  # default

    try:
        # Polling loop: fetch latest data from kdb+ and push to client
        last_trade_count = 0
        while True:
            try:
                # Check for incoming messages (subscribe/unsubscribe)
                try:
                    raw = await asyncio.wait_for(websocket.receive_text(), timeout=0.2)
                    msg = json.loads(raw)
                    if "subscribe" in msg:
                        subscribed_sym = msg["subscribe"].upper()
                    if "unsubscribe" in msg:
                        pass  # just switch subscription
                except asyncio.TimeoutError:
                    pass  # no message from client, continue polling

                if not KDBPool.is_connected():
                    await websocket.send_json({"type": "status", "status": "offline"})
                    await asyncio.sleep(2)
                    continue

                # Fetch latest trades (last 5)
                trades = KDBPool.query_to_dict(
                    f"select[-5] from trade where sym=`{subscribed_sym}"
                )
                if trades:
                    for t in trades:
                        trade_msg = {"type": "trade"}
                        for k, v in t.items():
                            if hasattr(v, 'isoformat'):
                                trade_msg[k] = v.isoformat()
                            elif hasattr(v, 'timestamp'):
                                trade_msg[k] = int(v.timestamp() * 1000)
                            else:
                                trade_msg[k] = float(v) if isinstance(v, (int, float)) else str(v)
                        await websocket.send_json(trade_msg)

                # Fetch top-of-book quote
                tob = KDBPool.query_to_dict(f"topOfBook[`{subscribed_sym}]")
                if tob:
                    tob_data = tob[0] if isinstance(tob, list) else tob
                    await websocket.send_json({
                        "type": "quote",
                        "bid": float(tob_data.get("bid", 0)),
                        "ask": float(tob_data.get("ask", 0)),
                        "bsize": float(tob_data.get("bsize", 0)),
                        "asize": float(tob_data.get("asize", 0)),
                        "spread": float(tob_data.get("spread", 0)),
                        "mid": float(tob_data.get("mid", 0)),
                    })

                # Fetch stats every cycle
                stats = KDBPool.query_to_dict(f"allStats[`{subscribed_sym}]")
                if stats:
                    stats_data = stats[0] if isinstance(stats, list) else stats
                    stats_msg = {"type": "stats"}
                    for k, v in stats_data.items():
                        stats_msg[k] = float(v) if isinstance(v, (int, float)) else str(v)
                    await websocket.send_json(stats_msg)

                await asyncio.sleep(0.2)  # 5 updates/sec

            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"[WS] Error in crypto websocket: {e}")
                await asyncio.sleep(1)

    finally:
        if websocket in _ws_connections:
            _ws_connections.remove(websocket)
