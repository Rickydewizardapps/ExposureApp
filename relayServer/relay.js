import net from 'net';
import http from 'http';
import crypto from 'crypto';

// global vars
const pendingRequest = {};


// TCP SERVER
let tunnelClient = null;

const tcpServer = net.createServer((socket) =>{
  tunnelClient = socket;
  
  let buffer = '';
  
  socket.on('data', (chunk)=>{
    
    buffer += chunk.toString();
    
    const messages = buffer.split('\n');
    buffer = messages.pop();
    
    for (const message of messages) {
      if (!message) return;
      
      const response = JSON.parse(message);
      
      const res = pendingRequest[response.id];
      if (!res) return;
      
      res.writeHead(response.statusCode, response.headers);
      res.end(response.body);
      
      delete pendingRequest[response.id];
    }
  });
  
  console.log('TCP server connected successfully');
});

// run tcp server
tcpServer.listen(9000, ()=>{
  console.log('TCP server running on port 9000');
});

// HTTP SERVER 

const httpServer = http.createServer((req, res) => {
  const body = [];
  
  // get all the data
  req.on('data', (chunk)=>{
    body.push(chunk);
  });
  
  req.on('end', ()=>{
    const fullBody = Buffer.concat(body).toString();
    const requestId = crypto.randomUUID();
    
    
    console.log(req.method, req.url, fullBody, requestId);
    
    pendingRequest[requestId] = res;
    
    if (!tunnelClient) {
      res.writeHead(500);
      res.end('There is no client connected to the tunnel yet');
      return;
    }
    
    // rend the response via the tunnelClient
    
    tunnelClient.write(JSON.stringify({
      id: requestId,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: fullBody
    }) + '\n' );
    
    console.log('pending requests: ', Object.keys(pendingRequest));
    
    console.log('Browser request received');
  });
  
});

// run http server
httpServer.listen(2000, () => {
  console.log('HTTP server listening on port 2000');
});
