import { dbGet, dbAll, dbRun, runTransaction } from '../database/index.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Compare two version strings numerically segment by segment.
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
function compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(s => parseInt(s, 10) || 0);
    const partsB = b.split('.').map(s => parseInt(s, 10) || 0);
    const len = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < len; i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        if (numA < numB) return -1;
        if (numA > numB) return 1;
    }
    return 0;
}

/**
 * Check if installedVersion satisfies the operator against requiredVersion.
 */
function versionSatisfies(installedVersion: string, operator: string, requiredVersion: string): boolean {
    const cmp = compareVersions(installedVersion, requiredVersion);
    switch (operator) {
        case '=': return cmp === 0;
        case '>=': return cmp >= 0;
        case '<=': return cmp <= 0;
        case '>': return cmp > 0;
        case '<': return cmp < 0;
        default: return cmp === 0;
    }
}

export async function evaluateMachineCompliance(machineId: string) {
    try {
        const machine = await dbGet('SELECT * FROM machines WHERE id = ?', [machineId]) as any;
        if (!machine) return;

        const rules = await dbAll('SELECT * FROM compliance_rules WHERE is_active = 1') as any[];
        if (!rules || rules.length === 0) {
            // No active rules, clear compliance results just in case
            await dbRun('DELETE FROM compliance_results WHERE machine_id = ?', [machineId]);
            return;
        }

        const apps = await dbAll('SELECT * FROM installed_apps WHERE machine_id = ?', [machineId]) as any[];

        // Fetch active exceptions for this machine
        const exceptions = await dbAll('SELECT * FROM rule_exceptions WHERE machine_id = ? AND (expires_at IS NULL OR expires_at > GETUTCDATE())', [machineId]) as any[];
        const exceptionRuleIds = new Set(exceptions.map(e => e.rule_id));

        const violations: any[] = [];

        for (const rule of rules) {
            if (exceptionRuleIds.has(rule.id)) continue; // Skip if machine has an active exception for this rule

            let isViolating = false;
            let details = '';

            const conditionName = rule.app_name ? rule.app_name.toLowerCase() : '';
            // Substring search for apps to handle "Brave" matching "Brave browser"
            const installedApp = conditionName ? apps.find(a => a.app_name.toLowerCase().includes(conditionName)) : null;

            if (rule.rule_type === 'software_required' || rule.rule_type === 'mandatory') {
                if (apps.length === 0) {
                    // Skip check: Machine hasn't reported any apps yet, so we can't definitively say it's missing
                    continue;
                }
                if (!installedApp) {
                    isViolating = true;
                    details = `Required application containing '${rule.app_name}' is not installed.`;
                }
            } else if (rule.rule_type === 'blacklist') {
                if (installedApp) {
                    isViolating = true;
                    details = `Forbidden application '${installedApp.app_name}' is installed (version: ${installedApp.version || 'Unknown'}).`;
                }
            } else if (rule.rule_type === 'outdated') {
                if (apps.length === 0) continue;
                if (installedApp) {
                    if (rule.version_value && installedApp.version) {
                        const operator = rule.version_operator || '=';
                        if (!versionSatisfies(installedApp.version, operator, rule.version_value)) {
                            isViolating = true;
                            details = `Application '${installedApp.app_name}' is version ${installedApp.version}, required ${operator} ${rule.version_value}.`;
                        }
                    } else if (rule.version_value && !installedApp.version) {
                        isViolating = true;
                        details = `Application '${installedApp.app_name}' has unknown version, required ${rule.version_operator || '='} ${rule.version_value}.`;
                    }
                }
            } else if (rule.rule_type === 'minimum_version') {
                if (apps.length === 0) continue;
                if (!installedApp) {
                    isViolating = true;
                    details = `Required application containing '${rule.app_name}' is not installed.`;
                } else if (rule.version_value && installedApp.version) {
                    if (!versionSatisfies(installedApp.version, '>=', rule.version_value)) {
                        isViolating = true;
                        details = `Application '${installedApp.app_name}' is version ${installedApp.version}, minimum required is ${rule.version_value}.`;
                    }
                } else if (rule.version_value && !installedApp.version) {
                    isViolating = true;
                    details = `Application '${installedApp.app_name}' has unknown version, minimum required is ${rule.version_value}.`;
                }
            } else if (rule.rule_type === 'os') {
                // The frontend sends the condition via the 'app_name' field for all rule types
                const targetOS = rule.app_name || rule.os_name;
                if (targetOS && machine.os_name && machine.os_name.toLowerCase().includes(targetOS.toLowerCase())) {
                    isViolating = true;
                    details = `Forbidden OS detected: ${machine.os_name}`;
                }
            } else if (rule.rule_type === 'required_os') {
                const targetOS = rule.app_name || rule.os_name;
                if (targetOS && (!machine.os_name || !machine.os_name.toLowerCase().includes(targetOS.toLowerCase()))) {
                    isViolating = true;
                    details = `Required OS '${targetOS}' is not running (Current: ${machine.os_name || 'Unknown'}).`;
                }
            }

            if (isViolating) {
                violations.push({
                    rule_id: rule.id,
                    details: details
                });
            }
        }

        await runTransaction(async () => {
            // We clear existing compliance results for this machine and insert the fresh evaluation
            await dbRun(`DELETE FROM compliance_results WHERE machine_id = ?`, [machineId]);

            for (const v of violations) {
                await dbRun(
                    `INSERT INTO compliance_results (id, machine_id, rule_id, status, details, last_checked) VALUES (?, ?, ?, 'Non-Compliant', ?, GETUTCDATE())`,
                    [uuidv4(), machineId, v.rule_id, v.details]
                );
            }
        });

        console.log(`[COMPLIANCE] Evaluated ${rules.length} rules for machine ${machineId}. Found ${violations.length} violations.`);
    } catch (err) {
        console.error(`[COMPLIANCE ERROR] Failed to evaluate compliance for machine ${machineId}:`, err);
    }
}

export async function evaluateAllMachinesCompliance() {
    try {
        const machines = await dbAll('SELECT id FROM machines WHERE (is_archived = 0 OR is_archived IS NULL)') as any[];
        let totalViolations = 0;

        console.log(`[COMPLIANCE] Triggering evaluation for ${machines.length} machines due to rule change.`);
        for (const m of machines) {
            await evaluateMachineCompliance(m.id);
        }
    } catch (err) {
        console.error(`[COMPLIANCE ERROR] Failed to evaluate all machines:`, err);
    }
}

let complianceInterval: NodeJS.Timeout | null = null;

export function startBackgroundComplianceService(intervalMinutes: number = 15) {
    if (complianceInterval) return;

    // Run immediately on start
    evaluateAllMachinesCompliance();

    // Set up interval
    complianceInterval = setInterval(evaluateAllMachinesCompliance, intervalMinutes * 60 * 1000);

    console.log(`✓ Background compliance service started (every ${intervalMinutes} minutes)`);
}

export function stopBackgroundComplianceService() {
    if (complianceInterval) {
        clearInterval(complianceInterval);
        complianceInterval = null;
    }
}
