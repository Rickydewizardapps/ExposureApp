import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIG_PATH = path.join(os.homedir(), '.apextunnel');

const [,, cmd, tokenArg] = process.argv;

if (cmd === 'authtoken') {
  if (!tokenArg || !tokenArg.trim()) {
    console.error('Usage: apex authtoken <token>');
    process.exit(1);
  }

  const token = tokenArg.trim();

  // Basic sanity check — reject wrong values
  if (token.length < 8) {
    console.error('Token looks too short. Please check and try again.');
    process.exit(1);
  }

  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ token }, null, 2), {
      mode: 0o600, // owner read/write only 
    });
    console.log(`\x1b[32m✔\x1b[0m Authtoken saved to ${CONFIG_PATH}`);
  } catch (err) {
    console.error('Failed to save token:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

// Runtime helper

/**
 * Read the stored auth token from disk.
 * Returns the token string, or null if missing / unreadable / invalid.
 */
export function getStoredToken() {
  try {
    const raw  = fs.readFileSync(CONFIG_PATH, 'utf8');
    const data = JSON.parse(raw);
    const tok  = data?.token;
    return typeof tok === 'string' && tok.trim().length >= 8
      ? tok.trim()
      : null;
  } catch {
    return null;
  }
}
