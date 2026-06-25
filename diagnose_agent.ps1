
Write-Host "--- DIAGNOSTIC START ---" -ForegroundColor Cyan

# 1. Test OS Detection Logic
Write-Host "`n[1] Testing OS Detection..." -ForegroundColor Yellow
try {
    $osInfo = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion" | Select-Object ProductName, DisplayVersion, CurrentBuild, UBR
    if ($osInfo) {
        Write-Host "Raw Registry Data:"
        $osInfo | Format-List
        
        $prodName = $osInfo.ProductName
        $build = [int]$osInfo.CurrentBuild
        
        if ($build -ge 22000 -and $prodName -match "Windows 10") {
            Write-Host "Fixing Windows 11 Name: YES ($prodName -> Windows 11)" -ForegroundColor Green
        } else {
            Write-Host "Fixing Windows 11 Name: NO (Build $build, Name $prodName)" -ForegroundColor Gray
        }
    } else {
        Write-Host "ERROR: Registry key not found or empty." -ForegroundColor Red
    }
} catch {
    Write-Host "ERROR checking OS: $_" -ForegroundColor Red
}

# 2. Test VLAN/Network Adapter Logic
Write-Host "`n[2] Testing Network Adapters..." -ForegroundColor Yellow
try {
    $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.Virtual -eq $false }
    $count = @($adapters).Count
    Write-Host "Active Physical Adapters Found: $count"
    
    if ($count -gt 0) {
        foreach ($nic in $adapters) {
            Write-Host "  Interface: $($nic.Name)"
            Write-Host "  Desc:      $($nic.InterfaceDescription)"
            Write-Host "  Mac:       $($nic.MacAddress)"
            
            # Check VLAN
            $vlan = $nic | Select-Object -ExpandProperty VlanID -ErrorAction SilentlyContinue
            if ($null -eq $vlan) {
                Write-Host "  VLAN ID:   NULL (Untagged)" -ForegroundColor Green
            } else {
                Write-Host "  VLAN ID:   $vlan" -ForegroundColor Green
            }
        }
    } else {
        Write-Host "WARNING: No active physical adapters found." -ForegroundColor Yellow
    }
} catch {
    Write-Host "ERROR checking Adapters: $_" -ForegroundColor Red
}

# 3. Test execution policy / Permissions
Write-Host "`n[3] Testing Permissions..." -ForegroundColor Yellow
Write-Host "User: $env:USERNAME"
Write-Host "IsAdmin: $([bool](([System.Security.Principal.WindowsIdentity]::GetCurrent()).Owner -eq [System.Security.Principal.WindowsIdentity]::GetCurrent().User))" # Rough check

Write-Host "`n--- DIAGNOSTIC END ---" -ForegroundColor Cyan
Read-Host "Press Enter to exit..."
