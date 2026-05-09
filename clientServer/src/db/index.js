import fs from 'fs';
import os from 'os';
import path from 'path';
import initSqlJs from 'sql.js';
import { encrypt, decrypt, isEncrypted } from './crypto.js';

export const DB_PATH = path.join(os.homedir(), '.apextunnel.db');

let dbInstance = null;
let SQL = null;

export async function openDb() {
  await closeDb();

  if (!SQL) {
    SQL = await initSqlJs();
  }

  let db;
  if (fs.existsSync(DB_PATH)) {
    const data = fs.readFileSync(DB_PATH);
    db = new SQL.Database(data);
  } else {
    db = new SQL.Database();
    createSchema(db);
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data), { mode: 0o600 });
  }

  dbInstance = wrapSqlJs(db);
  return dbInstance;
}

export async function openPlainDb() {
  return openDb();
}

function createSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      status INTEGER,
      duration INTEGER,
      req_headers TEXT,
      res_headers TEXT,
      req_body_path TEXT,
      res_body_path TEXT,
      req_body_size INTEGER DEFAULT 0,
      res_body_size INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);
    CREATE TABLE IF NOT EXISTS rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL UNIQUE,
      count INTEGER DEFAULT 1,
      next_allowed INTEGER NOT NULL,
      last_attempt INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);
}

function wrapSqlJs(db) {
  return {
    _db: db,
    exec(sql) { return this._db.run(sql); },
    schema: {
      hasTable: (tableName) => {
        const result = db.exec(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
        );
        return result.length > 0 && result[0].values.length > 0;
      },
    },
    select(...columns) { return queryBuilder(this, 'select', columns); },
    insert(data)       { return queryBuilder(this, 'insert', null, data); },
    where(conditions)  { return queryBuilder(this, 'where', null, null, conditions); },
    orderBy(column, direction) {
      return queryBuilder(this, 'orderBy', null, null, null, { column, direction });
    },
    limit(n)  { return queryBuilder(this, 'limit', null, null, null, null, n); },
    del()     { return queryBuilder(this, 'del'); },
    raw(sql)  { return { toSQL: () => sql }; },
  };
}

function queryBuilder(wrapper, type, columns, data, conditions, order, limitVal) {
  const builder = {
    _wrapper:     wrapper,
    _type:        type,
    _columns:     columns,
    _data:        data,
    _conditions:  conditions,
    _order:       order,
    _limit:       limitVal,
    _table:       null,
    _whereClause: null,

    from(table)          { this._table = table; return this; },
    into(table)          { this._table = table; return this; },
    where(conditions)    { this._whereClause = conditions; return this; },
    orderBy(column, dir) { this._order = { column, direction: dir }; return this; },
    limit(n)             { this._limit = n; return this; },
    onConflict(_key)     { return { merge: () => this }; },

    run() {
      this._wrapper._db.run(this._buildSql());
      _schedulePersist();
      return { changes: 1 };
    },

    first() {
      const result = this._wrapper._db.exec(this._buildSql());
      if (!result.length || !result[0].values.length) return null;
      const obj = {};
      result[0].columns.forEach((c, i) => { obj[c] = result[0].values[0][i]; });
      return obj;
    },

    all() {
      const result = this._wrapper._db.exec(this._buildSql());
      if (!result.length) return [];
      return result[0].values.map(v => {
        const obj = {};
        result[0].columns.forEach((c, i) => { obj[c] = v[i]; });
        return obj;
      });
    },

    then(resolve, reject) {
      try { resolve(this.all()); } catch (e) { reject(e); }
    },

    _buildSql() {
      let sql = '';
      if (this._type === 'select') {
        sql = `SELECT ${this._columns?.length ? this._columns.join(', ') : '*'} FROM ${this._table}`;
      } else if (this._type === 'insert') {
        const keys = Object.keys(this._data);
        const vals = keys.map(k => {
          const v = this._data[k];
          if (v === null || v === undefined) return 'NULL';
          if (typeof v === 'number') return v;
          return `'${String(v).replace(/'/g, "''")}'`;
        });
        sql = `INSERT INTO ${this._table} (${keys.join(', ')}) VALUES (${vals.join(', ')})`;
      } else if (this._type === 'del') {
        sql = `DELETE FROM ${this._table}`;
      }
      if (this._whereClause) {
        const conds = Object.entries(this._whereClause).map(([k, v]) => {
          if (v === null || v === undefined) return `${k} IS NULL`;
          if (typeof v === 'number') return `${k} = ${v}`;
          return `${k} = '${String(v).replace(/'/g, "''")}'`;
        });
        sql += ` WHERE ${conds.join(' AND ')}`;
      }
      if (this._order) {
        sql += ` ORDER BY ${this._order.column} ${this._order.direction === 'desc' ? 'DESC' : 'ASC'}`;
      }
      if (this._limit) sql += ` LIMIT ${this._limit}`;
      return sql;
    },
  };
  return builder;
}

let _persistTimer = null;
function _schedulePersist() {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    if (!dbInstance) return;
    try {
      const data = Buffer.from(dbInstance._db.export());
      fs.writeFileSync(DB_PATH, data, { mode: 0o600 });
    } catch (err) {
      console.error('[DB] Auto-persist failed:', err.message);
    }
  }, 500);
}

export function getDb() {
  if (!dbInstance) throw new Error('Database not initialized. Call openDb() first.');
  const wrapper = dbInstance;
  const callable = (table) => {
    const b = queryBuilder(wrapper, 'select', null);
    b._table = table;
    return b;
  };
  return new Proxy(callable, {
    get(_target, prop) { return wrapper[prop]; },
  });
}

export async function persistDb() {
  if (!dbInstance) return;
  const data = Buffer.from(dbInstance._db.export());
  fs.writeFileSync(DB_PATH, data, { mode: 0o600 });
}

export async function closeDb() {
  if (dbInstance) {
    await persistDb();
    dbInstance._db.close();
    dbInstance = null;
  }
}

// ── Encrypted Config API ──

/**
 * Read a config value. Automatically decrypts if encrypted.
 * Returns null if key not found.
 * Throws DECRYPTION_FAILED if hardware changed (caller must handle).
 */
export async function getEncryptedConfig(key) {
  const db = getDb();
  const result = db._db.exec(`SELECT value FROM config WHERE key = '${sqlEscape(key)}'`);
  if (!result.length || !result[0].values.length) return null;
  const raw = result[0].values[0][0];

  if (!isEncrypted(raw)) {
    // Legacy plaintext — return as-is, but caller should re-encrypt
    return raw;
  }

  return decrypt(raw);
}

/**
 * Write a config value, always encrypting it.
 */
export async function setEncryptedConfig(key, value) {
  const db = getDb();
  const encrypted = encrypt(value);
  const existing = db._db.exec(`SELECT 1 FROM config WHERE key = '${sqlEscape(key)}'`);
  if (existing.length && existing[0].values.length) {
    db._db.exec(`UPDATE config SET value = '${sqlEscape(encrypted)}' WHERE key = '${sqlEscape(key)}'`);
  } else {
    db._db.exec(`INSERT INTO config (key, value) VALUES ('${sqlEscape(key)}', '${sqlEscape(encrypted)}')`);
  }
}

/**
 * Delete a config key.
 */
export async function deleteEncryptedConfig(key) {
  const db = getDb();
  db._db.exec(`DELETE FROM config WHERE key = '${sqlEscape(key)}'`);
}

/**
 * Check if a config key exists (encrypted or not).
 */
export async function hasConfigKey(key) {
  const db = getDb();
  const result = db._db.exec(`SELECT 1 FROM config WHERE key = '${sqlEscape(key)}'`);
  return result.length > 0 && result[0].values.length > 0;
}

/**
 * Re-encrypt all plaintext config values in the database.
 * Call this once after upgrading to encrypted storage.
 * Returns count of migrated keys.
 */
export async function migratePlaintextConfig() {
  const db = getDb();
  const result = db._db.exec(`SELECT key, value FROM config`);
  if (!result.length || !result[0].values.length) return 0;

  let migrated = 0;
  for (const [key, value] of result[0].values) {
    if (!isEncrypted(value)) {
      await setEncryptedConfig(key, value);
      migrated++;
    }
  }
  if (migrated > 0) {
    await persistDb();
    console.log(`[CRYPTO] Migrated ${migrated} plaintext config value(s) to encrypted storage.`);
  }
  return migrated;
}

function sqlEscape(str) {
  return String(str).replace(/'/g, "''");
}

process.on('exit', () => {
  if (dbInstance) {
    try {
      const data = Buffer.from(dbInstance._db.export());
      fs.writeFileSync(DB_PATH, data, { mode: 0o600 });
    } catch {}
  }
});
