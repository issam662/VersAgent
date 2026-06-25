import 'dotenv/config';
import { initializeDatabase, dbAll, closeDatabase } from './index.js';

async function check() {
  await initializeDatabase();
  
  // Get counts of machines by is_managed status
  const counts = await dbAll(`
    SELECT is_managed, COUNT(*) as cnt 
    FROM machines 
    GROUP BY is_managed
  `);
  console.log('--- MACHINES BY IS_MANAGED ---');
  console.log(counts);

  // Check how many is_managed = 0 machines exist, and their current categories
  const unmanagedDetails = await dbAll(`
    SELECT m.id, m.hostname, m.is_managed, mm.category
    FROM machines m
    LEFT JOIN machine_metadata mm ON m.id = mm.machine_id
    WHERE m.is_managed = 0
  `);
  
  console.log('\n--- UNMANAGED MACHINES DETAILS ---');
  console.log(`Total unmanaged machines: ${unmanagedDetails.length}`);
  
  const categoriesCount: Record<string, number> = {};
  let missingMetadataCount = 0;
  
  unmanagedDetails.forEach((row: any) => {
    if (!row.category) {
      missingMetadataCount++;
    } else {
      categoriesCount[row.category] = (categoriesCount[row.category] || 0) + 1;
    }
  });
  
  console.log('Categories among unmanaged machines:', categoriesCount);
  console.log('Unmanaged machines missing metadata row:', missingMetadataCount);
  
  await closeDatabase();
}

check().catch(console.error);
