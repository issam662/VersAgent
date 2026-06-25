import 'dotenv/config';
import { initializeDatabase, dbRun, closeDatabase } from './index.js';

async function update() {
  console.log('Connecting to database...');
  await initializeDatabase();

  console.log("Updating all machines with category 'Unassigned' to 'Shopfloor'...");
  
  const result = await dbRun(`
    UPDATE machine_metadata
    SET category = 'Shopfloor',
        updated_at = GETDATE()
    WHERE category = 'Unassigned'
  `);

  console.log(`\n=== SUCCESS ===`);
  console.log(`Successfully updated ${result.changes} machine(s) from 'Unassigned' to 'Shopfloor'.`);
  console.log(`===============\n`);

  await closeDatabase();
}

update().catch(console.error);
