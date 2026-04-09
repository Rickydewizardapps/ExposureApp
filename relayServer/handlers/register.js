import 'dotenv/config';

const registeringSubdomains = new Set();

export async function handleRegister(socket, msg, clients) {
  // 1. Basic validation
  if (!msg.token || typeof msg.token !== 'string' || !msg.token.trim()) {
    sendError(socket, `\n No token provided. Visit ${process.env.FRONTEND_URL}/register \n`);
    return;
  }

  // 2. Verify with backend API
  let data;
  let apiResponse;
  try {
    apiResponse = await fetch(`${process.env.API_URL}/internal/tunnel/connected`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET,
      },
      body: JSON.stringify({
        token:     msg.token.trim(),
        subdomain: msg.subdomain || '',
      }),
    });
    data = await apiResponse.json();
  } catch (err) {
    console.error('[register] API call failed:', err.message);
    sendError(socket, 'Authentication service unavailable');
    return;
  }

  if (!apiResponse.ok) {
    sendError(socket, data.message || 'Registration rejected');
    return;
  }

  const subdomain = data.subdomain;

  if (!subdomain || typeof subdomain !== 'string') {
    console.error('[register] API returned invalid subdomain:', subdomain);
    sendError(socket, 'Internal error: invalid subdomain from API');
    return;
  }

  // 3. Claim the subdomain (race-condition safe)
  // Check both the live clients map AND the in-flight lock
  if (clients[subdomain] || registeringSubdomains.has(subdomain)) {
    sendError(socket, `Subdomain "${subdomain}" is already in use`);
    return;
  }

  registeringSubdomains.add(subdomain);

  try {
    if (clients[subdomain]) {
      sendError(socket, `\nSubdomain "${subdomain}" is already in use\n`);
      return;
    }

    clients[subdomain] = socket;
    socket._apexRegistered = true;

    socket.write(
      JSON.stringify({
        type:      'registered',
        subdomain,
        email:     data.email,
        isPremium: data.isPremium,
      }) + '\n',
    );

    console.log(`[register] Tunnel registered: ${subdomain} (${data.email})`);
  } finally {
    registeringSubdomains.delete(subdomain);
  }
}

// Internal helper

function sendError(socket, message) {
  try {
    socket.write(JSON.stringify({ type: 'error', message }) + '\n');
  } catch (_) {}
  socket.end();
}
