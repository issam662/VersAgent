@echo off
echo ===================================================
echo   Restarting PC Inventory System
echo ===================================================

echo.
echo [1/2] Stopping existing Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo       - Stopped existing node processes.
) else (
    echo       - No running node processes found - or access denied.
)

echo.
echo [2/2] Starting Backend Server (Port 3002)...
powershell -Command "Start-Process cmd -ArgumentList '/c cd /d \"%~dp0server\" && set PORT=3002 && set HOST=0.0.0.0 && npm run dev > \"%~dp0server.log\" 2>&1' -WindowStyle Hidden"
echo       - Server started. Logs: server.log

echo.
echo ===================================================
echo   Application started!
echo.
echo   Access from THIS PC:    https://localhost:3002
echo   Access from other PCs:  https://10.71.12.140:3002
echo.
echo   (Accept the certificate warning on first visit)
echo.
echo   To stop: taskkill /F /IM node.exe
echo ===================================================
echo.
pause
