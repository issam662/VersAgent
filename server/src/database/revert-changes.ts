import fs from 'fs';
import 'dotenv/config';
import { initializeDatabase, dbRun, dbAll, closeDatabase } from './index.js';

async function revert() {
  console.log('Connecting to database...');
  await initializeDatabase();

  const backupPath = 'c:/Users/Public/Documents/App/PFE PROJECT/server/backups/auto-backup-2026-05-20T18-00-00-020Z.json';
  if (!fs.existsSync(backupPath)) {
    console.error(`Backup file not found at: ${backupPath}`);
    await closeDatabase();
    return;
  }

  console.log('Reading backup file...');
  const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const backupIncidents = backupData.incidents || [];
  const backupMetadata = backupData.machine_metadata || [];

  console.log(`Original incidents in backup: ${backupIncidents.length}`);
  console.log(`Original machine_metadata in backup: ${backupMetadata.length}`);

  // ----------------------------------------------------
  // STEP 1: REVERT INCIDENTS
  // ----------------------------------------------------
  console.log('\n--- Reverting Incidents Table ---');
  console.log('Deleting all current records from incidents...');
  await dbRun('DELETE FROM incidents');
  
  console.log('Inserting original incidents from backup...');
  let incidentsRestored = 0;
  for (const inc of backupIncidents) {
    await dbRun(`
      INSERT INTO incidents (id, title, description, status, priority, machine_id, assigned_to, created_by, closed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      inc.id,
      inc.title,
      inc.description,
      inc.status,
      inc.priority,
      inc.machine_id,
      inc.assigned_to,
      inc.created_by,
      inc.closed_at,
      inc.created_at,
      inc.updated_at
    ]);
    incidentsRestored++;
  }
  console.log(`Successfully restored ${incidentsRestored} original incidents!`);

  // ----------------------------------------------------
  // STEP 2: REVERT UNMANAGED MACHINES CATEGORIES
  // ----------------------------------------------------
  console.log('\n--- Reverting Machine Categories ---');
  
  // Get all unmanaged machines
  const unmanagedMachines = await dbAll(`
    SELECT m.id, m.hostname
    FROM machines m
    WHERE m.is_managed = 0
  `);
  console.log(`Found ${unmanagedMachines.length} unmanaged machines in the active database.`);

  // Build backup metadata map
  const backupMap = new Map<string, string>();
  backupMetadata.forEach((row: any) => {
    backupMap.set(row.machine_id, row.category);
  });

  // Query all audit logs for machine category updates
  console.log('Fetching audit logs for machine category updates...');
  const logs = await dbAll(`
    SELECT timestamp, entity_id, new_value
    FROM audit_logs
    WHERE entity_type = 'machine' AND action LIKE 'Updated machine configuration%'
    ORDER BY timestamp DESC
  `);

  // Group audit logs by machine ID
  const auditMap = new Map<string, any[]>();
  logs.forEach((log: any) => {
    if (!auditMap.has(log.entity_id)) {
      auditMap.set(log.entity_id, []);
    }
    auditMap.get(log.entity_id)!.push(log);
  });

  let restoredFromBackup = 0;
  let restoredFromAudit = 0;
  let restoredToDefault = 0;

  const categoryBreakdown: Record<string, number> = {};

  for (const machine of unmanagedMachines) {
    let targetCategory = 'Unassigned'; // default fallback
    let source = '';

    // Strategy A: If exists in backup, use backup value
    const backupCategory = backupMap.get(machine.id);
    if (backupCategory !== undefined) {
      targetCategory = backupCategory;
      source = 'backup';
      restoredFromBackup++;
    } else {
      // Strategy B: Inspect audit logs for any prior update
      const machineLogs = auditMap.get(machine.id) || [];
      
      let foundPriorUpdate = false;
      for (const log of machineLogs) {
        try {
          const val = JSON.parse(log.new_value);
          if (val && val.category) {
            targetCategory = val.category;
            source = 'audit log';
            restoredFromAudit++;
            foundPriorUpdate = true;
            break; // Since logs are ordered DESC by timestamp, the first one is the most recent
          }
        } catch (e) {}
      }

      if (!foundPriorUpdate) {
        // Strategy C: Fall back to default initialized category
        targetCategory = 'Unassigned';
        source = 'default';
        restoredToDefault++;
      }
    }

    // Update category in machine_metadata
    await dbRun(`
      UPDATE machine_metadata
      SET category = ?, updated_at = GETDATE()
      WHERE machine_id = ?
    `, [targetCategory, machine.id]);

    categoryBreakdown[targetCategory] = (categoryBreakdown[targetCategory] || 0) + 1;
    
    if (restoredFromBackup + restoredFromAudit + restoredToDefault <= 5 || source === 'backup') {
      console.log(`- Restored ${machine.hostname} (${machine.id}) to '${targetCategory}' (source: ${source})`);
    }
  }

  console.log('\n--- CATEGORY REVERT SUMMARY ---');
  console.log(`Total unmanaged machines processed: ${unmanagedMachines.length}`);
  console.log(`- Restored from backup values: ${restoredFromBackup}`);
  console.log(`- Restored from audit logs: ${restoredFromAudit}`);
  console.log(`- Restored to default 'Unassigned': ${restoredToDefault}`);
  console.log('Final categories distribution among unmanaged machines:', categoryBreakdown);

  await closeDatabase();
  console.log('\nReversion completed successfully!');
}

revert().catch(console.error);
