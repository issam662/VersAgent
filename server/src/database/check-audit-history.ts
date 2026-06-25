import 'dotenv/config';
import { initializeDatabase, dbAll, closeDatabase } from './index.js';

async function check() {
  await initializeDatabase();
  
  const logs = await dbAll(`
    SELECT timestamp, username, action, entity_type, entity_id, old_value, new_value
    FROM audit_logs
    WHERE timestamp >= '2026-05-20'
    ORDER BY timestamp DESC
  `);
  
  console.log(`Found ${logs.length} audit logs since today:`);
  
  // Group by action type or summarize
  const summary: Record<string, number> = {};
  logs.forEach((log: any) => {
    const actionPrefix = log.action.split(':')[0];
    summary[actionPrefix] = (summary[actionPrefix] || 0) + 1;
  });
  console.log('Logs action summary:', summary);
  
  console.log('\nLast 30 audit log entries:');
  console.log(logs.slice(0, 30));
  
  await closeDatabase();
}

check().catch(console.error);
