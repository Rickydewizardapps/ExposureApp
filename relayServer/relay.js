import net from 'net';
import http from 'http';
import crypto from 'crypto';
import 'dotenv/config';
import logger from './logger.js';
import { handleRegister } from './handlers/register.js';

const clients = {};
const pendingRequests = {};
const TCP_PORT = Number(process.env.TCP_PORT) || 9000;
const HTTP_PORT = Number(process.env.HTTP_PORT) || 2000;
const REQUEST_TIMEOUT_MS = 30000;

function cleanupSocket(socket) {
  if (socket._apexCleaned) return;
  socket._apexCleaned = true;
  const subdomain = Object.keys(clients).find((k) => clients[k] === socket);
  if (subdomain) {
    delete clients[subdomain];
    logger.info({ subdomain }, 'Tunnel disconnected');
  }
  for (const [id, pending] of Object.entries(pendingRequests)) {
    if (pending.tunnelSocket === socket) {
      clearTimeout(pending.timer);
      try {
        pending.res.writeHead(502);
        pending.res.end('Tunnel disconnected');
      } catch (_) {}
      delete pendingRequests[id];
    }
  }
}

const tcpServer = net.createServer((socket) => {
  let buffer = '';
  // 10 second window for registration
  const regTimeout = setTimeout(() => {
    if (!socket._apexRegistered) {
      logger.warn({ remote: socket.remoteAddress }, 'Client timed out before registering');
      socket.destroy();
    }
  }, 10000);

  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    if (buffer.length > 5 * 1024 * 1024) { // 5MB metadata limit
      logger.warn('Buffer overflow, killing socket');
      socket.destroy();
      return;
    }

    const messages = buffer.split('\n');
    buffer = messages.pop();
    for (const raw of messages) {
      if (!raw.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        continue;
      }

      if (msg.type === 'register') {
        clearTimeout(regTimeout);
        handleRegister(socket, msg, clients);
        continue;
      }
      
      const pending = pendingRequests[msg.id];
      if (!pending) continue;
      clearTimeout(pending.timer);
      delete pendingRequests[msg.id];

      const bodyBuffer = msg.body ? Buffer.from(msg.body, 'base64') : Buffer.alloc(0);
      const headers = { ...msg.headers };
      delete headers['transfer-encoding'];
      delete headers['content-length'];
      
      pending.res.writeHead(msg.statusCode, headers);
      pending.res.end(bodyBuffer);
    }
  });

  socket.on('end', () => cleanupSocket(socket));
  socket.on('error', (err) => {
    logger.error(`TCP error: ${err.message}`);
    cleanupSocket(socket);
  });
});

const httpServer = http.createServer((req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const subdomain = host.split('.')[0];
  const tunnelSocket = clients[subdomain];

  if (!tunnelSocket) {
    res.writeHead(404);
    res.end('No tunnel found');
    return;
  }

  const bodyChunks = [];
  req.on('data', (chunk) => bodyChunks.push(chunk));
  req.on('end', () => {
    const requestId = crypto.randomUUID();
    const bodyBase64 = Buffer.concat(bodyChunks).toString('base64');
    const timer = setTimeout(() => {
      if (pendingRequests[requestId]) {
        try {
          pendingRequests[requestId].res.writeHead(504);
          pendingRequests[requestId].res.end('Tunnel Timeout');
        } catch (_) {}
        delete pendingRequests[requestId];
      }
    }, REQUEST_TIMEOUT_MS);

    pendingRequests[requestId] = { res, timer, tunnelSocket };
    tunnelSocket.write(JSON.stringify({
      id: requestId,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: bodyBase64
    }) + '\n');
  });
});

tcpServer.listen(TCP_PORT, () => logger.info(`Relay TCP on ${TCP_PORT}`));
httpServer.listen(HTTP_PORT, () => logger.info(`Relay HTTP on ${HTTP_PORT}`));
