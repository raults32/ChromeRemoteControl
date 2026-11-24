@echo off
setlocal
cd /d "%~dp0"

echo ================================================================
echo   Chrome Remote Control - Silent Windows Agent Installer
echo ================================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python 3.11+ was not found in PATH.
    echo Please install Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

if not exist "backend\.venv\Scripts\pythonw.exe" (
    echo [1/3] Creating virtual environment in backend\.venv...
    python -m venv backend\.venv
)

echo [2/3] Installing / verifying backend dependencies...
backend\.venv\Scripts\python.exe -m pip install --quiet --upgrade pip
backend\.venv\Scripts\python.exe -m pip install --quiet -r backend\requirements.txt

set "PYTHONW=%~dp0backend\.venv\Scripts\pythonw.exe"
set "MAINSCRIPT=%~dp0backend\main.py"

echo [3/3] Registering invisible auto-start with Windows login...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ChromeRemoteControl" /t REG_SZ /d "\"%PYTHONW%\" \"%MAINSCRIPT%\"" /f >nul

:: Stop any existing instance before launching fresh in background
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^pythonw?\.exe$' -and $_.CommandLine -like '*backend*main.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

start "" "%PYTHONW%" "%MAINSCRIPT%"

echo.
echo [DONE] Silent Windows Agent is now running invisibly in the background
echo        (check your Windows System Tray) and will start automatically
echo        every time you turn on your laptop with ZERO console windows!
echo.
echo Tip: Click the Chrome Remote Control extension icon in Chrome and scan
echo      the QR code with your phone to pair immediately.
echo.
pause
