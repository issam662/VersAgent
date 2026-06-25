import fs from 'fs';

function checkBackup(filepath: string) {
  if (fs.existsSync(filepath)) {
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    console.log(`=== ${filepath} ===`);
    console.log(`machines: ${data.machines?.length || 0}`);
    console.log(`machine_metadata: ${data.machine_metadata?.length || 0}`);
    console.log(`incidents: ${data.incidents?.length || 0}`);
  } else {
    console.log(`${filepath} does not exist.`);
  }
}

const dir = 'c:/Users/Public/Documents/App/PFE PROJECT/server/backups';
checkBackup(`${dir}/auto-backup-2026-05-18T18-00-00-017Z.json`);
checkBackup(`${dir}/auto-backup-2026-05-19T18-00-00-014Z.json`);
