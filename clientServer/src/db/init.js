import fs from 'fs';
import { DB_PATH, openDb, getDb } from './index.js';

const CLEANUP_HOURS = 1;
const CLEANUP_SECONDS = CLEANUP_HOURS * 3600;

export async function initDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('[DB] No existing database found. Creating...');
    await openDb();
    return { created: true, cleaned: 0 };
  }

  try {
    await openDb();
    const db = getDb();

    const hasConfig = db.schema.hasTable('config');
    const hasRequests = db.schema.hasTable('requests');
    const hasRateLimits = db.schema.hasTable('rate_limits');

    const missingTables = [];
    if (!hasConfig) missingTables.push('config');
    if (!hasRequests) missingTables.push('requests');
    if (!hasRateLimits) missingTables.push('rate_limits');

    if (missingTables.length > 0) {
      console.warn(`[DB] Missing tables: ${missingTables.join(', ')}. Recreating...`);
      if (missingTables.includes('config')) {
        db.exec(`CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
      }
      if (missingTables.includes('requests')) {
        db.exec(`CREATE TABLE requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          time TEXT NOT NULL, method TEXT NOT NULL, url TEXT NOT NULL,
          status INTEGER, duration INTEGER,
          req_headers TEXT, res_headers TEXT,
          req_body_path TEXT, res_body_path TEXT,
          req_body_size INTEGER DEFAULT 0, res_body_size INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )`);
        db.exec(`CREATE INDEX idx_requests_created ON requests(created_at)`);
      }
      if (missingTables.includes('rate_limits')) {
        db.exec(`CREATE TABLE rate_limits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          identifier TEXT NOT NULL UNIQUE,
          count INTEGER DEFAULT 1,
          next_allowed INTEGER NOT NULL,
          last_attempt INTEGER NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )`);
      }
    }

    const cutoff = Math.floor(Date.now() / 1000) - CLEANUP_SECONDS;
    const oldResult = db._db.exec(`SELECT req_body_path, res_body_path FROM requests WHERE created_at < ${cutoff}`);
    
    let filesDeleted = 0;
    if (oldResult.length > 0) {
      for (const row of oldResult[0].values) {
        const [reqPath, resPath] = row;
        if (reqPath && fs.existsSync(reqPath)) { try { fs.unlinkSync(reqPath); filesDeleted++; } catch {} }
        if (resPath && fs.existsSync(resPath)) { try { fs.unlinkSync(resPath); filesDeleted++; } catch {} }
      }
    }

    db._db.exec(`DELETE FROM requests WHERE created_at < ${cutoff}`);
    const rowsDeleted = db._db.exec(`SELECT changes()`)[0]?.values?.[0]?.[0] || 0;

    if (rowsDeleted > 0 || filesDeleted > 0) {
      console.log(`[DB] Cleanup: ${rowsDeleted} rows, ${filesDeleted} files (>${CLEANUP_HOURS}hr)`);
    }

    return { created: false, cleaned: rowsDeleted, filesDeleted, missingTables: missingTables.length };

  } catch (err) {
    console.error(`[DB] Init failed: ${err.message}`);
    return { created: false, cleaned: 0, error: err.message };
  }
}