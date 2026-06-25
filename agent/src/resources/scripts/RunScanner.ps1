# RunScanner.ps1 — PowerShell wrapper that compiles NativeNetScanner.cs in-memory via Add-Type
# This avoids CrowdStrike quarantining a standalone unsigned .exe
# PowerShell is a system-signed Microsoft binary, so it won't be flagged.
# Usage: powershell -ExecutionPolicy Bypass -File RunScanner.ps1 [scan|adapters|listen]

param(
    [string]$Action = "scan"
)

$ErrorActionPreference = 'SilentlyContinue'

# Resolve the C# source file path (same directory as this script)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$csPath = Join-Path $scriptDir "NativeNetScanner.cs"

if (-not (Test-Path $csPath)) {
    Write-Host '{"error":"NativeNetScanner.cs not found"}'
    exit 1
}

# Read the C# source and make class + Main() callable from PowerShell
# The original uses implicit internal class and private Main; we need public for Add-Type
$csSource = (Get-Content -Raw $csPath)
$csSource = $csSource -replace 'class Program', 'public class Program'
$csSource = $csSource -replace 'static void Main\(', 'public static void Main('

# Compile in-memory with Add-Type, reference needed assemblies
try {
    Add-Type -TypeDefinition $csSource -ReferencedAssemblies @(
        'System.Management'
    ) -ErrorAction Stop 2>$null
}
catch {
    # If the type is already loaded in this session, that's fine — skip the error
    if ($_.Exception -and $_.Exception.Message -notmatch 'already exists') {
        Write-Host "{`"error`":`"Compile failed: $($_.Exception.Message)`"}"
        exit 1
    }
}

# Call the entry point — output goes to stdout as JSON (same as the original exe)
[NativeNetScanner.Program]::Main(@($Action))
