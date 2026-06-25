import fs from 'fs';

function checkFile(filepath: string) {
  if (fs.existsSync(filepath)) {
    console.log(`=== ${filepath} ===`);
    const lines = fs.readFileSync(filepath, 'utf8').split('\n');
    console.log(`Total lines: ${lines.length}`);
    console.log('First 50 lines:');
    console.log(lines.slice(0, 50).join('\n'));
  } else {
    console.log(`${filepath} does not exist.`);
  }
}

checkFile('c:/Users/Public/Documents/App/PFE PROJECT/server/seed_log.txt');
checkFile('c:/Users/Public/Documents/App/PFE PROJECT/server/seed_log_2.txt');
