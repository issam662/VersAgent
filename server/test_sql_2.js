import sql from 'mssql';
import { getSyncStatus } from './services/cveService.js';
import express from 'express';

async function run() {
    const config = {
        server: 'EUMOOUJ-DB01',
        database: 'IT_Applications',
        user: 'Issam_IT',
        password: 'issam123',
        options: { trustServerCertificate: true, encrypt: false }
    };
    try {
        const pool = await sql.connect(config);
        
        const allMachines = true;
        const topMachinesQuery = `
            SELECT m.id, m.hostname, m.os_name, COUNT(v.id) as vuln_count,
            SUM(CASE WHEN c.severity = 'CRITICAL' THEN 1 ELSE 0 END) as critical_count
            FROM machine_vulnerabilities v
            JOIN machines m ON v.machine_id = m.id
            JOIN cve_cache c ON v.cve_id = c.cve_id
            GROUP BY m.id, m.hostname, m.os_name
            ORDER BY critical_count DESC, vuln_count DESC
            ${allMachines ? '' : 'OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY'}
        `;
        
        const r1 = await pool.request().query(topMachinesQuery);
        console.log('Result machines:', r1.recordset.length);
        
    } catch(e) {
        console.error('ERROR:', e.message);
    }
    process.exit(0);
}
run();
