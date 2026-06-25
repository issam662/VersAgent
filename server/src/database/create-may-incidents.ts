import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import { initializeDatabase, dbAll, dbRun, closeDatabase } from './index.js';

// Realistic IT / Shopfloor descriptions
const descriptions = [
  "BTO - counting is stuck at 0 per hour",
  "BTO application is inaccessible, impacting Wire harness manufacturing for Skoda customer at 10754 - Morocco 5",
  "Need to change the time of backup process for a server - No Error Message",
  "Service Catalog Guidance - Email Distribution List - Information",
  "PRINTER KSK_PRT_02 offline, stopping printing of box labels on line 3",
  "User cannot connect to VPN on laptop - Cisco AnyConnect secure gateway unreachable",
  "SAP access denied - password expired or account locked",
  "Slow performance on workstation, causing lag in AutoCAD application"
];

async function createMayIncidents() {
  console.log('Connecting to database...');
  await initializeDatabase();

  // Get active users
  const users = await dbAll('SELECT id, username FROM users');
  if (users.length === 0) {
    console.error('No users found in database.');
    await closeDatabase();
    return;
  }

  // Get user ID of ahhpks (creator login)
  const ahhpksUser = users.find(u => u.username === 'ahhpks');
  if (!ahhpksUser) {
    console.error('User "ahhpks" not found in the database. Cannot continue.');
    await closeDatabase();
    return;
  }
  const creatorId = ahhpksUser.id;

  // Get all machines for random assignment
  const machines = await dbAll('SELECT id FROM machines');

  console.log('Creating 2 closed incidents for May 2026...');

  for (let i = 0; i < 2; i++) {
    const id = uuidv4();
    const incNum = Math.floor(1000000 + Math.random() * 9000000);
    const title = `INC${incNum}`;
    const description = descriptions[Math.floor(Math.random() * descriptions.length)];
    const priority = Math.random() < 0.7 ? 'P4' : 'P3';
    const status = 'Closed';

    // 60% chance to assign a random machine
    const hasMachine = Math.random() < 0.6;
    const machineId = hasMachine && machines.length > 0 ? machines[Math.floor(Math.random() * machines.length)].id : null;

    // Assign to a random user
    const assignedToUser = users[Math.floor(Math.random() * users.length)];
    const assignedTo = assignedToUser.id;

    // Random day in May 2026 before today (May 20)
    const randomDay = Math.floor(1 + Math.random() * 19);
    const randomHour = Math.floor(8 + Math.random() * 10); // 8 AM to 6 PM
    const randomMinute = Math.floor(Math.random() * 60);
    const randomSecond = Math.floor(Math.random() * 60);

    const createdAt = new Date(2026, 4, randomDay, randomHour, randomMinute, randomSecond); // Month is 4 for May in JS
    const closeDelayMs = (4 + Math.random() * 48) * 60 * 60 * 1000; // 4 to 52 hours
    const closedAt = new Date(createdAt.getTime() + closeDelayMs);

    const createdAtStr = createdAt.toISOString();
    const closedAtStr = closedAt.toISOString();
    const updatedAtStr = closedAt.toISOString();

    await dbRun(
      `INSERT INTO incidents (id, title, description, status, priority, machine_id, assigned_to, created_by, closed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, description, status, priority, machineId, assignedTo, creatorId, closedAtStr, createdAtStr, updatedAtStr]
    );

    console.log(`- Created Incident ${title}: "${description}" | Created at: ${createdAtStr.slice(0,10)} | Resolved`);
  }

  console.log('\n=== SUCCESS ===');
  console.log('Successfully created 2 closed incidents in May 2026!');
  console.log('===============\n');

  await closeDatabase();
}

createMayIncidents().catch(console.error);
