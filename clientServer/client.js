#!/usr/bin/env node
import net from 'net';
import http from 'http';
import { parseArgs } from 'util';
import { setConnecting, setOnline, setReconnecting, logRequest,
  destroyUI, uiActive,} from './src/cli.js';
  
import { getStoredToken } from './src/auth.js';

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
let reconnectDelay = 3_000;
const MAX_RECONNECT_DELAY = 60_000;

// 3. Bootstrap Connection
setConnecting(values.port);
connect();

function connect() {
  buffer = '';
  intentionalClose = false;

  tunnel = net.connect(Number(values.relayPort), values.relay, () => {
    reconnectDelay = 3_000; // Reset backoff
    tunnel.setNoDelay(true); // SPEED: Disable Nagle Algorithm
    
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

// 4. Data Handling & JSON Framing
function onData(chunk) {
  buffer += chunk.toString();
  const messages = buffer.split('\n');
  buffer = messages.pop(); // Keep partial message in buffer

  for (const raw of messages) {
    if (!raw.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) { continue; }

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

    // If it's not a system message, it's a proxied request
    proxyRequest(msg);
  }
}

// 5. The Proxy Core (Optimized for Vite/Large Files)
function proxyRequest(msg) {
  const bodyBuffer = msg.body ? Buffer.from(msg.body, 'base64') : Buffer.alloc(0);
  const headers = { ...msg.headers };
  
  // FIX: Prevent 'Invalid Host Header' errors in local dev servers
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
      localRes.destroy(); // CLEANUP: Prevent memory leaks
    });
  });

  localReq.on('error', (err) => {
    localReq.destroy();
    safeTunnelWrite({
      id:         msg.id,
      statusCode: 502,
      type:       'response',
      headers:    { 'content-type': 'text/plain' },
      body:       Buffer.from('Local app is unreachable').toString('base64'),
    });
  });

  localReq.end(bodyBuffer);
}

// 6. Helpers & Cleanup
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

// Handle exit signals (Ctrl+C)
const gracefulExit = () => {
  intentionalClose = true;
  destroyUI();
  if (tunnel) tunnel.destroy();
  process.exit(0);
};

process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit);
