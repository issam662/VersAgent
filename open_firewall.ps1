# Run this script as Administrator to open port 3002 for the APTIV Agent Server
netsh advfirewall firewall add rule name="APTIV Agent Server (TCP 3002)" dir=in action=allow protocol=TCP localport=3002
Write-Host "Firewall rule added successfully! Remote agents can now connect on port 3002." -ForegroundColor Green
pause
