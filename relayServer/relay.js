import net from 'net';
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';
import 'dotenv/config';

import { handleRegister } from './handlers/register.js';

// State

/** @type {Record<string, import('net').Socket>} subdomain → tunnel socket */
const clients = {};

/** @type {Record<string, { res: import('http').ServerResponse, timer: NodeJS.Timeout }>} */
const pendingRequests = {};

const TCP_PORT   = Number(process.env.TCP_PORT)   || 9000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 2000;
const REQUEST_TIMEOUT_MS = 30_000;

// Helpers

/**
 * Notify the backend API that a subdomain disconnected.
 * Fire-and-forget; errors are only logged.
 */
function notifyDisconnected(subdomain) {
  fetch(`${process.env.API_URL}/internal/tunnel/disconnected`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_SECRET,
    },
    body: JSON.stringify({ subdomain }),
  }).catch((err) => console.error('[relay] API notify failed:', err.message));
}

/**
 * Clean up a tunnel socket and cancel any requests that were waiting on it.
 * Safe to call multiple times for the same socket (idempotent via `registered` flag).
 */
function cleanupSocket(socket) {
  // Avoid double-cleanup
  if (socket._apexCleaned) return;
  socket._apexCleaned = true;

  const subdomain = Object.keys(clients).find((k) => clients[k] === socket);
  if (subdomain) {
    delete clients[subdomain];
    notifyDisconnected(subdomain);
    console.log(`[relay] Tunnel disconnected: ${subdomain}`);
  }

  // Abort any in-flight HTTP requests that were waiting on this tunnel
  for (const [id, pending] of Object.entries(pendingRequests)) {
    if (pending.tunnelSocket === socket) {
      clearTimeout(pending.timer);
      try {
        pending.res.writeHead(502);
        pending.res.end('Tunnel disconnected');
      } catch (_) { /* response may already be finished */ }
      delete pendingRequests[id];
    }
  }
}

// TCP server  (tunnel clients connect here)

const tcpServer = net.createServer((socket) => {
  console.log('[relay] New TCP connection from', socket.remoteAddress);

  let buffer = '';

  // Give the client 10 s to send a register message, then drop it
  const registrationTimeout = setTimeout(() => {
    if (!socket._apexRegistered) {
      console.warn('[relay] Client did not register in time, dropping');
      socket.destroy();
    }
  }, 20_000);

  socket.on('data', (chunk) => {
    buffer += chunk.toString();

    // Guard against runaway buffers (e.g. a malicious client sending junk)
    if (buffer.length > 100 * 1024 * 1024) { // 100 MB
      console.error('[relay] Buffer overflow, dropping socket');
      socket.destroy();
      return;
    }

    const messages = buffer.split('\n');
    buffer = messages.pop(); // keep incomplete tail

    for (const raw of messages) {
      if (!raw.trim()) continue;

      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (err) {
        console.error('[relay] Malformed JSON from client:', err.message);
        continue;
      }

      if (msg.type === 'register') {
        clearTimeout(registrationTimeout);
        handleRegister(socket, msg, clients);
        continue;
      }
      
      const pending = pendingRequests[msg.id];
      if (!pending) continue; // already timed out or cancelled

      clearTimeout(pending.timer);
      delete pendingRequests[msg.id];

      try {
        // Body was base64-encoded by the client to preserve binary fidelity
        const bodyBuffer = msg.body
          ? Buffer.from(msg.body, 'base64')
          : Buffer.alloc(0);

        // Remove transfer-encoding so Node can send the body as-is
        const headers = { ...msg.headers };
        delete headers['transfer-encoding'];

        pending.res.writeHead(msg.statusCode, headers);
        pending.res.end(bodyBuffer);
      } catch (err) {
        console.error('[relay] Error writing HTTP response:', err.message);
      }
    }
  });

  socket.on('end',   () => cleanupSocket(socket));
  socket.on('error', (err) => {
    console.error('[relay] Socket error:', err.message);
    cleanupSocket(socket);
  });
});

tcpServer.listen(TCP_PORT, () => {
  console.log(`[relay] TCP server listening on port ${TCP_PORT}`);
});


// HTTPS server  (public traffic arrives here)
const sslOptions = {
  key:  fs.readFileSync(process.env.TLS_KEY_PATH  || './key.pem'),
  cert: fs.readFileSync(process.env.TLS_CERT_PATH || './cert.pem'),
};

const httpsServer = https.createServer(sslOptions, (req, res) => {
  const host      = req.headers.host || '';
  const subdomain = host.split('.')[0];
  const tunnelSocket = clients[subdomain];

  if (!tunnelSocket) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('No tunnel found for this subdomain');
    return;
  }

  // Collect the request body as raw binary
  const bodyChunks = [];
  req.on('data', (chunk) => bodyChunks.push(chunk));

  req.on('end', () => {
    const requestId = crypto.randomUUID();

    // Encode the body as base64 to survive JSON serialisation intact
    const bodyBase64 = Buffer.concat(bodyChunks).toString('base64');

    console.log(`[relay] ${req.method} ${req.url} → ${subdomain} (${requestId})`);

    // Register the pending request BEFORE writing to the socket
    const timer = setTimeout(() => {
      const p = pendingRequests[requestId];
      if (!p) return;
      delete pendingRequests[requestId];
      try {
        p.res.writeHead(504, { 'Content-Type': 'text/plain' });
        p.res.end('Tunnel timeout');
      } catch (_) {}
      console.warn(`[relay] Request ${requestId} timed out`);
    }, REQUEST_TIMEOUT_MS);

    pendingRequests[requestId] = { res, timer, tunnelSocket };

    // If the client closes the connection early, cancel the pending slot
    res.on('close', () => {
      const p = pendingRequests[requestId];
      if (p) {
        clearTimeout(p.timer);
        delete pendingRequests[requestId];
      }
    });

    try {
      tunnelSocket.write(
        JSON.stringify({
          id:      requestId,
          method:  req.method,
          url:     req.url,
          headers: req.headers,
          body:    bodyBase64,
        }) + '\n',
      );
    } catch (err) {
      console.error('[relay] Failed to write to tunnel socket:', err.message);
      clearTimeout(timer);
      delete pendingRequests[requestId];
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Tunnel write error');
    }
  });

  req.on('error', (err) => {
    console.error('[relay] Request error:', err.message);
  });
});

httpsServer.listen(HTTPS_PORT, () => {
  console.log(`[relay] HTTPS server listening on port ${HTTPS_PORT}`);
});


// Graceful shutdown

function shutdown(signal) {
  console.log(`[relay] Received ${signal}, shutting down gracefully…`);

  // Stop accepting new connections
  tcpServer.close();
  httpsServer.close();

  // Drain pending HTTP requests with a 503
  for (const [id, pending] of Object.entries(pendingRequests)) {
    clearTimeout(pending.timer);
    try {
      pending.res.writeHead(503, { 'Content-Type': 'text/plain' });
      pending.res.end('Server shutting down');
    } catch (_) {}
    delete pendingRequests[id];
  }

  // Notify API of all connected tunnels going away
  for (const subdomain of Object.keys(clients)) {
    notifyDisconnected(subdomain);
  }

  // Give in-flight notifies a moment, then exit
  setTimeout(() => process.exit(0), 2_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
