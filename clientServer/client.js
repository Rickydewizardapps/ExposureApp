#!/usr/bin/env node
import http from 'http';
import { parseArgs } from 'util';
import {
  setConnecting, setOnline, setReconnecting,
  logRequest, destroyUI, uiActive, setRestartCallback,
} from './src/cli.js';
import { getStoredToken, saveToken } from './src/auth.js';
import { getClientErrorPage } from './src/clientError.js';
import { TunnelConnection } from './src/connection.js';

// ─── Constants
const RELAY_HOST = process.env.APEX_RELAY ?? 'relay.apextunnel.top';
const RELAY_PORT = Number(process.env.APEX_RELAY_PORT ?? '9000');
const USE_TLS = process.env.APEX_TLS === 'true' || process.env.APEX_TLS === '1';
const TLS_CA_PATH = process.env.APEX_TLS_CA || null;
const DEFAULT_LOCAL_PORT = 8080;
const VERSION = '2.0.0';

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
const activeRequests = new Map();

// ─── Bootstrap
setConnecting(String(localPort));

const tunnel = new TunnelConnection({
  host: RELAY_HOST,
  port: RELAY_PORT,
  token,
  subdomain: values.subdomain,
  localPort,
  useTls: USE_TLS,
  caPath: TLS_CA_PATH,
  onRegistered: (info) => {
    setOnline({ ...info, port: String(localPort) });
  },
  onError: (err) => {
    if (err.type === 'reconnecting') {
      setReconnecting();
      return;
    }
    destroyUI();
    console.error('\x1b[31m✖\x1b[0m ' + String(err.message ?? 'Unknown server error'));
    if (err.code !== 'SUBDOMAIN_IN_USE') {
      process.exit(1);
    }
  },
  onRequest: (msg) => {
    if (msg.type === 'request') {
      proxyRequest(msg);
    } else if (msg.type === 'bodyChunk') {
      const req = activeRequests.get(msg.id);
      if (req && !req.bodyComplete) {
        if (req.localReq) {
          req.localReq.write(msg.data);
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

function proxyRequest(msg) {
  const reqState = {
    bodyComplete: !msg.bodyExpected,
    localReq: null,
    earlyChunks: [],
  };
  activeRequests.set(msg.id, reqState);

  reqState.timeout = setTimeout(() => {
    if (activeRequests.has(msg.id)) {
      activeRequests.delete(msg.id);
      try { reqState.localReq?.destroy(); } catch {}
    }
  }, 60000);

  const headers = {};
  for (const [key, val] of Object.entries(msg.headers ?? {})) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers[key] = val;
    }
  }
  headers['host'] = `localhost:${localPort}`;

  const safePath = typeof msg.url === 'string' && msg.url.startsWith('/')
    ? msg.url
    : '/';

  const localReq = http.request({
    hostname: 'localhost',
    port: localPort,
    path: safePath,
    method: msg.method,
    headers,
  }, (localRes) => {
    const noBodyStatus = [204, 304];
    const hasBody = !noBodyStatus.includes(localRes.statusCode) && msg.method !== 'HEAD';

    tunnel.sendResponseStart(msg.id, localRes.statusCode, localRes.headers, hasBody);

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

    localRes.on('error', () => {
      tunnel.sendResponseStart(msg.id, 502, { 'content-type': 'text/html' }, false);
      clearTimeout(reqState.timeout);
      activeRequests.delete(msg.id);
    });
  });

  reqState.localReq = localReq;

  if (reqState.earlyChunks.length > 0) {
    for (const chunk of reqState.earlyChunks) {
      localReq.write(chunk);
    }
  }

  if (reqState.bodyComplete) {
    localReq.end();
  }

  localReq.on('error', () => {
    const html = getClientErrorPage(localPort);
    tunnel.sendResponseStart(msg.id, 502, {
      'content-type': 'text/html',
      'content-length': String(Buffer.byteLength(html)),
    }, true);
    tunnel.sendBodyChunk(msg.id, Buffer.from(html));
    tunnel.sendBodyEnd(msg.id);
    logRequest(msg.method, safePath, 502);
    clearTimeout(reqState.timeout);
    activeRequests.delete(msg.id);
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
