// @ts-ignore
import sql from 'mssql/msnodesqlv8';
import { config } from './config.js';

async function testConnection() {
    console.log('Testing MSSQL Connection...');
    try {
        const connectionString = `Driver={ODBC Driver 17 for SQL Server};Server=${config.dbServer};Database=${config.dbName};Trusted_Connection=Yes;TrustServerCertificate=Yes;Encrypt=${config.dbEncrypt ? 'Yes' : 'No'};`;
        console.log(`Connection String: ${connectionString}`);

        const pool = await new sql.ConnectionPool({
            driver: 'msnodesqlv8',
            connectionString,
            connectionTimeout: 5000 // 5 seconds timeout
        }).connect();

        console.log('Successfully connected!');
        await pool.close();
    } catch (err) {
        console.error('Connection failed:', err);
    }
}

testConnection();
