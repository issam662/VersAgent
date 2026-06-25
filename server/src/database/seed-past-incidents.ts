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
  "Slow performance on workstation, causing lag in AutoCAD application",
  "Network interface connection dropped on line 4 switch port 12",
  "Active Directory account locked out for user after multiple failed attempts",
  "Disk space running low on server APTIV-SRV-APP01 (less than 5% free space remaining)",
  "Compliance alert: CrowdStrike Falcon sensor disabled or outdated on machine",
  "Keyboard and mouse unresponsive on shopfloor terminal 04",
  "Unable to scan barcode on packing station 02, barcode scanner unresponsive",
  "Shared drive S: inaccessible from assembly line 1",
  "Outlook client fails to sync mailbox with Exchange server",
  "Blue screen (BSOD) on boot for machine after recent cumulative Windows Update",
  "IP conflict detected on local VLAN for machine APTIV-WS-022",
  "Antivirus alert: quarantined suspicious Trojan in temp directory",
  "Web browser cannot load the internal compliance dashboard",
  "Request access to Git repository for new developer in ME department",
  "Need access to SharePoint site for quality assurance documents",
  "WAP in sector C is offline, multiple shopfloor devices disconnected",
  "Backup job failed for database IT_Applications - transaction log is full",
  "Request to deploy software Adobe Acrobat Reader to machine",
  "Barcode printer KSK-04 ribbon broken, needs manual replacement",
  "Monitors not receiving signal on engineering desk 14",
  "User reports unrecognized phishing email received from internal lookalike address",
  "System time out of sync with domain controller, causing Kerberos authentication errors",
  "Request to unlock BitLocker on machine after motherboard replacement",
  "Fisheye camera at assembly line 5 disconnected from NVR",
  "DCIX terminal unable to pull work orders from central database",
  "Label printer layout misaligned on line 2, printing cut-off text",
  "User requests local administrator privileges for testing software",
  "Network switch in Rack 2 showing high packet loss on uplink port",
  "UPS in Server Room reporting battery replacement required alert",
  "Wi-Fi signal weak in Training Centre, causing frequent disconnections",
  "Request to restore accidentally deleted file from daily backup snapshot",
  "Skype for Business/Teams audio device not recognized during call",
  "SAP client GUI keeps crashing when opening inventory lookup transaction"
];

// Priorities and their weights
const priorities = ['P4', 'P3', 'P2', 'P1'];
const getWeightedPriority = (): string => {
  const rand = Math.random();
  if (rand < 0.60) return 'P4';      // 60% Low priority (P4)
  if (rand < 0.85) return 'P3';      // 25% Medium priority (P3)
  if (rand < 0.97) return 'P2';      // 12% High priority (P2)
  return 'P1';                      // 3% Critical priority (P1)
};

async function seedPastIncidents() {
  console.log('Starting custom incident generation for the past 14 months...');
  await initializeDatabase();

  // Get active users
  const users = await dbAll('SELECT id, username FROM users');
  if (users.length === 0) {
    console.error('No users found in database. Please seed users first.');
    await closeDatabase();
    return;
  }
  console.log(`Found ${users.length} users in database.`);

  // Get user ID of ahhpks (creator login)
  const ahhpksUser = users.find(u => u.username === 'ahhpks');
  if (!ahhpksUser) {
    console.error('User "ahhpks" not found in the database. Cannot continue.');
    await closeDatabase();
    return;
  }
  const creatorId = ahhpksUser.id;
  console.log(`Creator "ahhpks" user ID: ${creatorId}`);

  // Get all machines for random assignment
  const machines = await dbAll('SELECT id FROM machines');
  console.log(`Found ${machines.length} machines in database.`);

  const currentDate = new Date('2026-05-20T19:37:27'); // Current local time from metadata
  let totalIncidentsAdded = 0;

  // We iterate through the past 14 completed months (from month offset -14 to -1)
  for (let m = -14; m <= -1; m++) {
    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + m, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth(); // 0-indexed

    // Random count of incidents between 5 and 10 inclusive
    const incidentCount = Math.floor(5 + Math.random() * 6); // Math.random() * 6 -> 0 to 5.99 -> floor is 0 to 5 -> +5 is 5 to 10
    console.log(`-> Generating ${incidentCount} closed incidents for ${targetDate.toLocaleString('default', { month: 'long' })} ${year}...`);

    for (let i = 0; i < incidentCount; i++) {
      const id = uuidv4();
      
      // INC followed by a random 7-digit number
      const incNum = Math.floor(1000000 + Math.random() * 9000000);
      const title = `INC${incNum}`;
      
      const description = descriptions[Math.floor(Math.random() * descriptions.length)];
      const priority = getWeightedPriority();
      const status = 'Closed';

      // 60% chance to assign a random machine
      const hasMachine = Math.random() < 0.6;
      const machineId = hasMachine && machines.length > 0 ? machines[Math.floor(Math.random() * machines.length)].id : null;

      // Assign to a random user
      const assignedToUser = users[Math.floor(Math.random() * users.length)];
      const assignedTo = assignedToUser.id;

      // Random day in the target month
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const randomDay = Math.floor(1 + Math.random() * daysInMonth);
      const randomHour = Math.floor(8 + Math.random() * 10); // 8 AM to 6 PM (business hours)
      const randomMinute = Math.floor(Math.random() * 60);
      const randomSecond = Math.floor(Math.random() * 60);

      const createdAt = new Date(year, month, randomDay, randomHour, randomMinute, randomSecond);

      // Random close delay: P1/P2 resolved faster (1h - 24h), P3/P4 resolved (4h - 5d)
      let closeDelayMs = 0;
      if (priority === 'P1' || priority === 'P2') {
        closeDelayMs = (1 + Math.random() * 23) * 60 * 60 * 1000; // 1 to 24 hours
      } else {
        closeDelayMs = (4 + Math.random() * 116) * 60 * 60 * 1000; // 4 to 120 hours
      }
      const closedAt = new Date(createdAt.getTime() + closeDelayMs);
      const updatedAt = closedAt;

      // Format to ISO strings for safety/accuracy
      const createdAtStr = createdAt.toISOString();
      const closedAtStr = closedAt.toISOString();
      const updatedAtStr = updatedAt.toISOString();

      await dbRun(
        `INSERT INTO incidents (id, title, description, status, priority, machine_id, assigned_to, created_by, closed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, title, description, status, priority, machineId, assignedTo, creatorId, closedAtStr, createdAtStr, updatedAtStr]
      );

      totalIncidentsAdded++;
    }
  }

  console.log(`\n=== SUCCESS ===`);
  console.log(`Successfully added ${totalIncidentsAdded} closed incidents spanning March 2025 to April 2026 (14 months).`);
  console.log(`All created_by fields set to ahhpks.`);
  console.log(`All status fields set to 'Closed'.`);
  console.log(`All assignments distributed randomly among users.`);
  console.log(`===============\n`);

  await closeDatabase();
}

seedPastIncidents().catch((err) => {
  console.error('Error seeding past incidents:', err);
});
