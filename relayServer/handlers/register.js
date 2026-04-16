import logger from '../logger.js';

// Tracks subdomains mid-registration to prevent race conditions.

const registeringSubdomains = new Set();

export async function handleRegister(socket, msg, clients) {
  const token = msg.token?.trim();

  if (!token) {
    socket.write(JSON.stringify({ type: 'error',
      message: 'Token required.' 
    }) + '\n');
    socket.end(); // drain the write before closing
    return;
  }

  let apiRes, data;

  try {
    apiRes = await fetch(`${process.env.API_URL}/internal/tunnel/connected`, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET,
      },
      body: JSON.stringify({
        token,
        subdomain: msg.subdomain?.trim() || '',
      }),
    });

    data = await apiRes.json();
  } catch (err) {
    logger.error(`Registration fetch failed: ${err.message}`);
    socket.write(JSON.stringify({
      type: 'error', 
      message: 'Could not reach auth service.'
    }) + '\n');
    socket.end();
    return;
  }

  if (!apiRes.ok) {
    const errMsg = data?.message || 'Authentication failed.';
    socket.write(JSON.stringify({
      type: 'error', 
      message: errMsg
    }) + '\n');
    socket.end();
    return;
  }

  const sub = data.subdomain;

  if (!sub || typeof sub !== 'string') {
    logger.error('API returned invalid subdomain');
    socket.write(JSON.stringify({
      type: 'error',
      message: 'Invalid subdomain returned by server.'
    }) + '\n');
    socket.end();
    return;
  }

  // ── Atomic subdomain claim
  // Check both the live clients map AND the in-progress set in one block

  if (clients[sub] || registeringSubdomains.has(sub)) {
    socket.write(JSON.stringify({
      type: 'error',
      message: 'Subdomain already in use.'
    }) + '\n');
    socket.end();
    return;
  }

  registeringSubdomains.add(sub);

  try {
    clients[sub] = socket;
    socket._apexRegistered = true;

    socket.write(
      JSON.stringify({
        type: 'registered',
        subdomain: sub,
        email: data.email,
        isPremium: data.isPremium,
      }) + '\n',
    );

    logger.info({ sub, user: data.email }, 'New client registered');
  } finally {
    // Always release the lock, even if socket.write throws
    registeringSubdomains.delete(sub);
  }
}
