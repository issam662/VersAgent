import 'dotenv/config';
import { initializeDatabase, dbRun, closeDatabase } from './index.js';

async function update() {
  console.log('Connecting to database...');
  await initializeDatabase();

  console.log('Updating categories for unmanaged machines (is_managed = 0) to "Shopfloor"...');
  
  const result = await dbRun(`
    UPDATE mm
    SET mm.category = 'Shopfloor',
        mm.updated_at = GETDATE()
    FROM machine_metadata mm
    INNER JOIN machines m ON mm.machine_id = m.id
    WHERE m.is_managed = 0
  `);

  console.log(`\n=== SUCCESS ===`);
  console.log(`Successfully updated ${result.changes} machine metadata records to "Shopfloor".`);
  console.log(`===============\n`);

  await closeDatabase();
}

update().catch(console.error);
