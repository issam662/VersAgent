import sql from 'mssql';
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
        const r1 = await pool.request().query(`SELECT COUNT(DISTINCT machine_id) as count FROM machine_vulnerabilities`);
        const r2 = await pool.request().query(`SELECT COUNT(DISTINCT cve_id) as count FROM machine_vulnerabilities`);
        console.log('Machines:', r1.recordset[0].count);
        console.log('CVEs:', r2.recordset[0].count);
    } catch(e) {
        console.error('ERROR:', e.message);
    }
    process.exit(0);
}
run();
