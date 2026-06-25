import fs from 'fs';

function readUtf16(filepath: string) {
  if (fs.existsSync(filepath)) {
    console.log(`=== Reading ${filepath} ===`);
    const content = fs.readFileSync(filepath, 'utf16le');
    console.log('File size in chars:', content.length);
    console.log('First 500 characters:');
    console.log(content.slice(0, 500));
  } else {
    console.log(`${filepath} does not exist.`);
  }
}

readUtf16('c:/Users/Public/Documents/App/PFE PROJECT/server/db_dump.json');
readUtf16('c:/Users/Public/Documents/App/PFE PROJECT/server/db_dump_actual.json');
