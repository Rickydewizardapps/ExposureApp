import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIG_PATH = path.join(os.homedir(), '.apextunnel');

const rawArgs = process.argv.slice(2);
if (rawArgs[0] === 'authtoken') {
  const token = rawArgs[1];
  if (!token) { console.error('Usage: apex authtoken <token>'); process.exit(1); }
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ token }, null, 2));
    console.log(`\x1b[32m✔\x1b[0m Authtoken saved to ${CONFIG_PATH}`);
  } catch (err) { console.error('Failed to save token:', err.message); process.exit(1); }
  process.exit(0);
}

export function getStoredToken() {
  try {
    const token = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).token;
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  } catch { return null; }
}