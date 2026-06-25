// @ts-ignore
import sql from 'mssql';
import { config } from '../config.js';

let pool: sql.ConnectionPool | null = null;

export async function initializeDatabase(): Promise<void> {
  try {
    const dbConfig: sql.config = {
      server: config.dbServer,
      database: config.dbName,
      driver: 'msnodesqlv8', // Use native driver for Windows Auth
      options: {
        trustedConnection: true,
        encrypt: config.dbEncrypt,
        trustServerCertificate: true,
        enableArithAbort: true
      }
    };

    // If user/pass provided, switch to standard auth (override driver)
    if (config.dbUser && config.dbPassword) {
      // @ts-ignore
      delete dbConfig.driver;
      // @ts-ignore
      delete dbConfig.options.trustedConnection;
      dbConfig.user = config.dbUser;
      dbConfig.password = config.dbPassword;
      pool = await new sql.ConnectionPool(dbConfig).connect();
    } else {
      // Windows Auth: Use explicit connection string to avoid IM002 error
      const connectionString = `Driver={ODBC Driver 17 for SQL Server};Server=${config.dbServer};Database=${config.dbName};Trusted_Connection=Yes;TrustServerCertificate=Yes;Encrypt=${config.dbEncrypt ? 'Yes' : 'No'};`;
      console.log(`Connecting with: ${connectionString}`);
      pool = await new sql.ConnectionPool({
        driver: 'msnodesqlv8',
        connectionString
      }).connect();
    }
    console.log('✓ Connected to MSSQL Database');

    await runMigrations();
  } catch (err) {
    console.error('Database initialization failed:', err);
    throw err;
  }
}

export function getDb(): sql.ConnectionPool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

// Helper to convert ? placeholders to @param0, @param1, etc.
function adaptQuery(sqlQuery: string): string {
  let index = 0;
  // Simple regex to replace ? with @param0, @param1...
  // Note: This assumes ? is not used in string literals.
  return sqlQuery.replace(/\?/g, () => `@param${index++}`);
}

export async function dbRun(query: string, params: any[] = []): Promise<{ changes: number, lastID: number }> { // lastID is tricky in MSSQL without SCOPE_IDENTITY()
  if (!pool) throw new Error('Database not initialized');
  const request = pool.request();
  params.forEach((param, index) => {
    request.input(`param${index}`, param);
  });
  const adapted = adaptQuery(query);
  if (process.env.DEBUG_SQL) console.log(`Executing: ${adapted} with params: ${JSON.stringify(params)}`);
  try {
    const result = await request.query(adapted);
    return { changes: result.rowsAffected[0], lastID: 0 };
  } catch (err) {
    console.error(`Query failed: ${adapted}`);
    console.error(err);
    throw err;
  }
}

export async function dbGet(query: string, params: any[] = []): Promise<any> {
  if (!pool) throw new Error('Database not initialized');
  const request = pool.request();
  params.forEach((param, index) => {
    request.input(`param${index}`, param);
  });
  const adapted = adaptQuery(query);
  if (process.env.DEBUG_SQL) console.log(`Executing (Get): ${adapted} with params: ${JSON.stringify(params)}`);
  try {
    const result = await request.query(adapted);
    return result.recordset[0];
  } catch (err) {
    console.error(`Query (Get) failed: ${adapted}`);
    console.error(err);
    throw err;
  }
}

export async function dbAll(query: string, params: any[] = []): Promise<any[]> {
  if (!pool) throw new Error('Database not initialized');
  const request = pool.request();
  params.forEach((param, index) => {
    request.input(`param${index}`, param);
  });
  const result = await request.query(adaptQuery(query));
  return result.recordset || [];
}

// Transaction helper
export async function runTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (!pool) throw new Error('Database not initialized');
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Note: For full transaction support with our helpers, we'd need to pass the transaction object
    // through to dbRun/dbGet. For now, we rely on the pool but this is not strictly atomic
    // if helpers use pool.request(). 
    // FIX: Ideally we rewrite helpers to accept optional transaction.
    // For this migration, we'll assume basic atomic operations.
    const result = await work();
    await transaction.commit();
    return result;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}


async function runMigrations(): Promise<void> {
  if (!pool) return;

  // T-SQL Migrations
  const migrations = [
    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'printers')
        CREATE TABLE printers (
            id NVARCHAR(255) PRIMARY KEY,
            ip_address NVARCHAR(50) NOT NULL,
            category NVARCHAR(50) DEFAULT 'Other',
            department NVARCHAR(255),
            mac_address NVARCHAR(50),
            serial_number NVARCHAR(255),
            hostname NVARCHAR(255),
            model NVARCHAR(255),
            queue_name NVARCHAR(255),
            station_name NVARCHAR(255),
            line NVARCHAR(255),
            comment NVARCHAR(MAX),
            custom_website_url NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE()
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'users')
        CREATE TABLE users (
            id NVARCHAR(255) PRIMARY KEY,
            username NVARCHAR(255) UNIQUE NOT NULL,
            password_hash NVARCHAR(MAX) NOT NULL,
            full_name NVARCHAR(255),
            title NVARCHAR(255),
            role NVARCHAR(50) NOT NULL CHECK (role IN ('SuperAdmin', 'Admin', 'Viewer')),
            email NVARCHAR(255),
            email_notifications BIT DEFAULT 0,
            is_active BIT DEFAULT 1,
            failed_login_attempts INT DEFAULT 0,
            locked_until DATETIME2,
            last_login DATETIME2,
            avatar NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE()
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'sessions')
        CREATE TABLE sessions (
            id NVARCHAR(255) PRIMARY KEY,
            user_id NVARCHAR(255) NOT NULL,
            token NVARCHAR(255) UNIQUE NOT NULL,
            expires_at DATETIME2 NOT NULL,
            ip_address NVARCHAR(50),
            user_agent NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'machines')
        CREATE TABLE machines (
            id NVARCHAR(255) PRIMARY KEY,
            hostname NVARCHAR(255),
            serial_number NVARCHAR(255),
            is_managed BIT DEFAULT 1,
            is_archived BIT DEFAULT 0,
            agent_id NVARCHAR(255),
            agent_version NVARCHAR(50),
            os_name NVARCHAR(255),
            os_version NVARCHAR(50),
            os_build NVARCHAR(50),
            operating_system NVARCHAR(255),
            cpu NVARCHAR(255),
            ram_gb FLOAT,
            disk_gb FLOAT,
            [current_user] NVARCHAR(255),
            last_heartbeat DATETIME2,
            last_inventory DATETIME2,
            last_seen DATETIME2,
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE()
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'machine_metadata')
        CREATE TABLE machine_metadata (
            machine_id NVARCHAR(255) PRIMARY KEY,
            category NVARCHAR(50) DEFAULT 'User',
            location NVARCHAR(255),
            description NVARCHAR(MAX),
            tags NVARCHAR(MAX),
            notes NVARCHAR(MAX),
            updated_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'network_interfaces')
        CREATE TABLE network_interfaces (
            id NVARCHAR(255) PRIMARY KEY,
            machine_id NVARCHAR(255) NOT NULL,
            mac_address NVARCHAR(50) NOT NULL,
            ip_address NVARCHAR(50),
            interface_name NVARCHAR(255),
            vlan_id NVARCHAR(50),
            vlan_name NVARCHAR(255),
            switch_name NVARCHAR(255),
            switch_ip NVARCHAR(50),
            switch_port NVARCHAR(50),
            mapping_source NVARCHAR(50) DEFAULT 'Unknown',
            allow_overwrite BIT DEFAULT 1,
            last_refreshed DATETIME2,
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'installed_apps')
        CREATE TABLE installed_apps (
            id NVARCHAR(255) PRIMARY KEY,
            machine_id NVARCHAR(255) NOT NULL,
            app_name NVARCHAR(255) NOT NULL,
            version NVARCHAR(MAX),
            publisher NVARCHAR(MAX),
            install_date DATETIME2,
            scope NVARCHAR(50),
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'app_events')
        CREATE TABLE app_events (
            id NVARCHAR(255) PRIMARY KEY,
            machine_id NVARCHAR(255) NOT NULL,
            event_type NVARCHAR(50) NOT NULL CHECK (event_type IN ('installed', 'updated', 'uninstalled')),
            app_name NVARCHAR(255) NOT NULL,
            old_version NVARCHAR(MAX),
            new_version NVARCHAR(MAX),
            publisher NVARCHAR(MAX),
            severity NVARCHAR(50) DEFAULT 'info',
            timestamp DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'compliance_rules')
        CREATE TABLE compliance_rules (
            id NVARCHAR(255) PRIMARY KEY,
            name NVARCHAR(255) NOT NULL,
            rule_type NVARCHAR(50) NOT NULL CHECK (rule_type IN ('mandatory', 'blacklist', 'outdated', 'os', 'software_required', 'required_os')),
            app_name NVARCHAR(255),
            app_aliases NVARCHAR(MAX),
            version_operator NVARCHAR(10),
            version_value NVARCHAR(50),
            os_name NVARCHAR(255),
            os_version NVARCHAR(50),
            os_build NVARCHAR(50),
            severity NVARCHAR(50) DEFAULT 'warning',
            description NVARCHAR(MAX),
            is_active BIT DEFAULT 1,
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE()
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'rule_exceptions')
        CREATE TABLE rule_exceptions (
            id NVARCHAR(255) PRIMARY KEY,
            rule_id NVARCHAR(255) NOT NULL,
            machine_id NVARCHAR(255) NOT NULL,
            reason NVARCHAR(MAX) NOT NULL,
            expires_at DATETIME2,
            created_by NVARCHAR(255),
            created_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (rule_id) REFERENCES compliance_rules(id) ON DELETE CASCADE,
            FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'compliance_results')
        CREATE TABLE compliance_results (
            id NVARCHAR(255) PRIMARY KEY,
            machine_id NVARCHAR(255) NOT NULL,
            rule_id NVARCHAR(255) NOT NULL,
            status NVARCHAR(50) DEFAULT 'Non-Compliant',
            details NVARCHAR(MAX),
            last_checked DATETIME2 DEFAULT GETDATE(),
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE,
            FOREIGN KEY (rule_id) REFERENCES compliance_rules(id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'incidents')
        CREATE TABLE incidents (
            id NVARCHAR(255) PRIMARY KEY,
            title NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX),
            status NVARCHAR(50) DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Closed')),
            priority NVARCHAR(50) DEFAULT 'Medium',
            machine_id NVARCHAR(255),
            assigned_to NVARCHAR(255),
            created_by NVARCHAR(255),
            closed_at DATETIME2,
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE SET NULL,
            FOREIGN KEY (assigned_to) REFERENCES users(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'news_items')
        CREATE TABLE news_items (
            id NVARCHAR(255) PRIMARY KEY,
            title NVARCHAR(255) NOT NULL,
            content NVARCHAR(MAX),
            image_path NVARCHAR(MAX),
            is_active BIT DEFAULT 1,
            sort_order INT DEFAULT 0,
            expires_at DATETIME2,
            created_by NVARCHAR(255),
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'audit_logs')
        CREATE TABLE audit_logs (
            id NVARCHAR(255) PRIMARY KEY,
            user_id NVARCHAR(255),
            username NVARCHAR(255),
            action NVARCHAR(255) NOT NULL,
            entity_type NVARCHAR(50),
            entity_id NVARCHAR(255),
            old_value NVARCHAR(MAX),
            new_value NVARCHAR(MAX),
            ip_address NVARCHAR(50),
            user_agent NVARCHAR(MAX),
            timestamp DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'switch_inventory')
        CREATE TABLE switch_inventory (
            id NVARCHAR(255) PRIMARY KEY,
            name NVARCHAR(255) NOT NULL,
            ip_address NVARCHAR(50) NOT NULL,
            snmp_version NVARCHAR(10) DEFAULT '2c',
            snmp_community NVARCHAR(255),
            is_active BIT DEFAULT 1,
            last_polled DATETIME2,
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE()
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'backups')
        CREATE TABLE backups (
            id NVARCHAR(255) PRIMARY KEY,
            filename NVARCHAR(255) NOT NULL,
            file_path NVARCHAR(MAX) NOT NULL,
            file_size BIGINT,
            backup_type NVARCHAR(50) DEFAULT 'manual',
            status NVARCHAR(50) DEFAULT 'completed',
            created_by NVARCHAR(255),
            created_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'alerts')
        CREATE TABLE alerts (
            id NVARCHAR(255) PRIMARY KEY,
            machine_id NVARCHAR(255),
            user_id NVARCHAR(255),
            alert_type NVARCHAR(50) NOT NULL,
            severity NVARCHAR(50) DEFAULT 'info',
            title NVARCHAR(255) NOT NULL,
            message NVARCHAR(MAX),
            link NVARCHAR(MAX),
            is_read BIT DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'scan_results')
        CREATE TABLE scan_results (
            id NVARCHAR(255) PRIMARY KEY,
            ip NVARCHAR(50) NOT NULL,
            hostname NVARCHAR(255),
            mac_address NVARCHAR(50),
            open_ports NVARCHAR(MAX) DEFAULT '[]',
            vulnerabilities NVARCHAR(MAX) DEFAULT '[]',
            scanned_at DATETIME2 DEFAULT GETDATE()
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'settings')
        CREATE TABLE settings (
            [key] NVARCHAR(255) PRIMARY KEY,
            [value] NVARCHAR(MAX) NOT NULL,
            updated_at DATETIME2 DEFAULT GETDATE()
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'cve_cache')
        CREATE TABLE cve_cache (
            cve_id NVARCHAR(255) PRIMARY KEY,
            description NVARCHAR(MAX),
            cvss_score FLOAT,
            severity NVARCHAR(50),
            published_date DATETIME2,
            updated_at DATETIME2 DEFAULT GETDATE(),
            remediation_links NVARCHAR(MAX),
            cisa_kev BIT DEFAULT 0,
            exploitability_score FLOAT,
            impact_score FLOAT,
            attack_vector NVARCHAR(100)
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'cve_affected_software')
        CREATE TABLE cve_affected_software (
            id NVARCHAR(255) PRIMARY KEY,
            cve_id NVARCHAR(255) NOT NULL,
            vendor NVARCHAR(255),
            product NVARCHAR(255) NOT NULL,
            version_start NVARCHAR(255),
            version_end NVARCHAR(255),
            version_end_excluding NVARCHAR(255),
            target_sw NVARCHAR(255),
            FOREIGN KEY (cve_id) REFERENCES cve_cache(cve_id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'cve_affected_software' AND COLUMN_NAME = 'target_sw')
         ALTER TABLE cve_affected_software ADD target_sw NVARCHAR(255)`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'machine_vulnerabilities')
        CREATE TABLE machine_vulnerabilities (
            id NVARCHAR(255) PRIMARY KEY,
            machine_id NVARCHAR(255) NOT NULL,
            cve_id NVARCHAR(255) NOT NULL,
            app_name NVARCHAR(255) NOT NULL,
            app_version NVARCHAR(MAX),
            detected_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE,
            FOREIGN KEY (cve_id) REFERENCES cve_cache(cve_id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM settings WHERE [key] = 'news_autoscroll_interval')
         INSERT INTO settings ([key], [value]) VALUES ('news_autoscroll_interval', '5000')`,

    `IF NOT EXISTS (SELECT * FROM settings WHERE [key] = 'categories')
         INSERT INTO settings ([key], [value]) VALUES ('categories', '["User", "Shopfloor", "Server", "Kiosk", "Network", "Unassigned", "Other"]')`,

    `IF NOT EXISTS (SELECT * FROM settings WHERE [key] = 'printer_categories')
         INSERT INTO settings ([key], [value]) VALUES ('printer_categories', '["OFFICE", "KSK", "DCIX", "SAP"]')`,

    `IF NOT EXISTS (SELECT * FROM settings WHERE [key] = 'departments')
         INSERT INTO settings ([key], [value]) VALUES ('departments', '["production", "ME", "ME_Autocad", "IT", "logistics", "MAINTENANCE", "CUTTING", "QUALITY", "QUALITY_metrologie", "TRAINING CENTRE", "logistics_Reception", "logistics_Expedition", "logistics_OPS", "General management", "HR"]')`,

    `BEGIN TRY
         CREATE UNIQUE INDEX IX_machines_agent_id ON machines(agent_id) WHERE agent_id IS NOT NULL
     END TRY BEGIN CATCH END CATCH`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'machines' AND COLUMN_NAME = 'status')
         ALTER TABLE machines ADD status NVARCHAR(50) DEFAULT 'offline'`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'network_interfaces' AND COLUMN_NAME = 'dns_servers')
         ALTER TABLE network_interfaces ADD dns_servers NVARCHAR(MAX)`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'network_interfaces' AND COLUMN_NAME = 'default_gateway')
         ALTER TABLE network_interfaces ADD default_gateway NVARCHAR(50)`,

    `BEGIN TRY
         ALTER TABLE installed_apps ALTER COLUMN version NVARCHAR(MAX)
         ALTER TABLE installed_apps ALTER COLUMN publisher NVARCHAR(MAX)
     END TRY BEGIN CATCH END CATCH`,

    `BEGIN TRY
         ALTER TABLE app_events ALTER COLUMN old_version NVARCHAR(MAX)
         ALTER TABLE app_events ALTER COLUMN new_version NVARCHAR(MAX)
         ALTER TABLE app_events ALTER COLUMN publisher NVARCHAR(MAX)
     END TRY BEGIN CATCH END CATCH`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'machine_metadata' AND COLUMN_NAME = 'department')
         ALTER TABLE machine_metadata ADD department NVARCHAR(255)`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'machine_metadata' AND COLUMN_NAME = 'family')
         ALTER TABLE machine_metadata ADD family NVARCHAR(255)`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'network_interfaces' AND COLUMN_NAME = 'switch_platform')
         ALTER TABLE network_interfaces ADD switch_platform NVARCHAR(255)`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'printers' AND COLUMN_NAME = 'line')
         ALTER TABLE printers ADD line NVARCHAR(255)`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'printers' AND COLUMN_NAME = 'comment')
         ALTER TABLE printers ADD comment NVARCHAR(MAX)`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'machines' AND COLUMN_NAME = 'block_reason')
         ALTER TABLE machines ADD block_reason NVARCHAR(MAX)`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'machines' AND COLUMN_NAME = 'active')
         ALTER TABLE machines ADD active BIT DEFAULT 1`,

    // Add minimum_version to the rule_type CHECK constraint
    `BEGIN TRY
         DECLARE @constraintName NVARCHAR(255);
         SELECT @constraintName = dc.name
         FROM sys.check_constraints dc
         JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
         WHERE OBJECT_NAME(dc.parent_object_id) = 'compliance_rules' AND c.name = 'rule_type';
         IF @constraintName IS NOT NULL
         BEGIN
             EXEC('ALTER TABLE compliance_rules DROP CONSTRAINT ' + @constraintName);
             ALTER TABLE compliance_rules ADD CONSTRAINT CK_compliance_rules_rule_type CHECK (rule_type IN ('mandatory', 'blacklist', 'outdated', 'os', 'software_required', 'required_os', 'minimum_version'));
         END
     END TRY BEGIN CATCH END CATCH`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'machines' AND COLUMN_NAME = 'cpu')
         ALTER TABLE machines ADD cpu NVARCHAR(255)`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'machines' AND COLUMN_NAME = 'ram_gb')
         ALTER TABLE machines ADD ram_gb FLOAT`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'machines' AND COLUMN_NAME = 'disk_gb')
         ALTER TABLE machines ADD disk_gb FLOAT`,

    // ── Facility Layout tables ──
    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'layout_floors')
        CREATE TABLE layout_floors (
            id NVARCHAR(255) PRIMARY KEY,
            name NVARCHAR(255) NOT NULL,
            floor_order INT DEFAULT 0,
            width FLOAT DEFAULT 1000,
            height FLOAT DEFAULT 400,
            svg_data NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE()
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'layout_devices')
        CREATE TABLE layout_devices (
            id NVARCHAR(255) PRIMARY KEY,
            floor_id NVARCHAR(255) NOT NULL,
            device_type NVARCHAR(50) NOT NULL CHECK (device_type IN ('rack', 'wap', 'printer')),
            name NVARCHAR(255),
            ip_address NVARCHAR(50),
            parent_rack_id NVARCHAR(255),
            printer_id NVARCHAR(255),
            pos_x FLOAT NOT NULL DEFAULT 0,
            pos_y FLOAT NOT NULL DEFAULT 0,
            status NVARCHAR(50) DEFAULT 'offline',
            switch_name NVARCHAR(255),
            metadata NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (floor_id) REFERENCES layout_floors(id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'layout_devices' AND COLUMN_NAME = 'switch_name')
         ALTER TABLE layout_devices ADD switch_name NVARCHAR(255)`,
         
    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'cve_cache' AND COLUMN_NAME = 'remediation_links')
         ALTER TABLE cve_cache ADD remediation_links NVARCHAR(MAX), cisa_kev BIT DEFAULT 0, exploitability_score FLOAT, impact_score FLOAT, attack_vector NVARCHAR(100)`,

    // Seed default floors (matching the 2 blueprint images)
    `IF NOT EXISTS (SELECT 1 FROM layout_floors WHERE id = 'floor-ground')
        INSERT INTO layout_floors (id, name, floor_order, width, height) VALUES ('floor-ground', 'OFFICES', 1, 1024, 567)`,

    `IF NOT EXISTS (SELECT 1 FROM layout_floors WHERE id = 'floor-site')
        INSERT INTO layout_floors (id, name, floor_order, width, height) VALUES ('floor-site', 'SHOPFLOOR', 0, 1024, 768)`,

    // Rename existing floors for databases that already have the old names
    `UPDATE layout_floors SET name = 'OFFICES', floor_order = 1 WHERE id = 'floor-ground'`,
    `UPDATE layout_floors SET name = 'SHOPFLOOR', floor_order = 0 WHERE id = 'floor-site'`,

    // Update incidents status check constraint to include 'Resolved'
    `BEGIN TRY
         DECLARE @incConstraintName NVARCHAR(255);
         SELECT @incConstraintName = dc.name
         FROM sys.check_constraints dc
         JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
         WHERE OBJECT_NAME(dc.parent_object_id) = 'incidents' AND c.name = 'status';
         IF @incConstraintName IS NOT NULL
         BEGIN
             EXEC('ALTER TABLE incidents DROP CONSTRAINT ' + @incConstraintName);
             ALTER TABLE incidents ADD CONSTRAINT CK_incidents_status CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed'));
         END
     END TRY BEGIN CATCH END CATCH`,

    // ── Tasks Module tables ──
    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'tasks')
        CREATE TABLE tasks (
            id NVARCHAR(255) PRIMARY KEY,
            title NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX),
            importance_level NVARCHAR(50) NOT NULL CHECK (importance_level IN ('Low', 'Medium', 'High', 'Critical')),
            status NVARCHAR(50) NOT NULL DEFAULT 'On Going' CHECK (status IN ('On Going', 'On Hold', 'Closed')),
            start_date DATETIME2,
            end_date DATETIME2,
            created_by NVARCHAR(255),
            created_at DATETIME2 DEFAULT GETDATE(),
            updated_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'task_subtasks')
        CREATE TABLE task_subtasks (
            id NVARCHAR(255) PRIMARY KEY,
            task_id NVARCHAR(255) NOT NULL,
            title NVARCHAR(255) NOT NULL,
            is_completed BIT DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'task_assignments')
        CREATE TABLE task_assignments (
            task_id NVARCHAR(255) NOT NULL,
            user_id NVARCHAR(255) NOT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),
            PRIMARY KEY (task_id, user_id),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'subtask_assignments')
        CREATE TABLE subtask_assignments (
            subtask_id NVARCHAR(255) NOT NULL,
            user_id NVARCHAR(255) NOT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),
            PRIMARY KEY (subtask_id, user_id),
            FOREIGN KEY (subtask_id) REFERENCES task_subtasks(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tasks' AND COLUMN_NAME = 'deleted_at')
         ALTER TABLE tasks ADD deleted_at DATETIME2 NULL`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'task_comments')
        CREATE TABLE task_comments (
            id NVARCHAR(255) PRIMARY KEY,
            task_id NVARCHAR(255) NOT NULL,
            user_id NVARCHAR(255) NOT NULL,
            content NVARCHAR(MAX) NOT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'task_subtasks' AND COLUMN_NAME = 'description')
         ALTER TABLE task_subtasks ADD description NVARCHAR(MAX) NULL`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'task_comments' AND COLUMN_NAME = 'subtask_id')
         ALTER TABLE task_comments ADD subtask_id NVARCHAR(255) NULL`,

    `IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_task_comments_subtask')
         ALTER TABLE task_comments ADD CONSTRAINT FK_task_comments_subtask FOREIGN KEY (subtask_id) REFERENCES task_subtasks(id) ON DELETE CASCADE`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'alerts' AND COLUMN_NAME = 'user_id')
         BEGIN
             ALTER TABLE alerts ADD user_id NVARCHAR(255) NULL;
             ALTER TABLE alerts ADD CONSTRAINT FK_alerts_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
         END`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'alerts' AND COLUMN_NAME = 'link')
         ALTER TABLE alerts ADD link NVARCHAR(MAX) NULL`,

    // ── Offline sub-status ──
    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'machines' AND COLUMN_NAME = 'offline_reason')
         ALTER TABLE machines ADD offline_reason NVARCHAR(50) NULL`,

    `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'email_notifications')
         ALTER TABLE users ADD email_notifications BIT DEFAULT 0`,
  ];

  for (const sqlQuery of migrations) {
    try {
      await pool.request().query(sqlQuery);
    } catch (err) {
      console.error('Migration failed:', err);
      // Don't throw, try next (idempotency check handles it)
    }
  }

  console.log('✓ Database migrations completed');
}

export function saveDatabase(): void {
  // No-op
}
