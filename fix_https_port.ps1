Import-Module WebAdministration

$siteName = "VersAgent"
$port = 3002

Write-Host "1. Reconfiguring IIS for HTTPS on Port $port..." -ForegroundColor Cyan

# Clear existing bindings
Clear-WebBinding -Name $siteName -ErrorAction SilentlyContinue
Remove-WebBinding -Name $siteName -ErrorAction SilentlyContinue

# Add new HTTPS binding on port 3002
New-WebBinding -Name $siteName -Protocol "https" -Port $port -IPAddress "*"

# Find the cert we created earlier
$cert = Get-ChildItem -Path "Cert:\LocalMachine\My" | Where-Object { $_.FriendlyName -eq "VersAgent-SSL" } | Select-Object -First 1

if ($cert) {
    Write-Host "2. Attaching SSL Certificate to Port $port..." -ForegroundColor Cyan
    $certThumbprint = $cert.Thumbprint
    $guid = [guid]::NewGuid().ToString("B")
    
    # Remove any existing SSL mapping on port 3002
    netsh http delete sslcert ipport=0.0.0.0:$port 2>&1 | Out-Null
    
    # Bind the cert to the port
    netsh http add sslcert ipport=0.0.0.0:$port certhash=$certThumbprint appid=$guid
} else {
    Write-Warning "Could not find the VersAgent-SSL certificate!"
}

Write-Host "3. Restarting Site..." -ForegroundColor Cyan
Restart-WebItem "IIS:\Sites\$siteName"

Write-Host "`n===============================================" -ForegroundColor Green
Write-Host "HTTPS Setup Complete!" -ForegroundColor Green
Write-Host "You can now access: https://localhost:3002" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
