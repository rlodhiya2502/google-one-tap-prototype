#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-4200}"

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
if ! command -v php &>/dev/null; then
  echo "ERROR: php not found in PATH" >&2
  exit 1
fi

if ! command -v npm &>/dev/null; then
  echo "ERROR: npm not found in PATH" >&2
  exit 1
fi

if [ ! -f "$BACKEND_DIR/app/config/config.php" ]; then
  echo "ERROR: backend/app/config/config.php not found."
  echo "       Copy backend/app/config/config_sample.php to config.php and fill in your values."
  exit 1
fi

if [ ! -f "$FRONTEND_DIR/src/environments/environment.ts" ]; then
  echo "ERROR: frontend/src/environments/environment.ts not found."
  echo "       Copy frontend/src/environments/environment.example.ts to environment.ts and fill in your values."
  exit 1
fi

# ---------------------------------------------------------------------------
# Cleanup on exit
# ---------------------------------------------------------------------------
cleanup() {
  echo ""
  echo "Stopping servers..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Start backend (PHP built-in server)
# ---------------------------------------------------------------------------
echo "Starting PHP backend on http://$BACKEND_HOST:$BACKEND_PORT ..."
php -S "$BACKEND_HOST:$BACKEND_PORT" -t "$BACKEND_DIR/public" &
BACKEND_PID=$!

# ---------------------------------------------------------------------------
# Start frontend (Angular dev server)
# ---------------------------------------------------------------------------
echo "Starting Angular frontend on http://localhost:$FRONTEND_PORT ..."
cd "$FRONTEND_DIR" && npm start -- --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

echo ""
echo "Both servers running. Press Ctrl+C to stop."
echo "  Backend:  http://$BACKEND_HOST:$BACKEND_PORT"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo ""

wait
