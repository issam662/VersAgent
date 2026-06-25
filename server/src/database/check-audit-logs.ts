import 'dotenv/config';
import { initializeDatabase, dbAll, closeDatabase } from './index.js';

async function check() {
  await initializeDatabase();
  
  console.log('Querying top 100 audit logs...');
  const logs = await dbAll(`
    SELECT TOP 100 * 
    FROM audit_logs 
    ORDER BY timestamp DESC
  `);
  
  console.log(`Total audit logs: ${logs.length}`);
  console.log('Sample audit logs:');
  console.log(logs.slice(0, 10));
  
  // Specifically look for machine metadata or category changes
  const categoryLogs = await dbAll(`
    SELECT * 
    FROM audit_logs 
    WHERE action LIKE '%category%' OR entity_type = 'machine' OR entity_type = 'machine_metadata'
    ORDER BY timestamp DESC
  `);
  
  console.log(`\nFound ${categoryLogs.length} category/machine audit logs:`);
  console.log(categoryLogs.slice(0, 20));
  
  await closeDatabase();
}

check().catch(console.error);
