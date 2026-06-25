const sql = require('mssql');

async function test() {
    try {
        const pool = await sql.connect({
            server: 'EUMOOUJ-DB01',
            database: 'IT_Applications',
            user: 'Issam_IT',
            password: 'issam123',
            options: { encrypt: false, trustServerCertificate: true }
        });

        // Check if we can SELECT on settings
        try {
            const r = await pool.request().query("SELECT HAS_PERMS_BY_NAME('dbo.settings', 'OBJECT', 'SELECT') as can_select");
            console.log('HAS_PERMS settings SELECT:', r.recordset[0].can_select);
        } catch (e) { console.log('HAS_PERMS error:', e.message); }

        // Create a fresh table and try SELECT - this should tell us if it's only old tables
        try {
            await pool.request().query("IF OBJECT_ID('dbo.fresh_test') IS NOT NULL DROP TABLE dbo.fresh_test");
            await pool.request().query("CREATE TABLE dbo.fresh_test (id INT, val NVARCHAR(50))");
            console.log('Created fresh_test');
            await pool.request().query("INSERT INTO dbo.fresh_test VALUES (1, 'hello')");
            console.log('Inserted into fresh_test');
            const r = await pool.request().query("SELECT * FROM dbo.fresh_test");
            console.log('SELECT fresh_test:', r.recordset);
            await pool.request().query("DROP TABLE dbo.fresh_test");
            console.log('PASSED: Can CREATE + INSERT + SELECT + DROP fresh tables');
        } catch (e) {
            console.log('FRESH TABLE TEST FAILED:', e.message);
        }

        // Check if there's a deny at server level
        try {
            const r = await pool.request().query(`
                SELECT dp.permission_name, dp.state_desc
                FROM sys.server_permissions dp
                JOIN sys.server_principals sp ON dp.grantee_principal_id = sp.principal_id
                WHERE sp.name = 'Issam_IT'
            `);
            console.log('Server-level permissions:', r.recordset);
        } catch (e) { console.log('Server perms check error:', e.message); }

        // Check database-level explicit denials
        try {
            const r = await pool.request().query(`
                SELECT p.permission_name, p.state_desc, 
                       OBJECT_NAME(p.major_id) as object_name,
                       dp.name as principal_name
                FROM sys.database_permissions p
                JOIN sys.database_principals dp ON p.grantee_principal_id = dp.principal_id
                WHERE p.state_desc = 'DENY'
            `);
            console.log('Database DENY permissions:', r.recordset);
        } catch (e) { console.log('DB deny check error:', e.message); }

        await pool.close();
    } catch (e) {
        console.log('Error:', e.message);
    }
}

test();
