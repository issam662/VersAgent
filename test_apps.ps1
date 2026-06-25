
try {
    Write-Host "Fetching Installed Apps..." -ForegroundColor Cyan

    $paths = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
    );

    # Test accessing paths first
    foreach ($p in $paths) {
        $parent = $p.Replace("\*", "")
        if (Test-Path $parent) {
            Write-Host "Path accessible: $parent" -ForegroundColor Green
        } else {
            Write-Host "Path NOT accessible: $parent" -ForegroundColor Red
        }
    }

    $apps = $paths | ForEach-Object { Get-ItemProperty $_ -ErrorAction SilentlyContinue } | 
        Where-Object { $_.DisplayName -and $_.DisplayName -notmatch '^(KB|Update for)' } |
        Select-Object DisplayName, DisplayVersion, Publisher;
    
    $count = ($apps | Measure-Object).Count
    Write-Host "Found $count apps." -ForegroundColor Yellow

    if ($count -gt 0) {
        Write-Host "First 5 apps:"
        $apps | Select-Object -First 5 | Format-Table -AutoSize
        
        Write-Host "Generating JSON..."
        $json = $apps | ConvertTo-Json -Compress
        Write-Host "JSON Length: $($json.Length)"
        # Write-Host "JSON Output: $json"
    } else {
        Write-Host "No apps found!" -ForegroundColor Red
    }

} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
