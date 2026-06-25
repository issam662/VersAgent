const sql = require('mssql');
(async () => {
    try {
        await sql.connect({
            user: 'ahhpks',
            password: 'Aptiv@2026',
            server: 'EUMOOUJ-DB01',
            database: 'pfe_system',
            options: { encrypt: false, trustServerCertificate: true }
        });
        await sql.query('ALTER TABLE machines ADD block_reason NVARCHAR(MAX) NULL;');
        console.log('DB MIGRATION: SUCCESS');
    } catch (e) {
        console.log('DB MIGRATION: FAILED / ALREADY EXISTS', e.message);
    }
    process.exit(0);
})();
