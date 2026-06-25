const sql = require('mssql/msnodesqlv8');
const { config } = require('./server/dist/config.js');

async function run() {
    const dbConfig = {
      server: config.dbServer,
      database: config.dbName,
      driver: 'msnodesqlv8',
      options: {
        trustedConnection: true,
        encrypt: config.dbEncrypt,
        trustServerCertificate: true,
        enableArithAbort: true
      }
    };
    
    await sql.connect(dbConfig);
    await sql.query("UPDATE settings SET value = '[\"User\", \"Shopfloor\", \"Server\", \"Kiosk\", \"Network\", \"Unassigned\", \"Other\"]' WHERE [key] = 'categories'");
    console.log('Done');
    process.exit(0);
}
run().catch(console.error);
