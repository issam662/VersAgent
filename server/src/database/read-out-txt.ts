import fs from 'fs';

function readOut() {
  const filepath = 'c:/Users/Public/Documents/App/PFE PROJECT/server/out.txt';
  if (fs.existsSync(filepath)) {
    console.log(`=== Reading ${filepath} ===`);
    const content = fs.readFileSync(filepath, 'utf8');
    console.log('File size:', content.length);
    console.log('Content:');
    console.log(content);
  } else {
    console.log(`${filepath} does not exist.`);
  }
}

readOut();
