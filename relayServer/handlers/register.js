import logger from '../logger.js';
const registeringSubdomains = new Set();

export async function handleRegister(socket, msg, clients) {
  if (!msg.token?.trim()) {
    socket.write(JSON.stringify({ type: 'error', message: 'Token required' }) + '\n');
    return socket.destroy(); // Forcefully close the connection
  }

  try {
    const apiRes = await fetch(`${process.env.API_URL}/internal/tunnel/connected`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET
      },
      body: JSON.stringify({
        token: msg.token.trim(),
        subdomain: msg.subdomain || ''
      }),
    });

    const data = await apiRes.json();
    
    // If API is not OK, notify and let the catch block handle destruction
    if (!apiRes.ok) {
      socket.write(JSON.stringify({ type: 'error', message: data.message || 'API Rejected' }) + '\n');
      throw new Error(data.message || 'API Rejected');
    }

    const sub = data.subdomain;
    if (clients[sub] || registeringSubdomains.has(sub)) {
      socket.write(JSON.stringify({ type: 'error', message: 'Subdomain in use' }) + '\n');
      return socket.destroy();
    }

    registeringSubdomains.add(sub);
    try {
      clients[sub] = socket;
      socket._apexRegistered = true;
      
      // end full account details
      socket.write(JSON.stringify({ 
        type: 'registered', 
        subdomain: sub,
        email: data.email,
        isPremium: data.isPremium 
      }) + '\n');
      
      logger.info({ sub, user: data.email }, 'New client registered');
    } finally {
      registeringSubdomains.delete(sub);
    }
  } catch (err) {
    logger.error(`Registration failed: ${err.message}`);
    // use destroy() to ensure the client doesn't hang on an invalid state
    socket.destroy();
  }
}
