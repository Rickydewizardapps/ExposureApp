import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIG_PATH = path.join(os.homedir(), '.apextunnel');
const MIN_TOKEN_LEN = 32; // Reduced from 64 — JWTs and API keys vary in length

/**
 * Save an auth token to disk.
 * Throws a descriptive Error on any validation or write failure.
 */
export function saveToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid token.');
  }

  const trimmed = token.trim();

  if (trimmed.length < MIN_TOKEN_LEN) {
    throw new Error(`Token too short. Must be at least ${MIN_TOKEN_LEN} characters.`);
  }

  // Allow base64, base64url, JWT, and common API key characters
  // FIX: original regex /^[A-Za-z0-9\-_.]+$/ rejected valid JWTs with +/= padding
  if (!/^[A-Za-z0-9\-_./+=]+$/.test(trimmed)) {
    throw new Error('Token contains invalid characters.');
  }

  try {
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify({ token: trimmed }, null, 2),
      { mode: 0o600 }, // owner read/write only
    );
  } catch (err) {
    throw new Error(`Failed to save token: ${err.message}`);
  }
}

/**
 * Read the stored auth token from disk.
 * Returns the token string, or null if missing / unreadable / invalid.
 */
export function getStoredToken() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const data = JSON.parse(raw);
    const tok = data?.token;
    return typeof tok === 'string' && tok.trim().length >= MIN_TOKEN_LEN
      ? tok.trim()
      : null;
  } catch {
    return null;
  }
}
