import sqlite3 from 'sqlite3';
import fs from 'fs';

async function check() {
  const dbPath = 'c:/Users/Public/Documents/App/PFE PROJECT/server/data/inventory.db';
  if (!fs.existsSync(dbPath)) {
    console.log('SQLite database not found at:', dbPath);
    return;
  }
  
  console.log('Opening SQLite database...');
  const db = new sqlite3.Database(dbPath);
  
  db.all('SELECT name FROM sqlite_master WHERE type="table"', (err, tables) => {
    if (err) {
      console.error('Error listing tables:', err);
      return;
    }
    console.log('Tables in SQLite:', tables);
    
    // Check machines count
    db.get('SELECT COUNT(*) as cnt FROM machines', (err, row: any) => {
      if (err) {
        console.error('Error reading machines:', err);
        return;
      }
      console.log(`Machines in SQLite: ${row.cnt}`);
    });
    
    // Check machine_metadata count and categories
    db.all('SELECT category, COUNT(*) as cnt FROM machine_metadata GROUP BY category', (err, rows) => {
      if (err) {
        console.error('Error reading metadata:', err);
        return;
      }
      console.log('Categories in SQLite:', rows);
    });
    
    // Check if we can find sample unmanaged machines
    db.all('SELECT m.id, m.hostname, mm.category FROM machines m LEFT JOIN machine_metadata mm ON m.id = mm.machine_id WHERE m.is_managed = 0 LIMIT 5', (err, rows) => {
      if (err) {
        console.error('Error reading unmanaged:', err);
        return;
      }
      console.log('Sample unmanaged in SQLite:', rows);
      db.close();
    });
  });
}

check().catch(console.error);
