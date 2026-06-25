Import-Module WebAdministration

$siteName = "VersAgent"
$port = 443

# 1. Open Firewall for port 443
Write-Host "1. Opening Port 443 in Firewall..." -ForegroundColor Cyan
New-NetFirewallRule -DisplayName "VersAgent HTTPS" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -ErrorAction SilentlyContinue

# 2. Generate a new Self-Signed Certificate in the Local Machine Store (required for IIS)
Write-Host "2. Generating SSL Certificate..." -ForegroundColor Cyan
$cert = New-SelfSignedCertificate -DnsName $env:COMPUTERNAME, "localhost" -CertStoreLocation "Cert:\LocalMachine\My" -FriendlyName "VersAgent-SSL"

# 3. Clear existing bindings and add HTTPS binding
Write-Host "3. Configuring IIS Bindings..." -ForegroundColor Cyan
Clear-WebBinding -Name $siteName -ErrorAction SilentlyContinue
New-WebBinding -Name $siteName -Protocol "https" -Port $port -IPAddress "*"

# 4. Bind the Certificate to the HTTPS port
Write-Host "4. Attaching Certificate to Port $port..." -ForegroundColor Cyan
$certThumbprint = $cert.Thumbprint
$guid = [guid]::NewGuid().ToString("B")

# Remove any existing cert on this port just in case
netsh http delete sslcert ipport=0.0.0.0:$port 2>&1 | Out-Null
# Add the new cert
netsh http add sslcert ipport=0.0.0.0:$port certhash=$certThumbprint appid=$guid

# 5. Restart Site
Write-Host "5. Restarting Site..." -ForegroundColor Cyan
Restart-WebItem "IIS:\Sites\$siteName"

Write-Host "`n===============================================" -ForegroundColor Green
Write-Host "HTTPS Setup Complete!" -ForegroundColor Green
Write-Host "You can now access: https://localhost" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
