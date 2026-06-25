
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface InstalledApp {
    name: string;
    version: string;
    publisher: string;
    installDate: string | null;
}

export async function getInstalledApps(): Promise<InstalledApp[]> {
    const apps: InstalledApp[] = [];
    // v1.2.3 FIX: Removed hardcoded developer debug path. It doesn't exist on other machines.
    let outputLog = `Time: ${new Date().toISOString()}\n`;

    try {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const tempPath = path.join(os.tmpdir(), `aptiv_apps_${Date.now()}.ps1`);

        // PowerShell command to get apps from Registry (HKLM and HKCU, 32 and 64 bit)
        // FORCE UTF-8 for reliable parsing
        // v1.1.0: Also capture UninstallString and QuietUninstallString for remote uninstall
        const psCommand = `
            [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
            $paths = @(
                'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 
                'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 
                'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
            );
            $apps = $paths | ForEach-Object { Get-ItemProperty $_ -ErrorAction SilentlyContinue } | 
                Where-Object { $_.DisplayName -and $_.DisplayName -notmatch '^(KB|Update for)' } |
                Select-Object DisplayName, DisplayVersion, Publisher, InstallDate;
            
            $apps | ConvertTo-Json -Compress
        `;

        fs.writeFileSync(tempPath, psCommand);
        outputLog += `Wrote script to ${tempPath}\n`;

        outputLog += "Executing PowerShell...\n";

        const { stdout, stderr } = await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPath}"`, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 60000
        });

        // Cleanup
        try { fs.unlinkSync(tempPath); } catch (e) { }

        outputLog += `STDERR:\n${stderr}\n`;
        outputLog += `STDOUT LENGTH: ${stdout.length}\n`;

        if (stdout.trim()) {
            try {
                const raw = JSON.parse(stdout.trim());
                // Powershell returns single object if only 1 result, array otherwise
                const entries = Array.isArray(raw) ? raw : [raw];

                outputLog += `Parsed ${entries.length} entries.\n`;

                for (const entry of entries) {
                    if (entry.DisplayName) {
                        apps.push({
                            name: entry.DisplayName,
                            version: entry.DisplayVersion || '',
                            publisher: entry.Publisher || '',
                            installDate: entry.InstallDate || null
                        });
                    }
                }
            } catch (parseError: any) {
                outputLog += `JSON PARSE ERROR: ${parseError.message}\n`;
                outputLog += `STDOUT DUMP:\n${stdout}\n`;
            }
        } else {
            outputLog += "STDOUT was empty.\n";
        }
    } catch (e: any) {
        outputLog += `EXEC ERROR: ${e.message}\n`;
        console.error('Failed to get installed apps via PowerShell:', e);
    }

    // Sort and Deduplicate
    const unique = new Map();
    for (const app of apps) {
        unique.set(`${app.name}|${app.version}`, app);
    }

    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
}

