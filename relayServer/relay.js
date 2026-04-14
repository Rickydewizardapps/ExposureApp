import net from 'net';
import http from 'http';
import crypto from 'crypto';
import 'dotenv/config';
import logger from './logger.js';
import { handleRegister } from './handlers/register.js';
import { errorPage } from './errorPage.js';

const clients = {};
const pendingRequests = {};
const TCP_PORT = Number(process.env.TCP_PORT) || 9000;
const HTTP_PORT = Number(process.env.HTTP_PORT) || 2000;
const REQUEST_TIMEOUT_MS = 60000;

// Helper to send branded HTML errors
const sendError = (res, status, title, message) => {
  if (res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'text/html' });
  res.end(errorPage(status, title, message));
};

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
        sendError(pending.res, 502, 'Tunnel Disconnected', 'The connection to the <b>Apex Client</b> was lost mid-request.');
      } catch (_) {}
      delete pendingRequests[id];
    }
  }
}

const tcpServer = net.createServer((socket) => {
  socket.setNoDelay(true); 
  let buffer = '';

  const regTimeout = setTimeout(() => {
    if (!socket._apexRegistered) {
      logger.warn({ remote: socket.remoteAddress }, 'Client timed out before registering');
      socket.destroy();
    }
  }, 10000);

  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    if (buffer.length > 50 * 1024 * 1024) { 
      socket.destroy();
      return;
    }

    const messages = buffer.split('\n');
    buffer = messages.pop();
    
    for (const raw of messages) {
      if (!raw.trim()) continue;
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { continue; }

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
      headers['content-length'] = bodyBuffer.length;
      
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
    sendError(res, 404, 'No Tunnel Found', `The subdomain <b>${subdomain}</b> is not connected to a client.`);
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
          sendError(pendingRequests[requestId].res, 504, 'Gateway Timeout', 'The tunnel is open, but your <b>local server</b> is not responding.');
        } catch (_) {}
        delete pendingRequests[requestId];
      }
    }, REQUEST_TIMEOUT_MS);

    pendingRequests[requestId] = { res, timer, tunnelSocket };
    
    const packet = JSON.stringify({
      id: requestId, method: req.method, url: req.url,
      headers: req.headers, body: bodyBase64
    }) + '\n';

    tunnelSocket.write(packet);
  });
});

tcpServer.listen(TCP_PORT, () => logger.info(`Relay TCP on ${TCP_PORT}`));
httpServer.listen(HTTP_PORT, () => logger.info(`Relay HTTP on ${HTTP_PORT}`));
