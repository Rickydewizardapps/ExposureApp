import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIG_PATH = path.join(os.homedir(), '.apextunnel');
const MIN_TOKEN_LEN = 32;

/**
 * Validate token format. Supports:
 * - JWT (3 base64url segments separated by dots)
 * - API keys (alphanumeric with -_.+/=)
 */
function validateTokenFormat(token) {
  // Check if it's a JWT (3 segments separated by dots)
  const jwtSegments = token.split('.');
  if (jwtSegments.length === 3) {
    // JWT format: header.payload.signature
    const [header, payload, signature] = jwtSegments;
    // Each segment should be base64url encoded (alphanumeric, -, _)
    const base64urlRegex = /^[A-Za-z0-9_-]+$/;
    if (base64urlRegex.test(header) && base64urlRegex.test(payload) && base64urlRegex.test(signature)) {
      return { valid: true, type: 'jwt' };
    }
    return { valid: false, reason: 'Invalid JWT format in segments' };
  }

  // API key format
  if (/^[A-Za-z0-9\-_./+=]+$/.test(token)) {
    return { valid: true, type: 'api_key' };
  }

  return { valid: false, reason: 'Token contains invalid characters' };
}

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeConfig(data) {
  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify(data, null, 2),
    { mode: 0o600 }
  );
}

export function saveToken(token) {
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
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify({ token: trimmed }, null, 2),
      { mode: 0o600 },
    );
  } catch (err) {
    throw new Error(`Failed to save token: ${err.message}`);
  }
}

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

export function saveSubdomain(subdomain) {
  if (!subdomain || typeof subdomain !== 'string') return;
  const config = readConfig();
  config.subdomain = subdomain.trim();
  writeConfig(config);
}

export function getStoredSubdomain() {
  const config = readConfig();
  return config?.subdomain || null;
}
