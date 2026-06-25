@echo off
echo ========================================================
echo   Fixing Network Profile (Changing Public to Private)
echo ========================================================
echo.
echo This script will force your network connection to "Private"
echo so the Windows Firewall allows incoming connections.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$profiles = Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\Profiles'; foreach ($p in $profiles) { Set-ItemProperty -Path $p.PSPath -Name Category -Value 1 -ErrorAction SilentlyContinue }; Write-Host 'Network profiles updated to Private!'"

echo.
echo Restarting Network Service to apply changes...
net stop nlasvc /y >nul 2>&1
net start nlasvc >nul 2>&1
net start netprofm >nul 2>&1

echo.
echo ========================================================
echo   Done! Please check if the other PC can connect now.
echo ========================================================
pause
