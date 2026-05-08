import { randomBytes, timingSafeEqual, scryptSync } from 'crypto';
import { openDb, openPlainDb, getDb, persistDb, closeDb } from './db/index.js';

const MIN_TOKEN_LEN = 64;
const MIN_PASS_LEN = 8;
const PEPPER = 'apextunnel-v1';
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

function hashPassword(password, salt) {
  return scryptSync(password + PEPPER, salt, 64, SCRYPT_PARAMS).toString('hex');
}

function generateSalt() {
  return randomBytes(32).toString('hex');
}

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function validateTokenFormat(token) {
  if (/^[A-Za-z0-9\-_./+=]+$/.test(token)) {
    return { valid: true, type: 'api_key' };
  }
  return { valid: false, reason: 'Token contains invalid characters' };
}

function sqlEscape(str) {
  return String(str).replace(/'/g, "''");
}

async function getConfigValue(key) {
  const db = getDb();
  const result = db._db.exec(`SELECT value FROM config WHERE key = '${sqlEscape(key)}'`);
  if (!result.length || !result[0].values.length) return null;
  return result[0].values[0][0];
}

async function setConfigValue(key, value) {
  const db = getDb();
  const existing = db._db.exec(`SELECT 1 FROM config WHERE key = '${sqlEscape(key)}'`);
  if (existing.length && existing[0].values.length) {
    db._db.exec(`UPDATE config SET value = '${sqlEscape(value)}' WHERE key = '${sqlEscape(key)}'`);
  } else {
    db._db.exec(`INSERT INTO config (key, value) VALUES ('${sqlEscape(key)}', '${sqlEscape(value)}')`);
  }
}

async function deleteConfigValue(key) {
  const db = getDb();
  db._db.exec(`DELETE FROM config WHERE key = '${sqlEscape(key)}'`);
}

const loginAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 3600000;

function cleanupOldRateLimits() {
  const now = Date.now();
  for (const [id, record] of loginAttempts.entries()) {
    if (now - record.lastAttempt > RATE_LIMIT_WINDOW_MS) {
      loginAttempts.delete(id);
    }
  }
}

function getRateLimit(identifier) {
  const now = Date.now();
  const record = loginAttempts.get(identifier);
  if (!record) return { allowed: true, waitSeconds: 0 };
  if (now < record.nextAllowed) {
    return { allowed: false, waitSeconds: Math.ceil((record.nextAllowed - now) / 1000) };
  }
  return { allowed: true, waitSeconds: 0 };
}

function recordFailure(identifier) {
  const now = Date.now();
  const record = loginAttempts.get(identifier) || { count: 0, nextAllowed: now };
  record.count += 1;
  const delayMs = Math.min(60000 * Math.pow(2, record.count - 1), 3840000);
  record.nextAllowed = now + delayMs;
  record.lastAttempt = now;
  loginAttempts.set(identifier, record);
  return Math.ceil(delayMs / 1000);
}

function clearRateLimit(identifier) {
  loginAttempts.delete(identifier);
}

export async function saveToken(token, force = false) {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid token.');
  }
  const trimmed = token.trim();
  if (trimmed.length < MIN_TOKEN_LEN) {
    throw new Error(`Token too short. Must be at least ${MIN_TOKEN_LEN} characters.`);
  }
  const validation = validateTokenFormat(trimmed);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  try {
    getDb();
  } catch {
    await openDb();
  }

  const existing = await getStoredToken();
  if (existing && !force) {
    throw new Error('Token already saved. Run: apex new token <token> to update.');
  }

  await setConfigValue('token', trimmed);
  await persistDb();
}

export async function updateToken(newToken) {
  if (!newToken || typeof newToken !== 'string') {
    throw new Error('Invalid token.');
  }
  const trimmed = newToken.trim();
  if (trimmed.length < MIN_TOKEN_LEN) {
    throw new Error(`Token too short. Must be at least ${MIN_TOKEN_LEN} characters.`);
  }
  const validation = validateTokenFormat(trimmed);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const existing = await getStoredToken();
  if (!existing) {
    throw new Error('No token saved. Run: apex authtoken <token> to set one.');
  }

  await setConfigValue('token', trimmed);
  await persistDb();
}

export async function getStoredToken() {
  try {
    return await getConfigValue('token');
  } catch (err) {
    if (err.message.includes('not initialized')) return null;
    throw err;
  }
}

export async function setPassword(password, force = false) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a string.');
  }
  if (password.length < MIN_PASS_LEN) {
    throw new Error(`Password too short. Must be at least ${MIN_PASS_LEN} characters.`);
  }

  try {
    getDb();
  } catch {
    await openDb();
  }

  const existingHash = await getConfigValue('passwordHash');
  if (existingHash && !force) {
    throw new Error('Password already set. Run: apex new pass <password> to update.');
  }

  const salt = generateSalt();
  const hash = hashPassword(password, salt);

  await setConfigValue('passwordHash', hash);
  await setConfigValue('passwordSalt', salt);
  await persistDb();
}

export async function updatePassword(newPassword) {
  if (!newPassword || typeof newPassword !== 'string') {
    throw new Error('Password must be a string.');
  }
  if (newPassword.length < MIN_PASS_LEN) {
    throw new Error(`Password too short. Must be at least ${MIN_PASS_LEN} characters.`);
  }

  try {
    getDb();
  } catch {
    await openDb();
  }

  const existingHash = await getConfigValue('passwordHash');
  const salt = await getConfigValue('passwordSalt');
  if (!existingHash || !salt) {
    throw new Error('No password set. Run: apex pass <password> to set one.');
  }

  const newSalt = generateSalt();
  const newHash = hashPassword(newPassword, newSalt);

  await setConfigValue('passwordHash', newHash);
  await setConfigValue('passwordSalt', newSalt);
  await persistDb();
}

export async function verifyPassword(password, identifier = 'default') {
  if (!password || typeof password !== 'string') {
    return { valid: false, rateLimited: false, waitSeconds: 0 };
  }

  cleanupOldRateLimits();

  const limit = getRateLimit(identifier);
  if (!limit.allowed) {
    return { valid: false, rateLimited: true, waitSeconds: limit.waitSeconds };
  }

  const storedHash = await getConfigValue('passwordHash');
  const salt = await getConfigValue('passwordSalt');
  if (!storedHash || !salt) {
    return { valid: false, rateLimited: false, waitSeconds: 0 };
  }

  const computedHash = hashPassword(password, salt);
  if (safeCompare(computedHash, storedHash)) {
    clearRateLimit(identifier);
    return { valid: true, rateLimited: false, waitSeconds: 0 };
  }

  const waitSeconds = recordFailure(identifier);
  return { valid: false, rateLimited: true, waitSeconds };
}

export async function hasPassword() {
  try {
    const hash = await getConfigValue('passwordHash');
    const salt = await getConfigValue('passwordSalt');
    return !!(hash && salt);
  } catch {
    return false;
  }
}

export async function clearPassword() {
  await deleteConfigValue('passwordHash');
  await deleteConfigValue('passwordSalt');
  await persistDb();
}

export async function saveSubdomain(subdomain) {
  if (typeof subdomain !== 'string') return;
  const trimmed = subdomain.trim();
  if (trimmed) {
    await setConfigValue('subdomain', trimmed);
  } else {
    await deleteConfigValue('subdomain');
  }
  await persistDb();
}

export async function getStoredSubdomain() {
  try {
    return await getConfigValue('subdomain');
  } catch {
    return null;
  }
}