import { initializeDatabase, dbAll, closeDatabase } from './src/database/index.js';
import { isVersionVulnerable, compareVersions } from './src/services/cveService.js';

async function testChromeVulnerabilities() {
    await initializeDatabase();

    const chromeVersion = '145.0.7632.110';
    console.log(`Testing Chrome Version: ${chromeVersion}\\n`);

    // Fetch all vulnerabilities currently linked to this machine's Chrome installation
    const query = `
        SELECT v.id, v.app_name, v.app_version, c.cve_id, c.cvss_score, c.severity
        FROM machine_vulnerabilities v
        JOIN cve_cache c ON v.cve_id = c.cve_id
        WHERE v.app_name = 'chrome' AND v.app_version = ?
    `;
    const activeVulns = await dbAll(query, [chromeVersion]);
    console.log(`Active Vulnerabilities found for Chrome ${chromeVersion}: ${activeVulns.length}`);

    if (activeVulns.length > 0) {
        console.table(activeVulns.slice(0, 5));

        // Analyze the bounds for the first a few CVEs
        for (const vuln of activeVulns.slice(0, 3)) {
            console.log(`\\n--- Analyzing bounds for ${vuln.cve_id} ---`);
            const bounds = await dbAll(`
                SELECT product, version_start, version_end, version_end_excluding 
                FROM cve_affected_software 
                WHERE cve_id = ? AND product LIKE '%chrome%'
            `, [vuln.cve_id]);

            console.table(bounds);

            for (const bound of bounds) {
                const isVuln = isVersionVulnerable(chromeVersion, bound);
                console.log(`Rule check | Product: ${bound.product} | Vulnerable: ${isVuln}`);
                if (bound.version_end_excluding) {
                    console.log(`Comparison: ${chromeVersion} vs ${bound.version_end_excluding} -> ${compareVersions(chromeVersion, bound.version_end_excluding)}`);
                }
            }
        }
    }

    await closeDatabase();
}

testChromeVulnerabilities().catch(console.error);
