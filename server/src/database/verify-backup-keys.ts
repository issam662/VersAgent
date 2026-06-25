import fs from 'fs';

async function check() {
  const backupPath = 'c:/Users/Public/Documents/App/PFE PROJECT/server/backups/auto-backup-2026-05-20T18-00-00-020Z.json';
  
  if (!fs.existsSync(backupPath)) {
    console.error('Backup file not found at:', backupPath);
    return;
  }
  
  console.log('Reading and parsing backup file...');
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  
  console.log('Keys in backup JSON:', Object.keys(data));
  
  if (data.machine_metadata) {
    console.log(`machine_metadata records in backup: ${data.machine_metadata.length}`);
  } else {
    console.log('machine_metadata not found in backup!');
  }
  
  if (data.incidents) {
    console.log(`incidents records in backup: ${data.incidents.length}`);
    console.log(JSON.stringify(data.incidents, null, 2));
  } else {
    console.log('incidents not found in backup!');
  }
}

check().catch(console.error);
