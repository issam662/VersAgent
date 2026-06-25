# Check for Admin (Disabled to allow for custom elevation)
# if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
#     Write-Warning "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
#     Write-Warning "ERROR: THIS SCRIPT MUST BE RUN AS ADMINISTRATOR"
#     Write-Warning "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
#     exit
# }

Import-Module WebAdministration -ErrorAction SilentlyContinue

# 1. Enable IIS
Write-Host "1. Enabling IIS features..." -ForegroundColor Cyan
dism /online /enable-feature /featurename:IIS-WebServerRole /all /norestart
dism /online /enable-feature /featurename:IIS-WebServer /all /norestart
dism /online /enable-feature /featurename:IIS-CommonHttpFeatures /all /norestart
dism /online /enable-feature /featurename:IIS-HttpErrors /all /norestart
dism /online /enable-feature /featurename:IIS-StaticContent /all /norestart
dism /online /enable-feature /featurename:IIS-DefaultDocument /all /norestart
dism /online /enable-feature /featurename:IIS-HttpCompressionStatic /all /norestart
dism /online /enable-feature /featurename:IIS-ManagementConsole /all /norestart

# 2. Install Modules via winget
Write-Host "2. Installing URL Rewrite and HttpPlatformHandler..." -ForegroundColor Cyan
# URL Rewrite
if (-not (Test-Path "C:\Windows\System32\inetsrv\rewrite.dll")) {
    Write-Host "Installing URL Rewrite..."
    winget install --id Microsoft.IIS.URLRewrite --accept-package-agreements --accept-source-agreements
} else {
    Write-Host "URL Rewrite already installed." -ForegroundColor Gray
}

# HttpPlatformHandler
if (-not (Test-Path "C:\Windows\System32\inetsrv\httpPlatformHandler.dll")) {
    Write-Host "Installing HttpPlatformHandler..."
    winget install --id Microsoft.HttpPlatformHandler --accept-package-agreements --accept-source-agreements
} else {
    Write-Host "HttpPlatformHandler already installed." -ForegroundColor Gray
}

# 3. Create IIS Website
$siteName = "PC_Inventory"
$sitePath = "c:\Users\Public\Documents\App\PFE PROJECT\server"
$port = 80

Write-Host "3. Configuring IIS Website..." -ForegroundColor Cyan
if (Get-Website -Name $siteName -ErrorAction SilentlyContinue) {
    Write-Host "Removing existing site $siteName..."
    Remove-Website -Name $siteName
}

# Create the site
New-Website -Name $siteName -Port $port -PhysicalPath $sitePath -Force
# Ensure the AppPool is started
Start-WebAppPool -Name $siteName

# 4. Set Permissions
Write-Host "4. Setting folder permissions for IIS..." -ForegroundColor Cyan
# Grant IIS AppPool user access to the project folder
$acl = Get-Acl $sitePath
$permission = "IIS AppPool\$siteName","FullControl","Allow"
$accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
$acl.SetAccessRule($accessRule)
Set-Acl $sitePath $acl

# Also grant access to the client/dist folder (since server refers to it)
$clientDistPath = "c:\Users\Public\Documents\App\PFE PROJECT\client\dist"
if (Test-Path $clientDistPath) {
    $acl = Get-Acl $clientDistPath
    $permission = "IIS AppPool\$siteName","FullControl","Allow"
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
    $acl.SetAccessRule($accessRule)
    Set-Acl $clientDistPath $acl
}

Write-Host "`n===============================================" -ForegroundColor Green
Write-Host "IIS Setup Complete!" -ForegroundColor Green
Write-Host "Visit: http://localhost" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
