New-NetFirewallRule -DisplayName "VersAgent-Frontend" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "VersAgent-Backend" -Direction Inbound -LocalPort 3002 -Protocol TCP -Action Allow
Write-Host "Firewall rules created successfully!"
pause
