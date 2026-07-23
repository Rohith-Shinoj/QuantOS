#!/bin/bash
# ============================================================
# Finugreek — Unified Backend Launcher
# Starts: kdb+ (Tickerplant + RDB) → Binance Feed Handler → FastAPI
# Usage: ./start.sh [--no-kdb] [--no-feed]
# Logs: ./logs/backend.log (unified)
# ============================================================

set -e

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$BASE_DIR/logs"
PID_DIR="$BASE_DIR/.pids"
mkdir -p "$LOG_DIR" "$PID_DIR" "$BASE_DIR/tickdb/logs" "$BASE_DIR/tickdb/hdb"

# Ensure KDB-X is in PATH (from the new installer location)
export PATH="$HOME/.kx/bin:$PATH"

# Logging macro: change to 1 to enable by default, or pass --log
LOGGING_MACRO=0

# Parse flags
NO_KDB=false
NO_FEED=false
for arg in "$@"; do
  case $arg in
    --no-kdb)  NO_KDB=true ;;
    --no-feed) NO_FEED=true ;;
    --log)     LOGGING_MACRO=1 ;;
    --help)
      echo "Usage: ./start.sh [--no-kdb] [--no-feed] [--log]"
      echo "  --no-kdb   Skip kdb+ processes (run FastAPI only)"
      echo "  --no-feed  Skip Binance feed handler"
      echo "  --log      Enable console logging output"
      exit 0
      ;;
  esac
done

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { 
  if [ "$LOGGING_MACRO" = "1" ]; then 
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"
  fi 
}
warn() { 
  if [ "$LOGGING_MACRO" = "1" ]; then 
    echo -e "${YELLOW}[$(date '+%H:%M:%S')]${NC} $1"
  fi 
}

# ── Stop any existing processes ─────────────────────────────
stop_existing() {
  for pidfile in "$PID_DIR"/*.pid; do
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        log "Stopped process $pid ($(basename "$pidfile" .pid))"
      fi
      rm -f "$pidfile"
    fi
  done
}

stop_existing

# ── Start kdb+ Processes ───────────────────────────────────
if [ "$NO_KDB" = false ]; then
  # Check if q is available
  if ! command -v q &> /dev/null; then
    warn "⚠ kdb+ (q) not found in PATH. Skipping kdb+ processes."
    warn "  Install: https://code.kx.com/q/learn/install/"
    warn "  FastAPI will start without kdb+ — crypto endpoints will return 'offline'."
    NO_KDB=true
    NO_FEED=true
  fi
fi

if [ "$NO_KDB" = false ]; then
  log "Starting kdb+ Tickerplant on port 5010..."
  cd "$BASE_DIR/tickdb"
  q tick.q -p 5010 >> "$LOG_DIR/backend.log" 2>&1 &
  echo $! > "$PID_DIR/tickerplant.pid"
  sleep 2

  log "Starting kdb+ RDB on port 5011..."
  q r.q -p 5011 >> "$LOG_DIR/backend.log" 2>&1 &
  echo $! > "$PID_DIR/rdb.pid"
  sleep 1

  log "kdb+ processes started ✓"
fi

# ── Start Binance Feed Handler ──────────────────────────────
if [ "$NO_FEED" = false ] && [ "$NO_KDB" = false ]; then
  log "Starting Binance Feed Handler..."
  cd "$BASE_DIR"
  python3 tickdb/feed.py >> "$LOG_DIR/backend.log" 2>&1 &
  echo $! > "$PID_DIR/feed.pid"
  log "Feed handler started ✓"
fi

# ── Start FastAPI ───────────────────────────────────────────
log "Starting FastAPI on port 8000..."
cd "$BASE_DIR/backend"
uvicorn main:app --host 0.0.0.0 --port 8000 >> "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$PID_DIR/uvicorn.pid"

log "═══════════════════════════════════════"
log "  Finugreek Backend Started"
log "  API:       http://localhost:8000"
log "  Dashboard: http://localhost:5173"
log "  Crypto:    http://localhost:5173/crypto"
log "  Logs:      $LOG_DIR/backend.log"
log "═══════════════════════════════════════"

# ── Trap SIGINT to stop all processes ───────────────────────
cleanup() {
  echo ""
  log "Shutting down all processes..."
  stop_existing
  log "All processes stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for any child to exit
wait
