import fs from 'fs';
import path from 'path';

async function check() {
  const backupPath = 'c:\\Users\\Public\\Documents\\App\\PFE PROJECT\\server\\backups\\auto-backup-2026-05-20T18-00-00-020Z.json';
  
  if (!fs.existsSync(backupPath)) {
    console.error('Backup file not found at:', backupPath);
    return;
  }
  
  console.log('Reading backup file size...');
  const stats = fs.statSync(backupPath);
  console.log(`File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
  
  // Read first 1000 characters to check format
  const stream = fs.createReadStream(backupPath, { encoding: 'utf8', start: 0, end: 5000 });
  for await (const chunk of stream) {
    console.log('--- START OF BACKUP FILE ---');
    console.log(chunk);
    break;
  }
}

check().catch(console.error);
