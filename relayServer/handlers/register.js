import logger from '../logger.js';
import { validateSubdomain } from '../src/security.js';
import { encodeJson } from '../src/protocol.js';

const registeringSubdomains = new Map(); // subdomain -> Promise

function safeWrite(socket, data) {
  if (!socket.destroyed) {
    try { socket.write(data); } catch (err) {
      logger.error({ err: err.message }, 'safeWrite failed');
    }
  }
}

export async function handleRegister(socket, msg, connectionManager, rateLimiter) {
  const clientIp = socket.remoteAddress || 'unknown';

  // Rate limit registration attempts
  const limit = rateLimiter.isAllowed(clientIp);
  if (!limit.allowed) {
    safeWrite(socket, encodeJson({
      type: 'error',
      code: 'RATE_LIMITED',
      message: `Too many registration attempts. Retry after ${limit.retryAfter}s.`,
    }));
    socket.end();
    return { success: false };
  }

  // Protocol version check
  if (msg.version !== '2.0') {
    safeWrite(socket, encodeJson({
      type: 'error',
      code: 'VERSION_MISMATCH',
      message: 'Protocol version mismatch. Please update your client to v2.0.',
    }));
    socket.end();
    return { success: false };
  }

  const token = msg.token?.trim();
  if (!token) {
    safeWrite(socket, encodeJson({
      type: 'error',
      code: 'TOKEN_REQUIRED',
      message: 'Authentication token required.'
    }));
    socket.end();
    return { success: false };
  }

  let apiRes, data;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    apiRes = await fetch(`${process.env.API_URL}/internal/tunnel/connected`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET,
      },
      body: JSON.stringify({
        token,
        subdomain: msg.subdomain?.trim() || '',
      }),
    });
    data = await apiRes.json();
  } catch (err) {
    logger.error({ err: err.message }, 'Registration fetch failed');
    safeWrite(socket, encodeJson({
      type: 'error',
      code: 'AUTH_UNAVAILABLE',
      message: 'Could not reach authentication service.'
    }));
    socket.end();
    return { success: false };
  } finally {
    clearTimeout(timeout);
  }

  if (!apiRes.ok) {
    const errMsg = data?.message || 'Authentication failed.';
    safeWrite(socket, encodeJson({
      type: 'error',
      code: 'AUTH_FAILED',
      message: errMsg
    }));
    socket.end();
    return { success: false };
  }

  const sub = data.subdomain;
  if (!sub || typeof sub !== 'string' || !validateSubdomain(sub)) {
    logger.error('API returned invalid subdomain');
    safeWrite(socket, encodeJson({
      type: 'error',
      code: 'INVALID_SUBDOMAIN',
      message: 'Invalid subdomain returned by server.'
    }));
    socket.end();
    return { success: false };
  }

  // Atomic subdomain claim using promise-based lock
  if (registeringSubdomains.has(sub)) {
    safeWrite(socket, encodeJson({
      type: 'error',
      code: 'SUBDOMAIN_IN_USE',
      message: 'Subdomain already in use. Retrying...'
    }));
    socket.end();
    return { success: false };
  }

  // Create a promise that resolves when registration completes
  let resolveLock;
  const lockPromise = new Promise(resolve => { resolveLock = resolve; });
  registeringSubdomains.set(sub, lockPromise);

  try {
    // Check existing connection — get() returns null if socket is dead
    const existing = connectionManager.get(sub);
    if (existing) {
      safeWrite(socket, encodeJson({
        type: 'error',
        code: 'SUBDOMAIN_IN_USE',
        message: 'Subdomain already in use.'
      }));
      socket.end();
      return { success: false };
    }

    connectionManager.register(sub, socket);
    safeWrite(socket, encodeJson({
      type: 'registered',
      subdomain: sub,
      email: data.email,
      isPremium: data.isPremium,
    }));
    return { success: true, subdomain: sub };
  } finally {
    resolveLock();
    registeringSubdomains.delete(sub);
  }
}
