#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================================================="
echo "  Chrome Remote Control - Inicio Rápido (macOS / Linux)"
echo "=================================================================="

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "[ERROR] No se encontró python3. Instala Python 3.11+."
  exit 1
fi

if [ ! -x "backend/.venv/bin/python" ]; then
  echo "[1/3] Creando entorno virtual..."
  "$PYTHON_BIN" -m venv backend/.venv
  echo "[2/3] Instalando dependencias del backend..."
  backend/.venv/bin/pip install --upgrade pip >/dev/null
  backend/.venv/bin/pip install -r backend/requirements.txt
fi

if [ ! -f "frontend/dist/index.html" ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "[3/3] Compilando interfaz móvil PWA..."
    (cd frontend && [ -d node_modules ] || npm install && npm run build)
  else
    echo "[AVISO] npm no encontrado. Instala Node.js para compilar el frontend."
  fi
fi

echo ""
echo "Iniciando servidor local..."
exec backend/.venv/bin/python backend/main.py "$@"
