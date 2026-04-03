import net from 'net';
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';

// global vars
const pendingRequest = {};

// TCP SERVER
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
        
        // register new domain
        if (response.type === 'register') {
          
          // authentiation
          if (!response.token) {
            socket.write(JSON.stringify({
              type: 'error',
              message: 'You are not authenticated. Visit our official page for auth token. \n Visit https://apextunnel.online/register'
            }) + '\n');
            socket.end();
            return;
          }
          
          if (response.token !== process.env.APEX_AUTH_TOKEN) {
            socket.write(JSON.stringify({
              type: 'error',
              message: 'Invalid token'
            }) + '\n');
            socket.end();
            return;
          }
          const subdomain = response.subdomain ||crypto.randomBytes(4).toString('hex');
          
          if (clients[subdomain]) {
            socket.write(JSON.stringify({
              type: 'error',
              message: `Subdomain ${subdomain} is already taken`
            }) + '\n');
            socket.end();
            return;
          }
          clients[subdomain] = socket;
          
          socket.write(JSON.stringify({
            type: 'registered',
            subdomain: subdomain
          }) + '\n');
          
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
    if (subdomain) delete clients[subdomain];
    
    console.log('Tunnel client disconnected');
  });

  socket.on('error', (err) => {
    const subdomain = Object.keys(clients).find(key=> clients[key] === socket);
    if(subdomain) delete clients[subdomain];
    
    console.log('Tunnel client error:', err.message);
  });

  console.log('TCP server connected successfully');
});

tcpServer.listen(9000, () => {
  console.log('TCP server running on port 9000');
});

// HTTP SERVER

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

    console.log(req.method, req.url, fullBody, requestId);

    pendingRequest[requestId] = res;

    // cleanup if browser disconnects
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
    console.log('Browser request received');
  });
});

httpsServer.listen(2000, () => {
  console.log('HTTP server listening on port 2000');
});