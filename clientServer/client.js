#!/usr/bin/env node

import http from 'http';
import { parseArgs } from 'util';
import {
  setConnecting, setOnline, setReconnecting,
  logRequest, destroyUI, uiActive, setRestartCallback,
} from './src/cli.js';
import { getStoredToken, saveToken, saveSubdomain, getStoredSubdomain } from './src/auth.js';
import { getClientErrorPage } from './src/clientError.js';
import { TunnelConnection } from './src/connection.js';

// ─── Constants
const RELAY_HOST = process.env.APEX_RELAY || 'relay.apextunnel.top';
const RELAY_PORT = Number(process.env.APEX_RELAY_PORT) || 9000;
const USE_TLS = process.env.APEX_TLS === 'true' || process.env.APEX_TLS === '1' || true;
const TLS_CA_PATH = process.env.APEX_TLS_CA || null;
const DEFAULT_LOCAL_PORT = 8080;
const VERSION = '2.0.0';

// ─── Validate RELAY_PORT
if (!Number.isInteger(RELAY_PORT) || RELAY_PORT < 1 || RELAY_PORT > 65535) {
  console.error('\x1b[31m✖\x1b[0m Invalid APEX_RELAY_PORT value. Must be 1–65535.');
  process.exit(1);
}

// ─── Help
const HELP = `
 \x1b[1mApexTunnel v${VERSION}\x1b[0m — expose localhost to the internet

 \x1b[1mUsage:\x1b[0m
   apex http <port>           Expose a local port
   apex http <port> --subdomain <name>  Expose with a custom subdomain
   apex authtoken <token>     Save your auth token
   apex status                Show saved token & relay info
   apex help                  Show this message

 \x1b[1mExamples:\x1b[0m
   apex http 3000
   apex http 3000 --subdomain myapp
   apex authtoken eyJhbGciOiJIUzI1NiJ9...

 \x1b[1mEnv overrides:\x1b[0m
   APEX_RELAY       Relay hostname (default: relay.apextunnel.top)
   APEX_RELAY_PORT  Relay port (default: 9000)
   APEX_TLS         Enable TLS on tunnel (default: false)
   APEX_TLS_CA      Path to CA certificate for self-signed TLS
   APEX_LOCAL_HOST  Local app hostname (default: localhost)
`.trimStart();

// ─── Command Routing
const argv = process.argv.slice(2);
const [cmd = ''] = argv;

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  process.stdout.write(HELP);
  process.exit(0);
}

if (cmd === '--version' || cmd === '-v') {
  console.log(`apex v${VERSION}`);
  process.exit(0);
}

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

if (cmd === 'status') {
  const stored = getStoredToken();
  if (!stored) {
    console.log('\x1b[33m○\x1b[0m No auth token saved.');
    console.log(' Run: apex authtoken <token>');
  } else {
    const masked = stored.slice(0, 8) + '••••••••' + stored.slice(-4);
    console.log(`\x1b[32m✔\x1b[0m Token : ${masked}`);
    console.log(` Relay : ${RELAY_HOST}:${RELAY_PORT} ${USE_TLS ? '(TLS)' : ''}`);
  }
  process.exit(0);
}

if (cmd !== 'http') {
  console.error(`\x1b[31m✖\x1b[0m Unknown command: "${cmd}". Run: apex help`);
  console.error('\n\x1b[36mAvailable commands:\x1b[0m');
  console.error('  http <port> [--subdomain <name>]');
  console.error('  authtoken <token>');
  console.error('  status');
  console.error('  help');
  process.exit(1);
}

const { values, positionals } = parseArgs({
  args: argv.slice(1),
  options: {
    subdomain: { type: 'string', default: '' },
  },
  allowPositionals: true,
  strict: true,
});

const rawPort = positionals[0] ?? String(DEFAULT_LOCAL_PORT);
const localPort = Number(rawPort);

if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
  console.error(`\x1b[31m✖\x1b[0m Invalid port: "${rawPort}". Must be 1–65535.`);
  process.exit(1);
}

const token = getStoredToken();
if (!token) {
  console.error('\x1b[31m✖\x1b[0m No auth token found. Run: apex authtoken <token>');
  process.exit(1);
}

// ─── State
const activeRequests = new Map();
const LOCAL_HOST = process.env.APEX_LOCAL_HOST || 'localhost';

// ─── Bootstrap
setConnecting(String(localPort));

const tunnel = new TunnelConnection({
  host: RELAY_HOST,
  port: RELAY_PORT,
  token,
  subdomain: values.subdomain || '',
  localPort,
  useTls: USE_TLS,
  caPath: TLS_CA_PATH,
  onRegistered: (info) => {
    if (info.subdomain) {
      saveSubdomain(info.subdomain);
    }
    setOnline({ ...info, port: String(localPort) });
  },
  onError: (err) => {
    if (err.type === 'reconnecting') {
      setReconnecting();
      return;
    }
    if (err.code === 'SUBDOMAIN_IN_USE') {
      saveSubdomain('');
      setReconnecting();
      return;
    }
    destroyUI();
    console.error('\x1b[31m✖\x1b[0m ' + String(err.message ?? 'Unknown server error'));
    process.exit(1);
  },
  onRequest: (msg) => {
    if (msg.type === 'request') {
      proxyRequest(msg);
    } else if (msg.type === 'bodyChunk') {
      const req = activeRequests.get(msg.id);
      if (req && !req.bodyComplete) {
        if (req.localReq) {
          const writable = req.localReq.write(msg.data);
          if (!writable) {
            req.paused = true;
          }
        } else {
          req.earlyChunks.push(msg.data);
        }
      }
    } else if (msg.type === 'bodyEnd') {
      const req = activeRequests.get(msg.id);
      if (req) {
        req.bodyComplete = true;
        if (req.localReq) {
          req.localReq.end();
        }
      }
    }
  },
  logger: uiActive ? { error: () => {}, warn: () => {}, info: () => {} } : console,
});

tunnel.connect();

setRestartCallback(() => {
  tunnel.disconnect();
  setTimeout(() => tunnel.connect(), 500);
});

// ─── Proxy
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

/**
 * Send a 502 error response back through the tunnel and clean up local state.
 * Used by both the request-error handler and the client-side timeout so the
 */
function send502(requestId, method, safePath, localReq) {
  try { localReq?.destroy(); } catch {}

  const html = getClientErrorPage(localPort);
  tunnel.sendResponseStart(requestId, 502, {
    'content-type': 'text/html',
    'content-length': String(Buffer.byteLength(html)),
  }, true);
  tunnel.sendBodyChunk(requestId, Buffer.from(html));
  tunnel.sendBodyEnd(requestId);

  logRequest(method, safePath, 502);
}

function proxyRequest(msg) {
  const reqState = {
    bodyComplete: !msg.bodyExpected,
    localReq: null,
    earlyChunks: [],
    paused: false,
    responseStarted: false,
  };
  activeRequests.set(msg.id, reqState);

  const safePath = typeof msg.url === 'string' && msg.url.startsWith('/')
    ? msg.url
    : '/';

  reqState.timeout = setTimeout(() => {
    if (!activeRequests.has(msg.id)) return;
    activeRequests.delete(msg.id);
    send502(msg.id, msg.method, safePath, reqState.localReq);
  }, 60000);

  const headers = {};
  for (const [key, val] of Object.entries(msg.headers ?? {})) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers[key] = val;
    }
  }
  headers['host'] = `${LOCAL_HOST}:${localPort}`;

  const localReq = http.request({
    hostname: LOCAL_HOST,
    port: localPort,
    path: safePath,
    method: msg.method,
    headers,
  }, (localRes) => {
    const noBodyStatus = [204, 304];
    const hasBody = !noBodyStatus.includes(localRes.statusCode) && msg.method !== 'HEAD';

    tunnel.sendResponseStart(msg.id, localRes.statusCode, localRes.headers, hasBody);
    reqState.responseStarted = true;

    if (!hasBody) {
      logRequest(msg.method, safePath, localRes.statusCode);
      clearTimeout(reqState.timeout);
      activeRequests.delete(msg.id);
      return;
    }

    localRes.on('data', (chunk) => {
      tunnel.sendBodyChunk(msg.id, chunk);
    });

    localRes.on('end', () => {
      tunnel.sendBodyEnd(msg.id);
      logRequest(msg.method, safePath, localRes.statusCode);
      clearTimeout(reqState.timeout);
      activeRequests.delete(msg.id);
    });

    localRes.on('error', (err) => {
      // RESPONSE_START already sent — only send body end to close the stream.
      console.error(`[PROXY] Response stream error: ${err.message}`);
      tunnel.sendBodyEnd(msg.id);
      logRequest(msg.method, safePath, 502);
      clearTimeout(reqState.timeout);
      activeRequests.delete(msg.id);
    });
  });

  reqState.localReq = localReq;

  localReq.on('drain', () => {
    reqState.paused = false;
  });

  // Flush any body chunks that arrived before the http.request() was ready.
  if (reqState.earlyChunks.length > 0) {
    for (const chunk of reqState.earlyChunks) {
      const writable = localReq.write(chunk);
      if (!writable) {
        reqState.paused = true;
      }
    }
    reqState.earlyChunks = [];
  }

  if (reqState.bodyComplete) {
    localReq.end();
  }

  localReq.on('error', (err) => {
    console.error(`[PROXY ERROR] ${msg.method} ${safePath} -> ${LOCAL_HOST}:${localPort}: ${err.message}`);
    clearTimeout(reqState.timeout);
    activeRequests.delete(msg.id);
    // send502 handles destroy + tunnel notification in one place.
    send502(msg.id, msg.method, safePath, localReq);
  });
}

// ─── Graceful Shutdown
const gracefulExit = () => {
  tunnel.disconnect();
  destroyUI();
  process.exit(0);
};

process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit);
