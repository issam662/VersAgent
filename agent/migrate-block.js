const sql = require('mssql');

async function main() {
    try {
        const pool = await new sql.ConnectionPool({
            server: 'EUMOOUJ-DB01',
            database: 'IT_Applications',
            user: 'Issam_IT',
            password: 'issam123',
            options: { encrypt: false, trustServerCertificate: true }
        }).connect();
        
        console.log('Connected to IT_Applications OK');
        
        await pool.request().query("IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'machines' AND COLUMN_NAME = 'block_reason') ALTER TABLE machines ADD block_reason NVARCHAR(MAX)");
        console.log('block_reason column: OK');
        
        await pool.request().query("IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'machines' AND COLUMN_NAME = 'active') ALTER TABLE machines ADD active BIT DEFAULT 1");
        console.log('active column: OK');
        
        await pool.close();
    } catch (e) {
        console.error('Migration ERROR:', e.message);
    }
    process.exit(0);
}

main();
