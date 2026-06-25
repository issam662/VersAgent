const sql = require('mssql/msnodesqlv8');
const { config } = require('dotenv');
config();

async function test() {
    try {
        const connectionString = `Driver={ODBC Driver 17 for SQL Server};Server=${process.env.DB_SERVER || 'EUMOOUJ-DB01'};Database=${process.env.DB_NAME || 'IT_Applications'};Trusted_Connection=Yes;TrustServerCertificate=Yes;Encrypt=No;`;
        const pool = await new sql.ConnectionPool({
            driver: 'msnodesqlv8',
            connectionString
        }).connect();

        // Find the user
        const result = await pool.request().query("SELECT TOP 1 id, username, email_notifications FROM users");
        const user = result.recordset[0];
        console.log('Before update:', user);

        if (!user) {
            console.log('User not found');
            process.exit(1);
        }

        // Run update query exactly like dbRun
        const req = pool.request();
        req.input('param0', 1); // True
        req.input('param1', user.id);
        
        console.log('Executing UPDATE users SET email_notifications = @param0 WHERE id = @param1');
        await req.query('UPDATE users SET email_notifications = @param0 WHERE id = @param1');

        // Fetch again
        const result2 = await pool.request().query(`SELECT id, username, email_notifications FROM users WHERE id = '${user.id}'`);
        console.log('After update 1:', result2.recordset[0]);

        const req2 = pool.request();
        req2.input('param0', true); // True boolean
        req2.input('param1', user.id);
        await req2.query('UPDATE users SET email_notifications = @param0 WHERE id = @param1');

        const result3 = await pool.request().query(`SELECT id, username, email_notifications FROM users WHERE id = '${user.id}'`);
        console.log('After update true:', result3.recordset[0]);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
