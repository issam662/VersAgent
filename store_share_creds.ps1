# This script stores domain credentials for the VersAgent IIS App Pool user
# Run this as Administrator ONCE. Credentials persist across reboots.

param(
    [string]$AppPoolUser = ".\ahhpks",
    [string]$DomainUser  = "aptiv.com\ahhpks",
    [string]$Password    = "Delphi20232045--"
)

Write-Host "=== VersAgent: Storing Network Credentials for IIS App Pool ===" -ForegroundColor Cyan

# Store credentials in Windows Credential Manager for the ahhpks user profile
# These are stored in the user's profile and survive reboots
$servers = @("10.71.5.25", "10.192.40.249")
foreach ($server in $servers) {
    Write-Host "Storing credentials for $server..." -ForegroundColor Yellow
    # Remove any existing conflicting entry first
    cmdkey /delete:$server 2>&1 | Out-Null
    # Add the credential
    $result = cmdkey /add:$server /user:$DomainUser /pass:$Password
    Write-Host $result
}

Write-Host "`n=== Verifying stored credentials ===" -ForegroundColor Cyan
cmdkey /list | Select-String -Pattern "10\.(71|192)"

Write-Host "`n=== Recycling VersAgent App Pool ===" -ForegroundColor Cyan
& C:\Windows\System32\inetsrv\appcmd.exe recycle apppool /apppool.name:"VersAgent"

Write-Host "`n=== Done! ===" -ForegroundColor Green
Write-Host "Credentials are now stored and will persist after reboots." -ForegroundColor Green
Write-Host "The shares should now work in the dashboard." -ForegroundColor Green
