import fs from 'fs';
import path from 'path';

const searchDir = 'c:/Users/Public/Documents/App/PFE PROJECT/server/src';

function scanDirectory(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes('machine_metadata')) {
        console.log(`Found "machine_metadata" in ${fullPath}`);
        // Log surrounding context for matches
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (line.toLowerCase().includes('machine_metadata') || line.toLowerCase().includes('category')) {
            if (line.includes('UPDATE') || line.includes('INSERT') || line.includes('category =') || line.includes("category'")) {
              console.log(`  Line ${index + 1}: ${line.trim()}`);
            }
          }
        });
      }
    }
  }
}

console.log('Scanning src directory for machine_metadata category queries...');
scanDirectory(searchDir);
