import net from 'net';
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';
import 'dotenv/config';

import { handleRegister } from './handlers/register.js';

const pendingRequest = {};
let clients = {};

const tcpServer = net.createServer((socket) => {
  let buffer = '';

  socket.on('data', (chunk) => {
    buffer += chunk.toString();

    const messages = buffer.split('\n');
    buffer = messages.pop();

    for (const message of messages) {
      if (!message) continue;

      try {
        const response = JSON.parse(message);

        if (response.type === 'register') {
          handleRegister(socket, response, clients);
        } else {
          const res = pendingRequest[response.id];
          if (!res) continue;

          res.writeHead(response.statusCode, response.headers);
          res.end(response.body);

          delete pendingRequest[response.id];
        }

      } catch (err) {
        console.log('Malformed json from client:', err.message);
      }
    }
  });

  socket.on('end', () => {
    const subdomain = Object.keys(clients).find(key => clients[key] === socket);
    if (subdomain) {
      delete clients[subdomain];
      fetch(`${process.env.API_URL}/internal/tunnel/disconnected`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_SECRET
        },
        body: JSON.stringify({ subdomain })
      }).catch(err => console.log('API notify failed:', err.message));
    }
    console.log('Tunnel client disconnected');
  });

  socket.on('error', (err) => {
    const subdomain = Object.keys(clients).find(key => clients[key] === socket);
    if (subdomain) {
      delete clients[subdomain];
      fetch(`${process.env.API_URL}/internal/tunnel/disconnected`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_SECRET
        },
        body: JSON.stringify({ subdomain })
      }).catch(err => console.log('API notify failed:', err.message));
    }
    console.log('Tunnel client error:', err.message);
  });

  console.log('TCP server connected successfully');
});

tcpServer.listen(9000, () => {
  console.log('TCP server running on port 9000');
});

const sslOptions = {
  key: fs.readFileSync('./key.pem'),
  cert: fs.readFileSync('./cert.pem'),
};

const httpsServer = https.createServer(sslOptions, (req, res) => {
  const body = [];

  req.on('data', (chunk) => {
    body.push(chunk);
  });

  req.on('end', () => {
    const fullBody = Buffer.concat(body).toString();
    const requestId = crypto.randomUUID();

    console.log(req.method, req.url, requestId);

    pendingRequest[requestId] = res;

    res.on('close', () => {
      delete pendingRequest[requestId];
    });

    const host = req.headers.host || '';
    const subdomain = host.split('.')[0];
    const tunnelSocket = clients[subdomain];

    if (!tunnelSocket) {
      res.writeHead(404);
      res.end('No tunnel found for this subdomain');
      return;
    }

    tunnelSocket.write(JSON.stringify({
      id: requestId,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: fullBody
    }) + '\n');

    console.log('pending requests:', Object.keys(pendingRequest));
  });
});

httpsServer.listen(2000, () => {
  console.log('HTTP server listening on port 2000');
});