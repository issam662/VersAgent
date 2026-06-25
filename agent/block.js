const sql = require('mssql');
const config = {
    user: 'Issam_IT',
    password: 'issam123',
    server: 'EUMOOUJ-DB01',
    database: 'IT_Applications',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function blockPC() {
    try {
        await sql.connect(config);
        console.log('Connected to DB...');
        try {
            await sql.query("ALTER TABLE machines ADD active BIT NOT NULL DEFAULT 1");
            console.log('Column "active" added successfully.');
        } catch (e) {
            console.log('Column might already exist:', e.message);
        }
        
        const result = await sql.query("UPDATE machines SET active=0 WHERE hostname LIKE '%DLD9VW9Q3%'");
        console.log('Rows affected:', result.rowsAffected[0]);
        const st = await sql.query("SELECT hostname, active FROM machines WHERE hostname LIKE '%DLD9VW9Q3%'");
        console.log('Current status:', st.recordset);
    } catch (err) {
        console.error(err);
    } finally {
        sql.close();
    }
}
blockPC();
