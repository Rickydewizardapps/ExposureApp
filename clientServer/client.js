#!/usr/bin/env node

import http from 'http';
import { parseArgs } from 'util';
import { C } from './src/colors.js';
import { CONFIG, validateConfig } from './src/config.js';
import {
  setConnecting, setOnline, setReconnecting,
  logRequest, destroyUI, uiActive, setRestartCallback,
} from './src/cli.js';
import { getStoredToken, saveToken, saveSubdomain } from './src/auth.js';
import { getClientErrorPage } from './src/clientError.js';
import { TunnelConnection } from './src/connection.js';

try {
  validateConfig();
} catch (err) {
  console.error(`${C.error}✖${C.reset} ${err.message}`);
  process.exit(1);
}

const { relay, tls, local, app } = CONFIG;

const HELP = `
 ${C.brandBold}ApexTunnel v${app.version}${C.reset} — expose localhost to the internet

 ${C.brandBold}Usage:${C.reset}
   ${C.text}apex http <port>${C.reset}              ${C.dim}Expose a local port${C.reset}
   ${C.text}apex http <port> --subdomain <name>${C.reset}  ${C.dim}Expose with a custom subdomain${C.reset}
   ${C.text}apex authtoken <token>${C.reset}     ${C.dim}Save your auth token${C.reset}
   ${C.text}apex status${C.reset}                ${C.dim}Show saved token & relay info${C.reset}
   ${C.text}apex help${C.reset}                  ${C.dim}Show this message${C.reset}

 ${C.brandBold}Examples:${C.reset}
   ${C.dim}apex http 3000${C.reset}
   ${C.dim}apex http 3000 --subdomain myapp${C.reset}
   ${C.dim}apex authtoken eyJhbGciOiJIUzI1NiJ9...${C.reset}

 ${C.brandBold}Env overrides:${C.reset}
   ${C.text}APEX_RELAY${C.reset}       ${C.dim}Relay hostname (default: relay.apextunnel.top)${C.reset}
   ${C.text}APEX_RELAY_PORT${C.reset}  ${C.dim}Relay port (default: 9000)${C.reset}
   ${C.text}APEX_TLS${C.reset}         ${C.dim}Enable TLS on tunnel (default: false)${C.reset}
   ${C.text}APEX_TLS_CA${C.reset}      ${C.dim}Path to CA certificate for self-signed TLS${C.reset}
   ${C.text}APEX_LOCAL_HOST${C.reset}  ${C.dim}Local app hostname (default: localhost)${C.reset}
`.trimStart();

const argv = process.argv.slice(2);
const [cmd = ''] = argv;

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  process.stdout.write(HELP);
  process.exit(0);
}

if (cmd === '--version' || cmd === '-v') {
  console.log(`${C.brandBold}apex v${app.version}${C.reset}`);
  process.exit(0);
}

if (cmd === 'authtoken') {
  const rawToken = argv[1];
  if (!rawToken || !rawToken.trim()) {
    console.error(`${C.error}✖${C.reset} ${C.text}Usage:${C.reset} apex authtoken <token>`);
    process.exit(1);
  }
  try {
    saveToken(rawToken);
    console.log(`${C.success}✔${C.reset} Authtoken saved successfully.`);
    process.exit(0);
  } catch (err) {
    console.error(`${C.error}✖${C.reset} ${err.message}`);
    process.exit(1);
  }
}

if (cmd === 'status') {
  const stored = getStoredToken();
  if (!stored) {
    console.log(`${C.warning}○${C.reset} No auth token saved.`);
    console.log(`   ${C.dim}Run: apex authtoken <token>${C.reset}`);
  } else {
    const masked = stored.slice(0, 8) + '••••••••' + stored.slice(-4);
    console.log(`${C.success}✔${C.reset} Token : ${C.text}${masked}${C.reset}`);
    console.log(`   ${C.dim}Relay : ${relay.host}:${relay.port} ${tls.enabled ? '(TLS)' : ''}${C.reset}`);
  }
  process.exit(0);
}

if (cmd !== 'http') {
  console.error(`${C.error}✖${C.reset} Unknown command: "${cmd}". Run: apex help`);
  console.error(`\n${C.brandBold}Available commands:${C.reset}`);
  console.error(`  ${C.text}http <port> [--subdomain <name>]${C.reset}`);
  console.error(`  ${C.text}authtoken <token>${C.reset}`);
  console.error(`  ${C.text}status${C.reset}`);
  console.error(`  ${C.text}help${C.reset}`);
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

const rawPort = positionals[0] ?? String(local.defaultPort);
const localPort = Number(rawPort);

if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
  console.error(`${C.error}✖${C.reset} Invalid port: "${rawPort}". Must be 1–65535.`);
  process.exit(1);
}

const token = getStoredToken();
if (!token) {
  console.error(`${C.error}✖${C.reset} No auth token found. Run: apex authtoken <token>`);
  process.exit(1);
}

const activeRequests = new Map();

setConnecting(String(localPort));

const tunnel = new TunnelConnection({
  host: relay.host,
  port: relay.port,
  token,
  subdomain: values.subdomain || '',
  localPort,
  useTls: tls.enabled,
  caPath: tls.caPath,
  onRegistered: (info) => {
    if (info.subdomain) saveSubdomain(info.subdomain);
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
    console.error(`${C.error}✖${C.reset} ${String(err.message ?? 'Unknown server error')}`);
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
          if (!writable) req.paused = true;
        } else {
          req.earlyChunks.push(msg.data);
        }
      }
    } else if (msg.type === 'bodyEnd') {
      const req = activeRequests.get(msg.id);
      if (req) {
        req.bodyComplete = true;
        if (req.localReq) req.localReq.end();
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

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

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

  const safePath = typeof msg.url === 'string' && msg.url.startsWith('/') ? msg.url : '/';

  reqState.timeout = setTimeout(() => {
    if (!activeRequests.has(msg.id)) return;
    activeRequests.delete(msg.id);
    send502(msg.id, msg.method, safePath, reqState.localReq);
  }, 60000);

  const headers = {};
  for (const [key, val] of Object.entries(msg.headers ?? {})) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers[key] = val;
  }
  headers['host'] = `${local.host}:${localPort}`;

  const localReq = http.request({
    hostname: local.host,
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

    localRes.on('data', (chunk) => tunnel.sendBodyChunk(msg.id, chunk));
    localRes.on('end', () => {
      tunnel.sendBodyEnd(msg.id);
      logRequest(msg.method, safePath, localRes.statusCode);
      clearTimeout(reqState.timeout);
      activeRequests.delete(msg.id);
    });
    localRes.on('error', (err) => {
      console.error(`[PROXY] Response stream error: ${err.message}`);
      tunnel.sendBodyEnd(msg.id);
      logRequest(msg.method, safePath, 502);
      clearTimeout(reqState.timeout);
      activeRequests.delete(msg.id);
    });
  });

  reqState.localReq = localReq;
  localReq.on('drain', () => { reqState.paused = false; });

  if (reqState.earlyChunks.length > 0) {
    for (const chunk of reqState.earlyChunks) {
      const writable = localReq.write(chunk);
      if (!writable) reqState.paused = true;
    }
    reqState.earlyChunks = [];
  }

  if (reqState.bodyComplete) localReq.end();

  localReq.on('error', (err) => {
    console.error(`[PROXY ERROR] ${msg.method} ${safePath} -> ${local.host}:${localPort}: ${err.message}`);
    clearTimeout(reqState.timeout);
    activeRequests.delete(msg.id);
    send502(msg.id, msg.method, safePath, localReq);
  });
}

const gracefulExit = () => {
  tunnel.disconnect();
  destroyUI();
  process.exit(0);
};

process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit);
