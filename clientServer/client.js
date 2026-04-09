#!/usr/bin/env node
import net from 'net';
import http from 'http';
import { parseArgs } from 'util';
import {
  setConnecting,
  setOnline,
  setReconnecting,
  logRequest,
  destroyUI,
  uiActive,
} from './src/cli.js';
import { getStoredToken } from './src/auth.js';

// CLI args

const { values } = parseArgs({
  options: {
    relay:     { type: 'string', default: 'localhost' },
    port:      { type: 'string', default: '8000' },
    subdomain: { type: 'string', default: '' },
    token:     { type: 'string', default: getStoredToken() || '' },
  },
});

if (!values.token) {
  console.error('\x1b[31m✖\x1b[0m No auth token found. Run: apex authtoken <token>');
  process.exit(1);
}

// State

let buffer = '';
let tunnel;

let intentionalClose = false;

let reconnectDelay = 3_000;
const MAX_RECONNECT_DELAY = 60_000;

// Bootstrap

setConnecting(values.port);
connect();

// Connection

function connect() {
  buffer = '';

  tunnel = net.connect(9000, values.relay, () => {
    reconnectDelay = 3_000; // reset backoff on successful connection
    tunnel.write(
      JSON.stringify({
        type:      'register',
        subdomain: values.subdomain,
        token:     values.token,
      }) + '\n',
    );
  });

  tunnel.on('data', onData);
  tunnel.on('error', onError);
  tunnel.on('close', onClose);
}
// Data handler

function onData(chunk) {
  buffer += chunk.toString();

  const messages = buffer.split('\n');
  buffer = messages.pop(); // keep incomplete tail

  for (const raw of messages) {
    if (!raw.trim()) continue;

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      if (!uiActive) console.error('[client] Malformed JSON from relay:', err.message);
      continue;
    }

    // Auth / control messages
    if (msg.type === 'error') {
      destroyUI();
      console.error('\x1b[31m✖\x1b[0m ' + msg.message);
      intentionalClose = true;
      tunnel.destroy();
      process.exit(1);
    }

    if (msg.type === 'registered') {
      setOnline({
        email:     msg.email,
        isPremium: msg.isPremium,
        subdomain: msg.subdomain,
        port:      values.port,
      });
      continue;
    }

    // Proxied HTTP request from relay
    proxyRequest(msg);
  }
}
// Local proxy

function proxyRequest(msg) {
  // The relay sends the body as base64 to preserve binary fidelity
  const bodyBuffer = msg.body
    ? Buffer.from(msg.body, 'base64')
    : Buffer.alloc(0);

  // Strip headers that will conflict with our own local request
  const headers = { ...msg.headers };
  delete headers['host'];
  // Rewrite content-length to match the decoded buffer
  if (bodyBuffer.length > 0) {
    headers['content-length'] = String(bodyBuffer.length);
  } else {
    delete headers['content-length'];
  }

  const options = {
    hostname: '127.0.0.1',
    port:     values.port,
    path:     msg.url,
    method:   msg.method,
    headers,
  };

  const localReq = http.request(options, (localRes) => {
    const responseChunks = [];

    localRes.on('data', (chunk) => responseChunks.push(chunk));

    localRes.on('end', () => {
      // Encode the response body as base64 so binary responses survive JSON
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
      if (!uiActive) console.error('[client] Local response error:', err.message);
    });
  });

  localReq.on('error', (err) => {
    if (!uiActive) console.error('[client] Local app error:', err.message);

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

// Helpers

function safeTunnelWrite(obj) {
  if (!tunnel || tunnel.destroyed) return;
  try {
    tunnel.write(JSON.stringify(obj) + '\n');
  } catch (err) {
    if (!uiActive) console.error('[client] Tunnel write error:', err.message);
  }
}

function onError(err) {
  if (!uiActive) console.error('[client] Tunnel error:', err.message);
}

function onClose() {
  if (intentionalClose) return;

  setReconnecting();
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  setTimeout(connect, delay);
}

// Graceful shutdown  (replaces the broken process.on('restart') pattern)

function gracefulExit(signal) {
  intentionalClose = true;
  destroyUI();
  if (tunnel && !tunnel.destroyed) tunnel.destroy();
  process.exit(0);
}

process.on('SIGTERM', gracefulExit);
process.on('SIGINT',  gracefulExit);

process.on('apexRestart', () => {
  buffer = '';
  if (tunnel && !tunnel.destroyed) tunnel.destroy();
  // onClose, fire next tick and schedule reconnect
});
