@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==================================================================
echo   Chrome Remote Control - Quick Start (Windows)
echo ==================================================================

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python 3.11+ is not installed or not in your PATH.
    pause
    exit /b 1
)

if not exist "backend\.venv\Scripts\python.exe" (
    echo [1/3] Creating Python virtual environment...
    python -m venv backend\.venv
    echo [2/3] Installing backend dependencies...
    backend\.venv\Scripts\python.exe -m pip install --upgrade pip >nul
    backend\.venv\Scripts\pip.exe install -r backend\requirements.txt
)

if not exist "frontend\dist\index.html" (
    where npm.cmd >nul 2>nul
    if %errorlevel% equ 0 (
        echo [3/3] Building mobile PWA frontend...
        pushd frontend
        if not exist "node_modules" call npm.cmd install
        call npm.cmd run build
        popd
    ) else (
        echo [NOTICE] Node.js/npm not found. Install Node.js to build the frontend from source.
    )
)

echo.
echo Starting local server and system tray controller...
backend\.venv\Scripts\python.exe backend\main.py %*
pause
