import fs from 'fs';
import 'dotenv/config';
import { initializeDatabase, dbAll, closeDatabase } from './index.js';

async function compare() {
  await initializeDatabase();
  
  // Get all current metadata
  const currentMetadata = await dbAll('SELECT machine_id, category FROM machine_metadata');
  console.log(`Current machine_metadata records: ${currentMetadata.length}`);
  
  // Read backup
  const backupPath = 'c:/Users/Public/Documents/App/PFE PROJECT/server/backups/auto-backup-2026-05-20T18-00-00-020Z.json';
  const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const backupMetadata = backupData.machine_metadata || [];
  console.log(`Backup machine_metadata records: ${backupMetadata.length}`);
  
  // Build a map of backup metadata
  const backupMap = new Map<string, string>();
  backupMetadata.forEach((row: any) => {
    backupMap.set(row.machine_id, row.category);
  });
  
  // Compare
  let matches = 0;
  let differences = 0;
  let missingInBackup = 0;
  
  const diffList: any[] = [];
  
  currentMetadata.forEach((row: any) => {
    const backupCategory = backupMap.get(row.machine_id);
    if (backupCategory === undefined) {
      missingInBackup++;
    } else if (backupCategory === row.category) {
      matches++;
    } else {
      differences++;
      diffList.push({
        machine_id: row.machine_id,
        current: row.category,
        backup: backupCategory
      });
    }
  });
  
  console.log(`\n--- COMPARISON RESULTS ---`);
  console.log(`Matches: ${matches}`);
  console.log(`Differences: ${differences}`);
  console.log(`Rows in DB but missing in backup: ${missingInBackup}`);
  
  console.log('\nSample differences (first 10):');
  console.log(diffList.slice(0, 10));
  
  await closeDatabase();
}

compare().catch(console.error);
