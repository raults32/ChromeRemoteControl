#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================================================="
echo "  Chrome Remote Control - Quick Start (macOS / Linux)"
echo "=================================================================="

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "[ERROR] python3 not found. Please install Python 3.11+."
  exit 1
fi

if [ ! -x "backend/.venv/bin/python" ]; then
  echo "[1/3] Creating virtual environment..."
  "$PYTHON_BIN" -m venv backend/.venv
  echo "[2/3] Installing backend dependencies..."
  backend/.venv/bin/pip install --upgrade pip >/dev/null
  backend/.venv/bin/pip install -r backend/requirements.txt
fi

if [ ! -f "frontend/dist/index.html" ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "[3/3] Building mobile PWA frontend..."
    (cd frontend && [ -d node_modules ] || npm install && npm run build)
  else
    echo "[NOTICE] npm not found. Install Node.js to build the frontend from source."
  fi
fi

echo ""
echo "Starting local server..."
exec backend/.venv/bin/python backend/main.py "$@"
