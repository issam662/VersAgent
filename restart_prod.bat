@echo off
echo ===================================================
echo   Restarting PC Inventory System (PRODUCTION MODE)
echo ===================================================

echo.
echo [1/4] Stopping existing Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo       - Stopped existing node processes.
) else (
    echo       - No running node processes found.
)

echo.
echo [2/4] Starting Backend Server (Production Port 3002)...
powershell -Command "Start-Process cmd -ArgumentList '/c cd server && set PORT=3002 && node dist/index.js > ../server.log 2>&1' -WindowStyle Hidden"
echo       - Server started. Logs: server.log

echo.
echo [3/4] Starting Frontend Client...
powershell -Command "Start-Process cmd -ArgumentList '/c cd client && npm run dev > ../client.log 2>&1' -WindowStyle Hidden"
echo       - Client started. Logs: client.log

echo.
echo [4/4] Starting Agent Service (Background)...
powershell -Command "Start-Process cmd -ArgumentList '/c cd agent && npm run dev > ../agent.log 2>&1' -WindowStyle Hidden"
echo       - Agent started. Logs: agent.log

echo.
echo ===================================================
echo   Application started in background!
echo   - Server: http://localhost:3002
echo   - Client: http://localhost:5173
echo.
echo   To stop the application, run: taskkill /F /IM node.exe
echo ===================================================
echo.
pause
