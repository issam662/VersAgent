import 'dotenv/config';
import { initializeDatabase, dbAll, closeDatabase } from './index.js';

async function check() {
  await initializeDatabase();
  
  const users = await dbAll('SELECT id, username, role FROM users');
  console.log('--- USERS IN DATABASE ---');
  console.log(users);
  
  const machines = await dbAll('SELECT id, hostname FROM machines');
  console.log('--- MACHINES IN DATABASE ---');
  console.log(`Total machines: ${machines.length}`);
  
  await closeDatabase();
}

check().catch(console.error);
