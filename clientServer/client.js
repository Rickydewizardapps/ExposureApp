#!/usr/bin/env node
import net from 'net';
import http from 'http';
import { parseArgs } from 'util';
import { setConnecting, setOnline, setReconnecting, logRequest, destroyUI, uiActive } from './src/cli.js';
import { getStoredToken } from './src/auth.js';

const { values } = parseArgs({
  options: {
    relay:     { type: 'string', default: 'localhost' },
    port:      { type: 'string', default: '8000' },
    subdomain: { type: 'string', default: '' },
    token:     { type: 'string', default: getStoredToken() || '' },
  }
});

if (!values.token) {
  console.error('\x1b[31m✖\x1b[0m No auth token found. Run: apex authtoken <token>');
  process.exit(1);
}

let buffer = '';
let tunnel;

setConnecting(values.port);

function connect() {
  tunnel = net.connect(9000, values.relay, () => {
    tunnel.write(JSON.stringify({
      type: 'register',
      subdomain: values.subdomain,
      token: values.token
    }) + '\n');
  });

  tunnel.on('data', (chunk) => {
    buffer += chunk.toString();

    const messages = buffer.split('\n');
    buffer = messages.pop();

    for (const message of messages) {
      if (!message) continue;

      try {
        const request = JSON.parse(message);

        if (request.type === 'error') {
          destroyUI();
          console.error('\x1b[31m✖\x1b[0m ' + request.message);
          process.exit(1);
        }

        if (request.type === 'registered') {
          setOnline({
            email: request.email,
            isPremium: request.isPremium,
            subdomain: request.subdomain,
            port: values.port
          });
          continue;
        }

        const options = {
          hostname: 'localhost',
          port: values.port,
          path: request.url,
          method: request.method,
          headers: request.headers
        };

        const localReq = http.request(options, (localRes) => {
          let responseBody = [];

          localRes.on('data', (chunk) => {
            responseBody.push(chunk);
          });

          localRes.on('end', () => {
            const body = Buffer.concat(responseBody).toString();
            logRequest(request.method, request.url, localRes.statusCode);

            tunnel.write(JSON.stringify({
              id: request.id,
              statusCode: localRes.statusCode,
              type: 'response',
              headers: localRes.headers,
              body: body
            }) + '\n');
          });
        });

        localReq.on('error', (err) => {
          if (!uiActive) console.log('Local app error:', err.message);

          tunnel.write(JSON.stringify({
            id: request.id,
            statusCode: 502,
            type: 'response',
            headers: {},
            body: 'Local app is unreachable'
          }) + '\n');
        });

        localReq.end(request.body);

      } catch (err) {
        if (!uiActive) console.log('Malformed json from relay:', err.message);
      }
    }
  });

  tunnel.on('error', (err) => {
    if (!uiActive) console.log('An error occurred:', err.message);
  });

  tunnel.on('close', () => {
    setReconnecting();
    setTimeout(connect, 3000);
  });
}

process.on('restart', () => {
  tunnel.destroy();
});

connect();