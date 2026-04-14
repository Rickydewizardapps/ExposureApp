#!/usr/bin/env node
import net from 'net';
import http from 'http';
import { parseArgs } from 'util';
import { setConnecting, setOnline, setReconnecting, logRequest,
  destroyUI, uiActive,} from './src/cli.js';
  
import { getStoredToken } from './src/auth.js';
import { getClientErrorPage } from './src/clientError.js';

// 1. CLI Argument Configuration
const { values } = parseArgs({
  options: {
    relay:      { type: 'string', default: 'localhost' },
    relayPort:  { type: 'string', default: '9000' },
    port:       { type: 'string', default: '8000' },
    subdomain:  { type: 'string', default: '' },
    token:      { type: 'string', default: getStoredToken() || '' },
  },
});

if (!values.token) {
  console.error('\x1b[31m✖\x1b[0m No auth token found. Run: apex authtoken <token>');
  process.exit(1);
}

// 2. State Management
let buffer = '';
let tunnel;
let intentionalClose = false;
let reconnectDelay = 3000;
const MAX_RECONNECT_DELAY = 60000;

// 3. Bootstrap Connection
setConnecting(values.port);
connect();

function connect() {
  buffer = '';
  intentionalClose = false;

  tunnel = net.connect(Number(values.relayPort), values.relay, () => {
    reconnectDelay = 3000; 
    tunnel.setNoDelay(true); 
    
    tunnel.write(
      JSON.stringify({
        type:      'register',
        subdomain: values.subdomain,
        token:     values.token,
      }) + '\n',
    );
  });

  tunnel.on('data', onData);
  tunnel.on('error', (err) => {
    if (!uiActive) console.error('[client] Tunnel error:', err.message);
  });
  tunnel.on('close', onClose);
}

function onData(chunk) {
  buffer += chunk.toString();
  const messages = buffer.split('\n');
  buffer = messages.pop(); 

  for (const raw of messages) {
    if (!raw.trim()) continue;
    let msg;
    try { msg = JSON.parse(raw); } catch (err) { continue; }

    if (msg.type === 'error') {
      destroyUI();
      console.error('\x1b[31m✖\x1b[0m ' + msg.message);
      intentionalClose = true;
      tunnel.destroy();
      process.exit(1);
    }

    if (msg.type === 'registered') {
      setOnline({ ...msg, port: values.port });
      continue;
    }

    proxyRequest(msg);
  }
}

function proxyRequest(msg) {
  const bodyBuffer = msg.body ? Buffer.from(msg.body, 'base64') : Buffer.alloc(0);
  const headers = { ...msg.headers };
  
  delete headers['host'];
  
  if (bodyBuffer.length > 0) {
    headers['content-length'] = String(bodyBuffer.length);
  }

  const localReq = http.request({
    hostname: '127.0.0.1',
    port:     Number(values.port),
    path:     msg.url,
    method:   msg.method,
    headers,
  }, (localRes) => {
    const responseChunks = [];
    localRes.on('data', (chunk) => responseChunks.push(chunk));
    localRes.on('end', () => {
      const bodyBase64 = Buffer.concat(responseChunks).toString('base64');
      logRequest(msg.method, msg.url, localRes.statusCode);
      
      safeTunnelWrite({
        id:         msg.id,
        statusCode: localRes.statusCode,
        type:       'response',
        headers:    localRes.headers,
        body:       bodyBase64,
      });
    });

    localRes.on('error', (err) => {
      localRes.destroy();
    });
  });

  localReq.on('error', (err) => {
    localReq.destroy();
    
    // Generate the HTML error page with a retry button
    const html = getClientErrorPage(values.port);
    logRequest(msg.method, msg.url, 502);

    safeTunnelWrite({
      id:         msg.id,
      statusCode: 502,
      type:       'response',
      headers:    { 
        'content-type': 'text/html',
        'content-length': Buffer.byteLength(html).toString()
      },
      body:       Buffer.from(html).toString('base64'),
    });
  });

  localReq.end(bodyBuffer);
}

function safeTunnelWrite(obj) {
  if (!tunnel || tunnel.destroyed) return;
  try {
    tunnel.write(JSON.stringify(obj) + '\n');
  } catch (err) {
    if (!uiActive) console.error('[client] Write error:', err.message);
  }
}

function onClose() {
  if (intentionalClose) return;
  setReconnecting();
  setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

const gracefulExit = () => {
  intentionalClose = true;
  destroyUI();
  if (tunnel) tunnel.destroy();
  process.exit(0);
};

process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit);
