import net from 'net';
import http from 'http';
import { parseArgs } from 'util';
import 'dotenv/config';
import { setConnecting, setOnline, setReconnecting, logRequest, uiActive } from './src/cli.js';

const { values } = parseArgs({
  options: {
    relay: { type: 'string', default: 'localhost' },
    port: { type: 'string', default: '8000' },
    subdomain: { type: 'string', default: '' },
    token: { type: 'string', default: '' },
  }
});

let buffer = '';

// show UI before connecting
setConnecting(values.port);

function connect() {
  const tunnel = net.connect(9000, values.relay, () => {
    tunnel.write(JSON.stringify({
      type: 'register',
      subdomain: values.subdomain,
      token: process.env.APEX_CLIENT_TOKEN
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
          if (!uiActive) console.log('Relay error:', request.message);
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
    if (!uiActive) console.log('An error occurred', err.message);
  });

  tunnel.on('close', () => {
    setReconnecting();
    setTimeout(connect, 3000);
  });
}

connect();