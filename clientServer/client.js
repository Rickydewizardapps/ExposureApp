#!/usr/bin/env node
import net from 'net';
import http from 'http';
import { parseArgs } from 'util';
import {
  setConnecting, setOnline, setReconnecting,
  logRequest, destroyUI, uiActive,
} from './src/cli.js';
import { getStoredToken, saveToken } from './src/auth.js';
import { getClientErrorPage } from './src/clientError.js';

// ─── Constants────

const RELAY_HOST = process.env.APEX_RELAY      ?? 'relay.apextunnel.top';
const RELAY_PORT = Number(process.env.APEX_RELAY_PORT ?? '9000');
const DEFAULT_LOCAL_PORT = 8080;
const VERSION = '1.1.3';

// ─── Help─────────

const HELP = `
  \x1b[1mApexTunnel v${VERSION}\x1b[0m — expose localhost to the internet

  \x1b[1mUsage:\x1b[0m
    apex http <port>                       Expose a local port
    apex http <port> --subdomain <name>    Expose with a custom subdomain
    apex authtoken <token>                 Save your auth token
    apex status                            Show saved token & relay info
    apex help                              Show this message

  \x1b[1mExamples:\x1b[0m
    apex http 3000
    apex http 3000 --subdomain myapp
    apex authtoken eyJhbGciOiJIUzI1NiJ9...

  \x1b[1mEnv overrides (for debugging):\x1b[0m
    APEX_RELAY          Relay hostname  (default: relay.apextunnel.top)
    APEX_RELAY_PORT     Relay port      (default: 9000)
`.trimStart();

// ─── Command Routing

const argv        = process.argv.slice(2);
const [cmd = '']  = argv;

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  process.stdout.write(HELP);
  process.exit(0);
}

if (cmd === '--version' || cmd === '-v') {
  console.log(`apex v${VERSION}`);
  process.exit(0);
}

// ── authtoken─────

if (cmd === 'authtoken') {
  const rawToken = argv[1];

  if (!rawToken || !rawToken.trim()) {
    console.error('\x1b[31m✖\x1b[0m Usage: apex authtoken <token>');
    process.exit(1);
  }

  try {
    saveToken(rawToken);
    console.log('\x1b[32m✔\x1b[0m Authtoken saved successfully.');
    process.exit(0);
  } catch (err) {
    console.error(`\x1b[31m✖\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

// ── status────────

if (cmd === 'status') {
  const stored = getStoredToken();
  if (!stored) {
    console.log('\x1b[33m○\x1b[0m  No auth token saved.');
    console.log('   Run: apex authtoken <token>');
  } else {
    const masked = stored.slice(0, 8) + '••••••••' + stored.slice(-4);
    console.log(`\x1b[32m✔\x1b[0m  Token   : ${masked}`);
    console.log(`   Relay   : ${RELAY_HOST}:${RELAY_PORT}`);
  }
  process.exit(0);
}

// ── http

if (cmd !== 'http') {
  console.error(`\x1b[31m✖\x1b[0m Unknown command: "${cmd}". Run: apex help`);
  process.exit(1);
}

// Parse everything after "http"
// e.g. argv = ['http', '3000', '--subdomain', 'myapp']
const { values, positionals } = parseArgs({
  args:             argv.slice(1),
  options: {
    subdomain: { type: 'string', default: '' },
  },
  allowPositionals: true,
  strict:           true,
});

// Port is the first positional — apex http 3000
const rawPort   = positionals[0] ?? String(DEFAULT_LOCAL_PORT);
const localPort = Number(rawPort);

if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
  console.error(`\x1b[31m✖\x1b[0m Invalid port: "${rawPort}". Must be 1–65535.`);
  process.exit(1);
}

if (!Number.isInteger(RELAY_PORT) || RELAY_PORT < 1 || RELAY_PORT > 65535) {
  console.error('\x1b[31m✖\x1b[0m Invalid APEX_RELAY_PORT value.');
  process.exit(1);
}

const token = getStoredToken();
if (!token) {
  console.error('\x1b[31m✖\x1b[0m No auth token found. Run: apex authtoken <token>');
  process.exit(1);
}

// ─── State

let buffer           = '';
let tunnel           = null;
let intentionalClose = false;
let reconnectDelay   = 3000;
const MAX_RECONNECT_DELAY = 60000;

// ─── Bootstrap

setConnecting(String(localPort));
connect();

// ─── Connection

function connect() {
  buffer           = '';
  intentionalClose = false;

  tunnel = net.connect(RELAY_PORT, RELAY_HOST, () => {
    reconnectDelay = 3000;
    tunnel.setNoDelay(true);

    tunnel.write(
      JSON.stringify({
        type:      'register',
        subdomain: values.subdomain,
        token,
      }) + '\n',
    );
  });

  tunnel.on('data',  onData);
  tunnel.on('error', (err) => {
    if (!uiActive) console.error('[client] Tunnel error:', err.message);
  });
  tunnel.on('close', onClose);
}

// ─── Data Handling

function onData(chunk) {
  buffer += chunk.toString();
  const messages = buffer.split('\n');
  buffer = messages.pop(); // keep incomplete trailing data

  for (const raw of messages) {
    if (!raw.trim()) continue;

    let msg;
    try { msg = JSON.parse(raw); } catch { continue; }

    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) continue;

    if (msg.type === 'error') {
      destroyUI();
      console.error('\x1b[31m✖\x1b[0m ' + String(msg.message ?? 'Unknown server error'));
      intentionalClose = true;
      tunnel.destroy();
      process.exit(1);
    }

    if (msg.type === 'registered') {
      setOnline({ ...msg, port: String(localPort) });
      continue;
    }

    if (msg.type === 'request') {
      proxyRequest(msg);
    }
  }
}

// ─── Proxy

const HOP_BY_HOP = new Set([
  'host', 'connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

function proxyRequest(msg) {
  const bodyBuffer = msg.body ? Buffer.from(msg.body, 'base64') : Buffer.alloc(0);

  const headers = {};
  for (const [key, val] of Object.entries(msg.headers ?? {})) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers[key] = val;
    }
  }

  if (bodyBuffer.length > 0) {
    headers['content-length'] = String(bodyBuffer.length);
  }

  // Only forward relative paths — never let a relay URL escape localhost
  const safePath = typeof msg.url === 'string' && msg.url.startsWith('/')
    ? msg.url
    : '/';

  const localReq = http.request({
    hostname: '127.0.0.1',
    port:     localPort,
    path:     safePath,
    method:   msg.method,
    headers,
  }, (localRes) => {
    const chunks = [];
    localRes.on('data',  (chunk) => chunks.push(chunk));
    localRes.on('end',   () => {
      const bodyBase64 = Buffer.concat(chunks).toString('base64');
      logRequest(msg.method, safePath, localRes.statusCode);

      safeTunnelWrite({
        id:         msg.id,
        type:       'response',
        statusCode: localRes.statusCode,
        headers:    localRes.headers,
        body:       bodyBase64,
      });
    });
    localRes.on('error', () => localRes.destroy());
  });

  localReq.on('error', () => {
    localReq.destroy();

    const html = getClientErrorPage(localPort);
    logRequest(msg.method, safePath, 502);

    safeTunnelWrite({
      id:         msg.id,
      type:       'response',
      statusCode: 502,
      headers:    {
        'content-type':   'text/html',
        'content-length': String(Buffer.byteLength(html)),
      },
      body: Buffer.from(html).toString('base64'),
    });
  });

  localReq.end(bodyBuffer);
}

// ─── Helpers

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

// ─── Graceful Shutdown

const gracefulExit = () => {
  intentionalClose = true;
  destroyUI();
  if (tunnel) tunnel.destroy();
  process.exit(0);
};

process.on('SIGINT',  gracefulExit);
process.on('SIGTERM', gracefulExit);
