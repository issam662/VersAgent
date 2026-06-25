@echo off
echo Killing APTIV System Service components...
taskkill /IM "APTIV System Service.exe" /F /T 2>nul
taskkill /IM "electron.exe" /F /T 2>nul
echo Done. You can now run the installer.
pause
