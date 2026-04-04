import net from 'net';
import http from 'http';
import { parseArgs } from 'util';
import 'dotenv/config';

const { values } = parseArgs({
  options: {
    relay: { type: 'string', default: 'localhost' },
    port: { type: 'string', default: '8000' },
    subdomain: { type: 'string', default: ''},
    token: { type: 'string', default: '' },
  }
});

let buffer = '';

function connect() {
  const tunnel = net.connect(9000, values.relay, () => {
  console.log('Connected to relay server successfully');
  
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
          console.log('Relay error: ', request.message);
          process.exit(1);
        }
        
        if (request.type === 'registered') {
          console.log(`Tunnel ready: https://${request.subdomain}.apextunnel.online`);
          continue;
        }
        console.log('Received request:', request.id, request.method, request.url);
  
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
            console.log('Local app responded:', localRes.statusCode, body);
  
            tunnel.write(JSON.stringify({
              id: request.id,
              statusCode: localRes.statusCode,
              type: 'response',
              headers: localRes.headers,
              body: body
            }) + '\n');
          });
        });
  
        // on error
        localReq.on('error', (err) => {
          console.log('Local app error:', err.message);
  
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
        console.log('Malformed json from relay:', err.message);
      }
    }
  });
  
  tunnel.on('error', (err)=>{
    console.log('An error occured', err.message);
  });
  
  tunnel.on('close', ()=>{
    console.log('Tunnel clossed unexpectedly. Reconnecting in 3 seconds...');
    
    // reconect
    setTimeout( connect, 3000);
  });
  
}


connect();