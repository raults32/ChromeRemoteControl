@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==================================================================
echo   Chrome Remote Control - Inicio Rapido (Windows)
echo ==================================================================

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python 3.11+ no esta instalado o no esta en el PATH.
    pause
    exit /b 1
)

if not exist "backend\.venv\Scripts\python.exe" (
    echo [1/3] Creando entorno virtual de Python...
    python -m venv backend\.venv
    echo [2/3] Instalando dependencias del servidor...
    backend\.venv\Scripts\python.exe -m pip install --upgrade pip >nul
    backend\.venv\Scripts\pip.exe install -r backend\requirements.txt
)

if not exist "frontend\dist\index.html" (
    where npm.cmd >nul 2>nul
    if %errorlevel% equ 0 (
        echo [3/3] Compilando aplicacion movil PWA ^(frontend^)...
        pushd frontend
        if not exist "node_modules" call npm.cmd install
        call npm.cmd run build
        popd
    ) else (
        echo [AVISO] Node.js/npm no encontrado. Instala Node.js para compilar el frontend.
    )
)

echo.
echo Iniciando servidor local y bandeja del sistema...
backend\.venv\Scripts\python.exe backend\main.py %*
pause
