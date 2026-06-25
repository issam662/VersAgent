import { Router, Request, Response } from 'express';
import { dbAll, dbGet } from '../database/index.js';
import { syncCVEData, getSyncStatus } from '../services/cveService.js';
// import { authenticate } from '../middleware/auth.js';

const router = Router();

// Temporarily bypass auth for local debugging
// router.use(authenticate);

/**
 * GET /api/vulnerabilities/audit-cves
 * Debug route to inspect formatting issues
 */
/**
 * GET /api/vulnerabilities/force-eval
 * Force re-evaluation of all machines with new matching logic
 */
router.get('/force-eval', async (req: Request, res: Response) => {
    try {
        const { evaluateAllMachinesVulnerabilities } = await import('../services/cveService.js');
        await evaluateAllMachinesVulnerabilities();
        res.json({ message: "Global Evaluation Complete" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/vulnerabilities/export
 * Exports all registered network vulnerabilities to CSV
 */
router.get('/export', async (req: Request, res: Response) => {
    try {
        const rows = await dbAll(`
            SELECT m.hostname, m.os_name, v.app_name, v.app_version, 
                   c.cve_id, c.cvss_score, c.severity, c.description, c.published_date
            FROM machine_vulnerabilities v
            JOIN machines m ON v.machine_id = m.id
            JOIN cve_cache c ON v.cve_id = c.cve_id
            ORDER BY m.hostname ASC, c.cvss_score DESC
        `);

        if (!rows || rows.length === 0) {
            return res.status(404).send('No vulnerabilities found.');
        }

        const escapeCsv = (str: any) => `"${String(str || '').replace(/"/g, '""')}"`;
        const headers = ['Hostname', 'OS', 'Application', 'Version', 'CVE ID', 'Severity', 'CVSS Score', 'Published Date', 'Description'];

        const csvRows = rows.map((r: any) => [
            escapeCsv(r.hostname),
            escapeCsv(r.os_name),
            escapeCsv(r.app_name),
            escapeCsv(r.app_version),
            escapeCsv(r.cve_id),
            escapeCsv(r.severity),
            escapeCsv(r.cvss_score),
            escapeCsv(r.published_date ? new Date(r.published_date).toISOString().split('T')[0] : ''),
            escapeCsv(r.description)
        ].join(','));

        const csvContent = [headers.join(','), ...csvRows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="network_vulnerabilities_export.csv"');
        res.send(csvContent);
    } catch (err) {
        console.error('[API] /vulnerabilities/export error:', err);
        res.status(500).send('Failed to generate export');
    }
});

/**
 * GET /api/vulnerabilities/debug-edge
 * Inspects exactly how NVD provides version bounds for Edge
 */
router.get('/debug-edge', async (req: Request, res: Response) => {
    try {
        const rules = await dbAll("SELECT TOP 20 cve_id, product, version_start, version_end, version_end_excluding FROM cve_affected_software WHERE product LIKE '%edge%' AND version_end_excluding IS NOT NULL ORDER BY cve_id DESC");
        const apps = await dbAll("SELECT * FROM installed_apps WHERE app_name LIKE '%edge%'");
        res.json({ nvdRules: rules, installedApps: apps });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/vulnerabilities/debug-chrome
 * Inspects exactly how NVD provides version bounds for Chrome
 */
router.get('/debug-chrome', async (req: Request, res: Response) => {
    try {
        const rules = await dbAll("SELECT TOP 20 cve_id, product, version_start, version_end, version_end_excluding, target_sw FROM cve_affected_software WHERE product = 'chrome' AND version_end_excluding IS NOT NULL ORDER BY version_end_excluding DESC");
        const activeVulns = await dbAll("SELECT v.app_name, v.app_version, c.cve_id, c.cvss_score FROM machine_vulnerabilities v JOIN cve_cache c ON v.cve_id = c.cve_id WHERE v.app_name = 'chrome' ORDER BY c.cvss_score DESC");
        res.json({ nvdRules: rules, activeVulns });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/stats', async (req: Request, res: Response) => {
    // Disable caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    try {
        const allMachines = req.query.allMachines === 'true';
        const allCves = req.query.allCves === 'true';

        // Top vulnerable machines
        const topMachines = await dbAll(`
            SELECT m.id, m.hostname, m.os_name, COUNT(v.id) as vuln_count,
            SUM(CASE WHEN c.severity = 'CRITICAL' THEN 1 ELSE 0 END) as critical_count
            FROM machine_vulnerabilities v
            JOIN machines m ON v.machine_id = m.id
            JOIN cve_cache c ON v.cve_id = c.cve_id
            GROUP BY m.id, m.hostname, m.os_name
            ORDER BY critical_count DESC, vuln_count DESC
            ${allMachines ? '' : 'OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY'}
            `);

        const severity = req.query.severity as string;

        // Top most common CVEs
        const topCves = await dbAll(`
            SELECT c.cve_id, c.cvss_score, c.severity, c.description, 
                   c.remediation_links, c.cisa_kev, c.exploitability_score, 
                   c.impact_score, c.attack_vector, c.published_date,
                   COUNT(DISTINCT v.machine_id) as affected_machines,
                   (SELECT STRING_AGG(sub_app, ', ') FROM (SELECT DISTINCT app_name as sub_app FROM machine_vulnerabilities sub_v WHERE sub_v.cve_id = c.cve_id) as t) as affected_apps
            FROM machine_vulnerabilities v
            JOIN cve_cache c ON v.cve_id = c.cve_id
            ${severity && severity !== 'all' ? `WHERE LOWER(c.severity) = '${severity.toLowerCase()}'` : ''}
            GROUP BY c.cve_id, c.cvss_score, c.severity, c.description, c.remediation_links, c.cisa_kev, c.exploitability_score, c.impact_score, c.attack_vector, c.published_date
            ORDER BY affected_machines DESC
            ${allCves ? '' : 'OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY'}
            `);

        const totalVulnerableMachinesRow = await dbGet(`
            SELECT COUNT(DISTINCT machine_id) as count 
            FROM machine_vulnerabilities
            `);

        // Total scanned machines (all active machines)
        const scannedMachinesRow = await dbGet(`
            SELECT COUNT(*) as count FROM machines WHERE is_archived = 0 OR is_archived IS NULL
            `);

        // Total CVEs tracked in cache
        const totalCvesRow = await dbGet(`
            SELECT COUNT(*) as count FROM cve_cache
            `);

        // Global severity distribution of CVEs affecting machines
        const globalSevRows = await dbAll(`
            SELECT c.severity, COUNT(DISTINCT v.cve_id) as count
            FROM machine_vulnerabilities v
            JOIN cve_cache c ON v.cve_id = c.cve_id
            GROUP BY c.severity
            `);
        
        const globalSevCounts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
        globalSevRows.forEach((r: any) => {
            const s = r.severity?.toLowerCase() || 'unknown';
            if (s in globalSevCounts) {
                globalSevCounts[s as keyof typeof globalSevCounts] += r.count;
            } else {
                globalSevCounts.unknown += r.count;
            }
        });

        // Last sync time
        const lastSyncRow = await dbGet(`
            SELECT MAX(updated_at) as last_sync 
            FROM cve_cache
            `);

        res.json({
            stats: {
                totalVulnerableMachines: totalVulnerableMachinesRow?.count || 0,
                scannedMachines: scannedMachinesRow?.count || 0,
                totalCvesTracked: totalCvesRow?.count || 0,
                globalSevCounts,
                lastSync: lastSyncRow?.last_sync || null,
                syncStatus: getSyncStatus()
            },
            topMachines,
            topCves
        });
    } catch (err) {
        console.error('[API] /vulnerabilities/stats error:', err);
        res.status(500).json({ error: 'Failed to fetch vulnerability stats' });
    }
});

/**
 * GET /api/vulnerabilities/machine/:id
 * Gets all vulnerabilities for a specific machine.
 */
router.get('/machine/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const vulnerabilities = await dbAll(`
            SELECT v.id as report_id, v.app_name, v.app_version, v.detected_at,
            c.cve_id, c.description, c.cvss_score, c.severity, c.published_date,
            c.remediation_links, c.cisa_kev, c.exploitability_score, c.impact_score, c.attack_vector
            FROM machine_vulnerabilities v
            JOIN cve_cache c ON v.cve_id = c.cve_id
            WHERE v.machine_id = ?
            ORDER BY c.cvss_score DESC
                `, [id]);

        res.json(vulnerabilities);
    } catch (err) {
        console.error(`[API] / vulnerabilities / machine / ${req.params.id} error: `, err);
        res.status(500).json({ error: 'Failed to fetch machine vulnerabilities' });
    }
});

/**
 * GET /api/vulnerabilities/cve/:id/machines
 * Gets all machines affected by a specific CVE.
 */
router.get('/cve/:id/machines', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const machines = await dbAll(`
            SELECT m.id, m.hostname, m.operating_system as os_name,
            (SELECT TOP 1 ip_address FROM network_interfaces WHERE machine_id = m.id) as ip_address,
            v.app_name, v.app_version, v.detected_at
            FROM machine_vulnerabilities v
            JOIN machines m ON v.machine_id = m.id
            WHERE v.cve_id = ?
            ORDER BY m.hostname ASC
        `, [id]);

        res.json(machines);
    } catch (err) {
        console.error(`[API] /vulnerabilities/cve/${req.params.id}/machines error:`, err);
        res.status(500).json({ error: 'Failed to fetch machines affected by CVE' });
    }
});

/**
 * POST /api/vulnerabilities/sync
 * Manually triggers a CVE sync.
 */
router.post('/sync', async (req: Request, res: Response) => {
    try {
        // We run it async so we don't block the request for 10 seconds
        if (getSyncStatus().isSyncing) {
            return res.status(409).json({ message: 'A synchronization is already in progress.', status: getSyncStatus() });
        }

        syncCVEData(true);

        res.json({ message: 'CVE synchronization started.', status: getSyncStatus() });
    } catch (err) {
        console.error('[API] /vulnerabilities/sync error:', err);
        res.status(500).json({ error: 'Failed to trigger CVE sync' });
    }
});

export default router;
