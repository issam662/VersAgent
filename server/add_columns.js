
import { config } from './dist/config.js';
import sql from 'mssql';

async function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function addColumns() {
    try {
        await log('Connecting to database...');
        const pool = await new sql.ConnectionPool({
            user: config.dbUser,
            password: config.dbPassword,
            server: config.dbServer,
            database: config.dbName,
            options: {
                encrypt: config.dbEncrypt,
                trustServerCertificate: true
            }
        }).connect();

        await log('Checking for missing columns in machines table...');

        // Check if CPU column exists
        const checkCpu = await pool.request().query("SELECT COL_LENGTH('machines', 'cpu') as len");
        if (checkCpu.recordset[0].len === null) {
            await log('Adding cpu column...');
            await pool.request().query("ALTER TABLE machines ADD cpu NVARCHAR(255)");
        } else {
            await log('cpu column already exists.');
        }

        // Check if RAM column exists
        const checkRam = await pool.request().query("SELECT COL_LENGTH('machines', 'ram_gb') as len");
        if (checkRam.recordset[0].len === null) {
            await log('Adding ram_gb column...');
            await pool.request().query("ALTER TABLE machines ADD ram_gb FLOAT");
        } else {
            await log('ram_gb column already exists.');
        }

        // Check if Disk column exists
        const checkDisk = await pool.request().query("SELECT COL_LENGTH('machines', 'disk_gb') as len");
        if (checkDisk.recordset[0].len === null) {
            await log('Adding disk_gb column...');
            await pool.request().query("ALTER TABLE machines ADD disk_gb INT");
        } else {
            await log('disk_gb column already exists.');
        }

        // Check network_interfaces for vlan_id (should exist, but verifying)
        const checkVlan = await pool.request().query("SELECT COL_LENGTH('network_interfaces', 'vlan_id') as len");
        if (checkVlan.recordset[0].len === null) {
            await log('Adding vlan_id column to network_interfaces...');
            await pool.request().query("ALTER TABLE network_interfaces ADD vlan_id NVARCHAR(50)");
        } else {
            await log('vlan_id column already exists in network_interfaces.');
        }

        await log('Schema update complete.');
        pool.close();

    } catch (err) {
        console.error('Migration failed:', err);
    }
}

addColumns();
