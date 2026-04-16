import net from 'net';
import http from 'http';
import crypto from 'crypto';
import 'dotenv/config';
import logger from './logger.js';
import { handleRegister } from './handlers/register.js';
import { errorPage } from './pages/errorPages.js';

// contants
const clients = {};
const pendingRequests = {};
const TCP_PORT = Number(process.env.TCP_PORT)  || 9000;
const HTTP_PORT = Number(process.env.HTTP_PORT) || 2000;
const REQUEST_TIMEOUT_MS = 30000
const BUFFER_LIMIT = 32 * 1024 * 1024; // 32 MB per socket

// ─── Hop-by-hop headers that must never be forwarded
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

// ─── Helper: send a branded HTML error response
const sendError = (res, status, title, message) => {
  if (res.writableEnded) return;
  try {
    res.writeHead(status, { 'Content-Type': 'text/html' });
    res.end(errorPage(status, title, message));
  } catch (_) {}
};

// ─── Cleanup a disconnected TCP socket
function cleanupSocket(socket) {
  if (socket._apexCleaned) return;
  socket._apexCleaned = true;

  const subdomain = Object.keys(clients).find((k) => clients[k] === socket);
  if (subdomain) {
    delete clients[subdomain];
    logger.info({ subdomain }, 'Tunnel disconnected');
  }

  // Fail any in-flight requests that were waiting on this socket
  for (const [id, pending] of Object.entries(pendingRequests)) {
    if (pending.tunnelSocket === socket) {
      clearTimeout(pending.timer);
      sendError(pending.res, 502, 'Tunnel Disconnected',
        'The connection to the Apex Client was lost mid-request.');
      delete pendingRequests[id];
    }
  }
}

// ─── TCP Server (client connections)
const tcpServer = net.createServer((socket) => {
  socket.setNoDelay(true);
  let buffer = '';

  // If a client connects but never registers, drop it after 10s
  const regTimeout = setTimeout(() => {
    if (!socket._apexRegistered) {
      logger.warn({ remote: socket.remoteAddress }, 'Client timed out before registering');
      socket.destroy();
    }
  }, 10000);

  socket.on('data', (chunk) => {
    buffer += chunk.toString();

    // Guard against a runaway client flooding the buffer
    if (buffer.length > BUFFER_LIMIT) {
      logger.warn({ remote: socket.remoteAddress }, 'Buffer limit exceeded, dropping socket');
      socket.destroy();
      return;
    }

    const messages = buffer.split('\n');
    buffer = messages.pop(); // keep incomplete trailing data

    for (const raw of messages) {
      if (!raw.trim()) continue;

      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }

      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) continue;

      // ── Registration
      if (msg.type === 'register') {
        clearTimeout(regTimeout);
        handleRegister(socket, msg, clients);
        continue;
      }

      // ── Client response to a forwarded request
      if (msg.type === 'response') {
        const pending = pendingRequests[msg.id];
        if (!pending) continue;

        clearTimeout(pending.timer);
        delete pendingRequests[msg.id];

        if (pending.res.writableEnded) continue;

        try {
          const bodyBuffer = msg.body ? Buffer.from(msg.body, 'base64') : Buffer.alloc(0);

          // Strip hop-by-hop headers before forwarding back to the browser
          const headers = {};
          for (const [key, val] of Object.entries(msg.headers ?? {})) {
            if (!HOP_BY_HOP.has(key.toLowerCase())) {
              headers[key] = val;
            }
          }
          headers['content-length'] = String(bodyBuffer.length);

          pending.res.writeHead(msg.statusCode ?? 502, headers);
          pending.res.end(bodyBuffer);
        } catch (err) {
          logger.error(`Error writing response: ${err.message}`);
        }
      }
    }
  });

  socket.on('end',   () => cleanupSocket(socket));
  socket.on('error', (err) => {
    logger.error(`TCP error: ${err.message}`);
    cleanupSocket(socket);
  });
});

// ─── HTTP Server 
const httpServer = http.createServer((req, res) => {
  const host       = req.headers['x-forwarded-host'] || req.headers.host || '';
  const subdomain  = host.split('.')[0];
  const tunnelSocket = clients[subdomain];

  if (!tunnelSocket || tunnelSocket.destroyed) {
    sendError(res, 404, 'No Tunnel Found',
      `The subdomain <b>${escapeHtml(subdomain)}</b> is not connected to a client.`);
    return;
  }

  // Handle an aborted/errored incoming request gracefully
  req.on('error', (err) => {
    logger.warn(`Incoming request error: ${err.message}`);
    sendError(res, 400, 'Bad Request', 'The request could not be read.');
  });

  const bodyChunks = [];
  req.on('data', (chunk) => bodyChunks.push(chunk));
  req.on('end',  () => {
    // Re-check socket — it may have disconnected while we were reading the body
    if (tunnelSocket.destroyed) {
      sendError(res, 502, 'Tunnel Disconnected', 'The client disconnected before the request could be forwarded.');
      return;
    }

    const requestId  = crypto.randomUUID();
    const bodyBase64 = Buffer.concat(bodyChunks).toString('base64');

    const timer = setTimeout(() => {
      if (pendingRequests[requestId]) {
        sendError(pendingRequests[requestId].res, 504, 'Gateway Timeout',
          'The tunnel is open, but your <b>local server</b> is not responding.');
        delete pendingRequests[requestId];
      }
    }, REQUEST_TIMEOUT_MS);

    pendingRequests[requestId] = { res, timer, tunnelSocket };

    // ── Forward the request to the client
    tunnelSocket.write(
      JSON.stringify({
        type:    'request',
        id:      requestId,
        method:  req.method,
        url:     req.url,
        headers: req.headers,
        body:    bodyBase64,
      }) + '\n',
    );
  });
});

// ─── Helpers

// Prevent user-controlled values from injecting HTML into error pages
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Start
tcpServer.listen(TCP_PORT,   () => logger.info(`Relay TCP  listening on :${TCP_PORT}`));
httpServer.listen(HTTP_PORT, () => logger.info(`Relay HTTP listening on :${HTTP_PORT}`));
