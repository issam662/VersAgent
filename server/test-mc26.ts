import { initializeDatabase, dbGet, dbAll, closeDatabase } from './src/database/index.js';
import { isVersionVulnerable } from './src/services/cveService.js';

async function debugMC26() {
    await initializeDatabase();
    try {
        const mc26 = await dbGet("SELECT * FROM machines WHERE hostname = 'MC26'");
        if (!mc26) {
            console.log("MC26 not found.");
            return;
        }

        console.log(`Evaluating MC26 OS: ${mc26.os_name} (Version: ${mc26.os_version})`);

        // We know from earlier that os_name is "Windows 10 Enterprise LTSC 2019"
        // and normalizeAppName('Windows 10 Enterprise LTSC 2019') returns 'windows_10'
        const normalizedOs = 'windows_10';
        console.log(`Normalized OS Product ID: ${normalizedOs}`);

        const osRules = await dbAll(
            `SELECT s.*, c.cvss_score, c.severity 
             FROM cve_affected_software s
             JOIN cve_cache c ON s.cve_id = c.cve_id
             WHERE s.product = ?`,
            [normalizedOs]
        );

        console.log(`Found ${osRules.length} rules matching product '${normalizedOs}' in the database.`);

        let matchCount = 0;
        for (const rule of osRules) {
            const isVulnerable = isVersionVulnerable(mc26.os_version || '0.0.0', rule) || (!rule.version_start && !rule.version_end && !rule.version_end_excluding);
            if (isVulnerable) {
                matchCount++;
                if (matchCount <= 5) {
                    console.log(`  Hit: CVE ${rule.cve_id} - [Start: ${rule.version_start}, End: ${rule.version_end}]`);
                }
            }
        }
        console.log(`Total vulnerabilities flagged for ${mc26.hostname} OS: ${matchCount}`);

    } catch (e) {
        console.error(e);
    } finally {
        await closeDatabase();
    }
}

debugMC26();
