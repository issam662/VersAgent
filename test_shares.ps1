Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class NetUtil {
    [StructLayout(LayoutKind.Sequential)]
    public struct NETRESOURCE {
        public int dwScope;
        public int dwType;
        public int dwDisplayType;
        public int dwUsage;
        public string lpLocalName;
        public string lpRemoteName;
        public string lpComment;
        public string lpProvider;
    }

    [DllImport("mpr.dll", CharSet=CharSet.Unicode)]
    public static extern int WNetAddConnection2(
        ref NETRESOURCE lpNetResource,
        string lpPassword,
        string lpUserName,
        uint dwFlags
    );

    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool GetDiskFreeSpaceEx(
        string lpDirectoryName,
        out long lpFreeBytesAvailable,
        out long lpTotalNumberOfBytes,
        out long lpTotalNumberOfFreeBytes
    );
}
"@

function Connect-Share {
    param([string]$Server, [string]$User, [string]$Pass)
    $nr = New-Object NetUtil+NETRESOURCE
    $nr.dwType = 0
    $nr.lpRemoteName = $Server
    $nr.lpLocalName = $null
    $nr.lpProvider = $null
    $result = [NetUtil]::WNetAddConnection2([ref]$nr, $Pass, $User, 0)
    return $result
}

$shareUser = "aptiv.com\ahhpks"
$sharePass = "Delphi20232045--"

Write-Host "=== Testing WNetAddConnection2 Authentication ===" -ForegroundColor Cyan

$r1 = Connect-Share -Server "\\10.71.5.25" -User $shareUser -Pass $sharePass
Write-Host "Auth to \\10.71.5.25 result code: $r1" -ForegroundColor $(if ($r1 -eq 0) { "Green" } else { "Red" })
# WinError codes: 0=success, 1219=conflicting creds, 86=wrong password, 53=path not found

$r2 = Connect-Share -Server "\\10.192.40.249" -User $shareUser -Pass $sharePass
Write-Host "Auth to \\10.192.40.249 result code: $r2" -ForegroundColor $(if ($r2 -eq 0) { "Green" } else { "Red" })

Write-Host "`n=== Testing GetDiskFreeSpaceEx ===" -ForegroundColor Cyan

$shares = @(
    @{ name = "PFT FOLDER"; path = "\\10.71.5.25\groupe01\pft" },
    @{ name = "EUMOOUJ-FP01"; path = "\\10.71.5.25\groupe01\" },
    @{ name = "KSK M5"; path = "\\10.192.40.249\M5\" },
    @{ name = "IT"; path = "\\10.71.5.25\groupe01\IT\" }
)

foreach ($s in $shares) {
    $free = [long]0
    $total = [long]0
    $tf = [long]0
    $ok = [NetUtil]::GetDiskFreeSpaceEx($s.path, [ref]$free, [ref]$total, [ref]$tf)
    if ($ok) {
        $usedGB = [math]::Round(($total - $free) / 1GB, 2)
        $totalGB = [math]::Round($total / 1GB, 2)
        Write-Host "$($s.name): OK — $usedGB GB / $totalGB GB used" -ForegroundColor Green
    } else {
        $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        Write-Host "$($s.name): FAILED — Win32 error code: $err" -ForegroundColor Red
    }
}
