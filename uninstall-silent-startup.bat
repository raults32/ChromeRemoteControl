@echo off
setlocal
cd /d "%~dp0"

echo Removing Chrome Remote Control from Windows automatic startup...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ChromeRemoteControl" /f >nul 2>nul

echo Stopping background agent process...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^pythonw?\.exe$' -and $_.CommandLine -like '*backend*main.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo.
echo [DONE] Silent Windows Agent stopped and removed from Windows startup.
echo        Instant Browser Mode in the Chrome Extension remains available anytime.
echo.
pause
