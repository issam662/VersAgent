import { dbRun, dbGet, dbAll, runTransaction } from '../database/index.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Normalizes software product names for better matching.
 * E.g., "Google Chrome" -> "chrome", "Microsoft Edge" -> "edge"
 */
export function normalizeAppName(appName: string): string {
    const lower = appName.toLowerCase();
    if (lower.includes('chrome')) return 'chrome';
    if (lower.includes('edge')) return 'edge';
    if (lower.includes('firefox')) return 'firefox';
    if (lower.includes('acrobat')) return 'acrobat';
    if (lower.includes('office')) return 'office';
    if (lower.includes('teams')) return 'teams';
    if (lower.includes('zoom')) return 'zoom';
    if (lower.includes('webex')) return 'webex';
    if (lower.includes('java')) return 'jre';
    if (lower.includes('node')) return 'nodejs';
    if (lower.includes('python')) return 'python';
    if (lower.includes('7-zip')) return '7-zip';
    if (lower.includes('winrar')) return 'winrar';
    if (lower.includes('vlc')) return 'vlc';

    // Additional Enterprise / Common Normalizations
    if (lower.includes('crowdstrike') || lower.includes('falcon')) return 'falcon';
    if (lower.includes('globalprotect')) return 'globalprotect';
    if (lower.includes('npcap')) return 'npcap';
    if (lower.includes('wireshark')) return 'wireshark';
    if (lower.includes('tanium')) return 'tanium';
    if (lower.includes('rapid7') || lower.includes('insight agent')) return 'insight';
    if (lower.includes('packet tracer')) return 'packet_tracer';
    if (lower.includes('beyondtrust')) return 'beyondtrust';

    // OS Normalization
    if (lower.includes('windows 10')) return 'windows_10';
    if (lower.includes('windows 11')) return 'windows_11';
    if (lower.includes('windows 7')) return 'windows_7';
    if (lower.includes('windows 8.1')) return 'windows_8.1';
    if (lower.includes('windows server 2016')) return 'windows_server_2016';
    if (lower.includes('windows server 2019')) return 'windows_server_2019';
    if (lower.includes('windows server 2022')) return 'windows_server_2022';
    if (lower.includes('ubuntu')) return 'ubuntu_linux';
    if (lower.includes('debian')) return 'debian_linux';

    // Fallback: just return the lowercase first word as a basic heuristic
    return lower.split(' ')[0].replace(/[^a-z0-9]/g, '');
}

/**
 * A basic Semantic Versioning comparator.
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if v1 == v2
 */
function compareVersions(v1: string | null | undefined, v2: string | null | undefined): number {
    if (!v1 || !v2) return 0; // Can't reliably compare if missing

    const v1Parts = v1.split(/[-._]/).map(p => parseInt(p, 10)).filter(p => !isNaN(p));
    const v2Parts = v2.split(/[-._]/).map(p => parseInt(p, 10)).filter(p => !isNaN(p));

    const maxLen = Math.max(v1Parts.length, v2Parts.length);
    for (let i = 0; i < maxLen; i++) {
        const p1 = v1Parts[i] || 0;
        const p2 = v2Parts[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
}

/**
 * Checks if an application version falls within the vulnerable range specified by the CVE rule.
 */
export function isVersionVulnerable(appVersion: string, rule: any): boolean {
    if (!appVersion) return false;

    // Check versionEndIncluding
    if (rule.version_end && compareVersions(appVersion, rule.version_end) <= 0) {
        // Now ensure it doesn't violate a start bound
        if (rule.version_start && compareVersions(appVersion, rule.version_start) < 0) return false;
        return true;
    }

    // Check versionEndExcluding
    if (rule.version_end_excluding && compareVersions(appVersion, rule.version_end_excluding) < 0) {
        if (rule.version_start && compareVersions(appVersion, rule.version_start) < 0) return false;
        return true;
    }

    return false;
}

let isSyncing = false;
let lastSyncStatus = { status: 'idle', message: '', timestamp: null as Date | null };

export function getSyncStatus() {
    return { isSyncing, ...lastSyncStatus };
}

/**
 * Fetches recent CVEs from the NVD API and stores them in our database.
 */
export async function syncCVEData(force: boolean = false) {
    if (isSyncing) return;

    if (!force) {
        // Check if we really need to sync (throttle to 24 hours for auto-boots to prevent NVD bans)
        try {
            const lastSyncRow = await dbGet('SELECT MAX(updated_at) as last_sync FROM cve_cache');
            if (lastSyncRow && lastSyncRow.last_sync) {
                const hoursSinceSync = (new Date().getTime() - new Date(lastSyncRow.last_sync).getTime()) / (1000 * 60 * 60);
                if (hoursSinceSync < 24) {
                    console.log(`[CVE SYNC] Auto-sync skipped. Last sync was only ${hoursSinceSync.toFixed(1)} hours ago.`);
                    return;
                }
            }
        } catch (err) {
            console.error('[CVE SYNC] Error checking last sync time:', err);
        }
    }

    isSyncing = true;
    lastSyncStatus = { status: 'syncing', message: 'Fetching data from NVD API...', timestamp: new Date() };
    console.log('[CVE SYNC] Starting background CVE sync...');

    // Fetch last 90 days of CVEs (NVD API limits ranges <= 120 days, using 90 for safety)
    const now = new Date();
    const historyWindow = new Date();
    historyWindow.setDate(now.getDate() - 90);

    // ISO string format required by NVD: YYYY-MM-DDTHH:MM:SS.000
    const pubStartDate = historyWindow.toISOString().replace(/\.\d+Z$/, '.000');
    const pubEndDate = now.toISOString().replace(/\.\d+Z$/, '.000');

    try {
        let startIndex = 0;
        let totalResults = 1;
        let totalFetched = 0;

        while (startIndex < totalResults) {
            const nvdUrl = `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${pubStartDate}&pubEndDate=${pubEndDate}&startIndex=${startIndex}`;

            if (startIndex > 0) {
                // NVD rate limit without API key is 5 reqs / 30 secs => strictly 6 seconds per request delay
                lastSyncStatus = { status: 'syncing', message: `Fetching page ${Math.floor(startIndex / 2000) + 1}... (waiting for NVD API rate limit)`, timestamp: new Date() };
                await new Promise(r => setTimeout(r, 6500));
            }

            lastSyncStatus = { status: 'syncing', message: `Fetching CVEs ${startIndex} of ${totalResults > 1 ? totalResults : '...'}`, timestamp: new Date() };
            console.log(`[CVE SYNC] Fetching from NVD: ${nvdUrl}`);
            const response = await fetch(nvdUrl);

            if (!response.ok) {
                throw new Error(`NVD API returned ${response.status}: ${await response.text()}`);
            }

            const data: any = await response.json();
            const vulnerabilities = data.vulnerabilities || [];

            totalResults = data.totalResults || 0;
            totalFetched += vulnerabilities.length;
            startIndex += Math.max(vulnerabilities.length, 2000);

            console.log(`[CVE SYNC] Processing ${vulnerabilities.length} CVEs (Total: ${totalFetched}/${totalResults})`);

            // Process in chunks to avoid overwhelming the DB transaction
            await runTransaction(async () => {
                for (const item of vulnerabilities) {
                    const cve = item.cve;
                    if (!cve) continue;

                    const cveId = cve.id;
                    const description = cve.descriptions?.find((d: any) => d.lang === 'en')?.value || 'No description';

                    let cvssScore = 0.0;
                    let severity = 'UNKNOWN';
                    let exploitabilityScore = 0.0;
                    let impactScore = 0.0;
                    let attackVector = 'UNKNOWN';

                    if (cve.metrics?.cvssMetricV31?.length > 0) {
                        const metric = cve.metrics.cvssMetricV31[0];
                        cvssScore = metric.cvssData.baseScore || 0;
                        severity = metric.cvssData.baseSeverity || 'UNKNOWN';
                        exploitabilityScore = metric.exploitabilityScore || 0;
                        impactScore = metric.impactScore || 0;
                        attackVector = metric.cvssData.attackVector || 'UNKNOWN';
                    } else if (cve.metrics?.cvssMetricV3?.length > 0) {
                        const metric = cve.metrics.cvssMetricV3[0];
                        cvssScore = metric.cvssData.baseScore || 0;
                        severity = metric.cvssData.baseSeverity || 'UNKNOWN';
                        exploitabilityScore = metric.exploitabilityScore || 0;
                        impactScore = metric.impactScore || 0;
                        attackVector = metric.cvssData.attackVector || 'UNKNOWN';
                    } else if (cve.metrics?.cvssMetricV2?.length > 0) {
                        const metric = cve.metrics.cvssMetricV2[0];
                        cvssScore = metric.cvssData.baseScore || 0;
                        severity = metric.baseSeverity || 'UNKNOWN';
                        exploitabilityScore = metric.exploitabilityScore || 0;
                        impactScore = metric.impactScore || 0;
                        attackVector = metric.cvssData.accessVector || 'UNKNOWN';
                    }

                    const publishedStr = cve.published || new Date().toISOString();
                    const cisaKev = cve.cisaExploitAdd ? 1 : 0;
                    
                    // Extract references
                    let remediationLinks = '[]';
                    if (cve.references && cve.references.length > 0) {
                        // NVD returns an array of objects like { url: "...", source: "..." }
                        const urls = cve.references.map((r: any) => r.url).filter(Boolean);
                        remediationLinks = JSON.stringify(urls);
                    }

                    // Upsert to cve_cache
                    const existingCve = await dbGet('SELECT cve_id FROM cve_cache WHERE cve_id = ?', [cveId]);
                    if (existingCve) {
                        await dbRun(
                            'UPDATE cve_cache SET description = ?, cvss_score = ?, severity = ?, remediation_links = ?, cisa_kev = ?, exploitability_score = ?, impact_score = ?, attack_vector = ?, updated_at = GETUTCDATE() WHERE cve_id = ?',
                            [description, cvssScore, severity, remediationLinks, cisaKev, exploitabilityScore, impactScore, attackVector, cveId]
                        );
                    } else {
                        await dbRun(
                            'INSERT INTO cve_cache (cve_id, description, cvss_score, severity, published_date, remediation_links, cisa_kev, exploitability_score, impact_score, attack_vector) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                            [cveId, description, cvssScore, severity, publishedStr, remediationLinks, cisaKev, exploitabilityScore, impactScore, attackVector]
                        );
                    }

                    // Process affected software (CPEs)
                    if (cve.configurations) {
                        // Clear old software mappings for this CVE to avoid duplicates on update
                        await dbRun('DELETE FROM cve_affected_software WHERE cve_id = ?', [cveId]);

                        for (const config of cve.configurations) {
                            let osConstraints: string[] = [];

                            // If this is an AND configuration, find the 'vulnerable: false' OS nodes to bind as target constraints
                            if (config.operator === 'AND' && config.nodes) {
                                for (const node of config.nodes) {
                                    if (node.cpeMatch) {
                                        for (const match of node.cpeMatch) {
                                            if (match.vulnerable === false && match.criteria?.includes('cpe:2.3:o:')) {
                                                const parts = match.criteria.split(':');
                                                if (parts.length >= 5) osConstraints.push(parts[4]); // Push the product name (e.g. 'windows', 'macos')
                                            }
                                        }
                                    }
                                }
                            }

                            const nodesToProcess = config.operator === 'AND' ? config.nodes : (config.nodes ? config.nodes : [config]);

                            for (const node of nodesToProcess) {
                                if (!node.cpeMatch) continue;

                                for (const match of node.cpeMatch) {
                                    if (match.vulnerable === false && config.operator === 'AND') continue; // We already processed these as constraints

                                    const cpeParts = match.criteria?.split(':') || [];
                                    if (cpeParts.length >= 5 && (cpeParts[2] === 'a' || cpeParts[2] === 'o')) {
                                        const vendor = cpeParts[3];
                                        const product = cpeParts[4];

                                        // Target OS is either directly in the CPE (index 10) OR from the AND block constraints
                                        let targetSw = cpeParts.length > 10 && cpeParts[10] !== '*' && cpeParts[10] !== '-' ? cpeParts[10] : null;

                                        // If we didn't find one directly, but we have OS constraints from an AND relation, apply them
                                        // For simplicity, we join multiple constraints by pipe, or just take the first one
                                        if (!targetSw && osConstraints.length > 0) {
                                            targetSw = osConstraints.join('|');
                                        }

                                        if (match.versionEndIncluding || match.versionEndExcluding || match.versionStartIncluding || product.includes('windows_')) {
                                            await dbRun(
                                                `INSERT INTO cve_affected_software 
                                                (id, cve_id, vendor, product, version_start, version_end, version_end_excluding, target_sw) 
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                                [uuidv4(), cveId, vendor, product, match.versionStartIncluding || null, match.versionEndIncluding || null, match.versionEndExcluding || null, targetSw]
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
        }

        console.log(`[CVE SYNC] Successfully synced and processed total ${totalFetched} CVEs.`);

        // After syncing definitions, automatically evaluate all machines
        lastSyncStatus = { status: 'evaluating', message: 'Evaluating machines against new CVEs...', timestamp: new Date() };
        await evaluateAllMachinesVulnerabilities();

        lastSyncStatus = { status: 'success', message: `Successfully synced and discovered ${totalFetched} CVEs`, timestamp: new Date() };
    } catch (err: any) {
        console.error('[CVE SYNC ERROR] Failed to fetch or process CVEs from NVD:', err);
        lastSyncStatus = { status: 'error', message: err.message || 'Unknown error occurred during sync', timestamp: new Date() };
    } finally {
        isSyncing = false;
    }
}

/**
 * Checks a specific machine against known CVEs.
 */
export async function evaluateMachineVulnerabilities(machineId: string) {
    try {
        const apps = await dbAll('SELECT app_name, version FROM installed_apps WHERE machine_id = ?', [machineId]);
        if (!apps || apps.length === 0) return;

        const vulnerabilitiesFound: any[] = [];

        // Get the machine's operating system to filter specific CVEs (e.g. Chrome on Windows vs Chrome on ChromeOS)
        const machineInfo = await dbGet('SELECT os_name, os_version FROM machines WHERE id = ?', [machineId]);
        const machineOsString = machineInfo && machineInfo.os_name ? normalizeAppName(machineInfo.os_name) : '';
        const isWindows = machineOsString?.includes('windows');
        const isMac = machineOsString?.includes('mac') || machineOsString?.includes('osx');
        const isLinux = machineOsString?.includes('linux') || machineOsString?.includes('ubuntu') || machineOsString?.includes('debian');

        // --- 1. Evaluate Installed Applications ---
        for (const app of apps) {
            const normalizedProduct = normalizeAppName(app.app_name);
            if (!normalizedProduct) continue;

            // Look up all CVE rules for this product using wildcard to catch sub-versions
            const rules = await dbAll(
                `SELECT s.*, c.cvss_score, c.severity 
                 FROM cve_affected_software s
                 JOIN cve_cache c ON s.cve_id = c.cve_id
                 WHERE s.product LIKE ?`,
                [`${normalizedProduct}%`]
            );

            for (const rule of rules) {
                // If a CVE explicitly targets an OS that is not the machine's OS, skip it
                if (rule.target_sw) {
                    const ruleOs = rule.target_sw.toLowerCase();
                    if (isWindows && !ruleOs.includes('windows')) continue;
                    if (isMac && !ruleOs.includes('mac') && !ruleOs.includes('macos') && !ruleOs.includes('osx')) continue;
                    if (isLinux && !ruleOs.includes('linux')) continue;
                }

                if (isVersionVulnerable(app.version, rule)) {
                    vulnerabilitiesFound.push({
                        cve_id: rule.cve_id,
                        app_name: app.app_name,
                        app_version: app.version
                    });
                }
            }
        }

        // --- 2. Evaluate Base Operating System ---
        if (machineInfo && machineInfo.os_name) {
            const normalizedOs = normalizeAppName(machineInfo.os_name);
            if (normalizedOs) {
                const osRules = await dbAll(
                    `SELECT s.*, c.cvss_score, c.severity 
                     FROM cve_affected_software s
                     JOIN cve_cache c ON s.cve_id = c.cve_id
                     WHERE s.product LIKE ?`,
                    [`${normalizedOs}%`]
                );

                for (const rule of osRules) {
                    // OS versions are sometimes vague in NVD (e.g. just "windows_10")
                    // If no specific version bounds exist on the rule, or our version check passes
                    if (isVersionVulnerable(machineInfo.os_version || '0.0.0', rule) || (!rule.version_start && !rule.version_end && !rule.version_end_excluding)) {
                        vulnerabilitiesFound.push({
                            cve_id: rule.cve_id,
                            app_name: machineInfo.os_name,
                            app_version: machineInfo.os_version || 'Unknown'
                        });
                    }
                }
            }
        }

        // Update DB
        await runTransaction(async () => {
            await dbRun('DELETE FROM machine_vulnerabilities WHERE machine_id = ?', [machineId]);

            const uniqueVulns = new Set();
            for (const v of vulnerabilitiesFound) {
                // Prevent duplicate CVE logs for the same machine if multiple apps trigger it somehow
                const key = v.cve_id + v.app_name;
                if (!uniqueVulns.has(key)) {
                    uniqueVulns.add(key);
                    await dbRun(
                        'INSERT INTO machine_vulnerabilities (id, machine_id, cve_id, app_name, app_version, detected_at) VALUES (?, ?, ?, ?, ?, GETUTCDATE())',
                        [uuidv4(), machineId, v.cve_id, v.app_name, v.app_version]
                    );
                }
            }
        });

        if (vulnerabilitiesFound.length > 0) {
            console.log(`[CVE EVAL] Flagged ${vulnerabilitiesFound.length} vulnerabilities for machine ${machineId}`);
        }

    } catch (err) {
        console.error(`[CVE EVAL ERROR] Machine ${machineId} evaluation failed:`, err);
    }
}

/**
 * Evaluates all managed machines across all known CVEs.
 */
export async function evaluateAllMachinesVulnerabilities() {
    console.log('[CVE EVAL] Starting global vulnerability evaluation...');
    try {
        const machines = await dbAll('SELECT id FROM machines WHERE (is_archived = 0 OR is_archived IS NULL)');
        let count = 0;

        for (const m of machines) {
            await evaluateMachineVulnerabilities((m as any).id);
            count++;
            // Small pause to prevent blocking event loop for too long if many machines
            await new Promise(resolve => setImmediate(resolve));
        }
        console.log(`[CVE EVAL] Finished testing ${count} machines for vulnerabilities.`);
    } catch (err) {
        console.error('[CVE EVAL ERROR] Global evaluation failed:', err);
    }
}

// Background scheduler
let cveSyncInterval: NodeJS.Timeout | null = null;

export function startBackgroundCveService(intervalHours: number = 24) {
    if (cveSyncInterval) return;

    // Initial sync might take 30+ seconds due to NVD response size. Don't block startup too hard.
    setTimeout(() => {
        syncCVEData();
    }, 1000 * 10); // Run 10 seconds after boot

    cveSyncInterval = setInterval(syncCVEData, intervalHours * 60 * 60 * 1000);
    console.log(`✓ Background CVE Auto-Sync service started (every ${intervalHours} hours)`);
}

export function stopBackgroundCveService() {
    if (cveSyncInterval) {
        clearInterval(cveSyncInterval);
        cveSyncInterval = null;
    }
}
