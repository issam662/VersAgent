import fs from 'fs';
import 'dotenv/config';
import { initializeDatabase, dbAll, closeDatabase } from './index.js';

async function check() {
  await initializeDatabase();
  
  // Read backup to identify which machine_ids are missing in it
  const backupPath = 'c:/Users/Public/Documents/App/PFE PROJECT/server/backups/auto-backup-2026-05-20T18-00-00-020Z.json';
  const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const backupMetadata = backupData.machine_metadata || [];
  
  const backupMachineIds = new Set<string>();
  backupMetadata.forEach((row: any) => {
    backupMachineIds.add(row.machine_id);
  });
  
  // Query all metadata from database
  const dbMetadata = await dbAll('SELECT machine_id, category, updated_at FROM machine_metadata');
  
  // Find database rows missing in backup
  const missingInBackup = dbMetadata.filter((row: any) => !backupMachineIds.has(row.machine_id));
  
  console.log(`Total DB metadata rows: ${dbMetadata.length}`);
  console.log(`Missing in backup: ${missingInBackup.length}`);
  
  if (missingInBackup.length > 0) {
    console.log('\nSample rows missing in backup:');
    console.log(missingInBackup.slice(0, 5));
    
    // Also fetch the machines table created_at for these missing ones
    const sampleIds = missingInBackup.slice(0, 5).map((row: any) => row.machine_id);
    // Simple parameterized IN clause helper
    const idPlaceholders = sampleIds.map(() => '?').join(',');
    const machinesInfo = await dbAll(`
      SELECT id, hostname, created_at, is_managed
      FROM machines
      WHERE id IN (${idPlaceholders})
    `, sampleIds);
    console.log('\nCorresponding machine creation dates:');
    console.log(machinesInfo);
  }
  
  await closeDatabase();
}

check().catch(console.error);
