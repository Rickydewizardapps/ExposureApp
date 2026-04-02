import net from 'net';
import http from 'http';
import crypto from 'crypto';

// global vars
const pendingRequest = {};


// TCP SERVER
let tunnelClient = null;

const tcpServer = net.createServer((socket) =>{
  tunnelClient = socket;
  
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
      body: req.fullBody
    }) + '\n' );
    
    console.log('pending requests: ', Object.keys(pendingRequest));
    
    console.log('Browser request received');
  });
  
});

// run http server
httpServer.listen(2000, () => {
  console.log('HTTP server listening on port 2000');
});
