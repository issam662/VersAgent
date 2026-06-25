
Write-Host "--- CDP/LLDP SNIFFER DIAGNOSTIC ---" -ForegroundColor Cyan

# 1. Check for Npcap / WinPcap
Write-Host "`n[1] Checking for Packet Capture Drivers..." -ForegroundColor Yellow
$npcap = Test-Path "C:\Windows\System32\Npcap"
$wpcap = Test-Path "C:\Windows\System32\wpcap.dll"
$packet = Test-Path "C:\Windows\System32\packet.dll"

if ($npcap) { Write-Host "Npcap Found: YES" -ForegroundColor Green } else { Write-Host "Npcap Found: NO" -ForegroundColor Red }
if ($wpcap) { Write-Host "WinPcap (wpcap.dll) Found: YES" -ForegroundColor Green } else { Write-Host "WinPcap (wpcap.dll) Found: NO" -ForegroundColor Red }

# 2. Check for TShark / Wireshark
Write-Host "`n[2] Checking for TShark/Wireshark..." -ForegroundColor Yellow
try {
    $tshark = Get-Command "tshark" -ErrorAction SilentlyContinue
    if ($tshark) { 
        Write-Host "TShark Found: $($tshark.Source)" -ForegroundColor Green 
        
        # Try a quick capture of CDP (multicast 01:00:0c:cc:cc:cc)
        Write-Host "Attempting 5-second capture for CDP..."
        # -a duration:5 -f "ether dst 01:00:0c:cc:cc:cc"
        tshark -D
    } else {
        Write-Host "TShark Found: NO" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error checking TShark: $_"
}

# 3. Check Python & Scapy (since user mentioned it)
Write-Host "`n[3] Checking for Python & Scapy..." -ForegroundColor Yellow
try {
    $py = Get-Command "python" -ErrorAction SilentlyContinue
    if ($py) {
        Write-Host "Python Found: $($py.Source)" -ForegroundColor Green
        $scapy = python -c "import scapy; print('Scapy available')" 2>$null
        if ($scapy -match "available") {
            Write-Host "Scapy Module: YES" -ForegroundColor Green
        } else {
            Write-Host "Scapy Module: NO" -ForegroundColor Red
        }
    } else {
        Write-Host "Python Found: NO" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error checking Python: $_"
}

Write-Host "`n--- DIAGNOSTIC END ---" -ForegroundColor Cyan
Read-Host "Press Enter to exit..."
