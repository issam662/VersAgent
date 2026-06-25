import 'dotenv/config';
import { initializeDatabase, dbAll, closeDatabase } from './index.js';

async function check() {
  await initializeDatabase();
  
  const incidents = await dbAll('SELECT TOP 10 * FROM incidents');
  console.log('--- EXISTING INCIDENTS (TOP 10) ---');
  console.log(incidents);
  
  const total = await dbAll('SELECT COUNT(*) as cnt FROM incidents');
  console.log(`Total incidents: ${total[0].cnt}`);
  
  await closeDatabase();
}

check().catch(console.error);
