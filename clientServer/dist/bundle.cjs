#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// client.js
var import_net = __toESM(require("net"), 1);
var import_http = __toESM(require("http"), 1);
var import_util = require("util");

// src/cli.js
var import_blessed = __toESM(require("blessed"), 1);
var import_child_process = require("child_process");
var screen = null;
var statusBox = null;
var requestLog = null;
var commandInput = null;
var requestLines = [];
var currentInfo = {};
var uiActive = false;
var MAX_LOG_LINES = 200;
var isTermux = typeof process.env.TERMUX_VERSION === "string" || typeof process.env.PREFIX === "string" && process.env.PREFIX.includes("com.termux");
var buildUI = () => {
  screen = import_blessed.default.screen({
    smartCSR: true,
    title: "ApexTunnel",
    fullUnicode: true
  });
  statusBox = import_blessed.default.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 8,
    border: { type: "line" },
    style: { border: { fg: "cyan" } },
    tags: true
  });
  const separator = import_blessed.default.line({
    top: 8,
    left: 0,
    width: "100%",
    orientation: "horizontal",
    style: { fg: "cyan" }
  });
  const requestsLabel = import_blessed.default.text({
    top: 9,
    left: 2,
    content: " Requests ",
    style: { fg: "cyan", bold: true }
  });
  requestLog = import_blessed.default.box({
    top: 10,
    left: 0,
    width: "100%",
    height: "100%-13",
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    content: "  Waiting for requests\u2026"
  });
  commandInput = import_blessed.default.textbox({
    bottom: 0,
    left: 0,
    height: 3,
    width: "100%",
    border: { type: "line" },
    style: { border: { fg: "cyan" } },
    label: ' Command (type "h" for help) ',
    inputOnFocus: true
  });
  screen.append(statusBox);
  screen.append(separator);
  screen.append(requestsLabel);
  screen.append(requestLog);
  screen.append(commandInput);
  commandInput.on("submit", (value) => {
    handleCommand(value);
    commandInput.clearValue();
    commandInput.focus();
    screen.render();
  });
  screen.key(["q", "C-c"], () => {
    destroyUI();
    process.exit(0);
  });
  screen.key(["r"], () => handleCommand("restart"));
  screen.key(["c"], () => handleCommand("clear"));
  screen.key(["h"], () => handleCommand("help"));
  screen.key(["o"], () => handleCommand("open"));
  commandInput.focus();
};
var openInBrowser = (url) => {
  let bin;
  if (isTermux)
    bin = "termux-open-url";
  else if (process.platform === "darwin")
    bin = "open";
  else if (process.platform === "win32")
    bin = "start";
  else
    bin = "xdg-open";
  (0, import_child_process.exec)(`${bin} ${url}`, (err) => {
    if (err)
      addLog(`{red-fg}  Failed to open browser: ${err.message}{/red-fg}`);
  });
};
var handleCommand = (cmd2) => {
  const c = cmd2.trim().toLowerCase();
  if (!c)
    return;
  switch (c) {
    case "open":
    case "o":
      if (currentInfo.subdomain) {
        const url = `https://${currentInfo.subdomain}.apextunnel.top`;
        openInBrowser(url);
        addLog(`{cyan-fg}  Opening ${url} in browser\u2026{/cyan-fg}`);
      } else {
        addLog("{red-fg}  Error: No active subdomain to open.{/red-fg}");
      }
      break;
    case "restart":
    case "r":
      addLog("{yellow-fg}  Restarting tunnel\u2026{/yellow-fg}");
      process.emit("apexRestart");
      break;
    case "clear":
    case "c":
      requestLines = [];
      requestLog.setContent("  Waiting for requests\u2026");
      break;
    case "help":
    case "h":
      addLog([
        "{bold}Available Commands:{/bold}",
        "  {cyan-fg}open / o{/cyan-fg}     - Open tunnel URL in browser",
        "  {cyan-fg}help / h{/cyan-fg}     - Show this list",
        "  {cyan-fg}restart / r{/cyan-fg}  - Re-establish connection",
        "  {cyan-fg}clear / c{/cyan-fg}    - Wipe request history",
        "  {cyan-fg}exit / q{/cyan-fg}     - Close ApexTunnel"
      ].join("\n"));
      break;
    case "exit":
    case "q":
      destroyUI();
      process.exit(0);
      break;
    default:
      addLog(`{red-fg}  Unknown command: "${c}". Press H for help.{/red-fg}`);
  }
  screen?.render();
};
var renderStatus = () => {
  if (!statusBox || !screen)
    return;
  statusBox.setContent([
    `  {bold}ApexTunnel v1.1.3{/bold}`,
    `  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
    `  Account     ${currentInfo.email || "connecting\u2026"} (${currentInfo.isPremium ? "Premium \u2605" : "Free"})`,
    `  Status      ${currentInfo.online ? "{green-fg}\u25CF online{/green-fg}" : "{yellow-fg}\u25CB connecting\u2026{/yellow-fg}"}`,
    `  Forwarding  ${currentInfo.subdomain ? `{cyan-fg}https://${currentInfo.subdomain}.apextunnel.top{/cyan-fg} \u2192 localhost:${currentInfo.port}` : "{yellow-fg}pending\u2026{/yellow-fg}"}`,
    `  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
    `  Press {bold}O{/bold} open browser | {bold}H{/bold} help | {bold}Q{/bold} quit`
  ].join("\n"));
  screen.render();
};
var setConnecting = (port) => {
  if (!screen) {
    uiActive = true;
    buildUI();
  }
  currentInfo = { ...currentInfo, online: false, port };
  renderStatus();
};
var setOnline = (info) => {
  currentInfo = { ...currentInfo, ...info, online: true };
  renderStatus();
};
var setReconnecting = () => {
  currentInfo = { ...currentInfo, online: false };
  renderStatus();
  addLog("{yellow-fg}  Tunnel closed. Reconnecting\u2026{/yellow-fg}");
};
var addLog = (line) => {
  if (!requestLog || !screen)
    return;
  requestLines.push(line);
  if (requestLines.length > MAX_LOG_LINES) {
    requestLines = requestLines.slice(-MAX_LOG_LINES);
  }
  requestLog.setContent(requestLines.join("\n"));
  requestLog.setScrollPerc(100);
  screen.render();
};
var logRequest = (method, url, status) => {
  if (!screen)
    return;
  const time = (/* @__PURE__ */ new Date()).toLocaleTimeString();
  const color = status >= 500 ? "red-fg" : status >= 400 ? "yellow-fg" : "green-fg";
  addLog(`  {bold}${time}{/bold}  {cyan-fg}${method.padEnd(7)}{/cyan-fg}  ${url}  {${color}}${status}{/${color}}`);
};
var destroyUI = () => {
  if (screen) {
    screen.destroy();
    screen = null;
    statusBox = null;
    requestLog = null;
    commandInput = null;
  }
  uiActive = false;
};

// src/auth.js
var import_fs = __toESM(require("fs"), 1);
var import_os = __toESM(require("os"), 1);
var import_path = __toESM(require("path"), 1);
var CONFIG_PATH = import_path.default.join(import_os.default.homedir(), ".apextunnel");
var MIN_TOKEN_LEN = 64;
function saveToken(token2) {
  if (!token2 || typeof token2 !== "string") {
    throw new Error("Invalid token.");
  }
  const trimmed = token2.trim();
  if (trimmed.length < MIN_TOKEN_LEN) {
    throw new Error(`Token too short. Must be at least ${MIN_TOKEN_LEN} characters.`);
  }
  if (!/^[A-Za-z0-9\-_.]+$/.test(trimmed)) {
    throw new Error("Token contains invalid characters.");
  }
  try {
    import_fs.default.writeFileSync(
      CONFIG_PATH,
      JSON.stringify({ token: trimmed }, null, 2),
      { mode: 384 }
      // owner read/write only
    );
  } catch (err) {
    throw new Error(`Failed to save token: ${err.message}`);
  }
}
function getStoredToken() {
  try {
    const raw = import_fs.default.readFileSync(CONFIG_PATH, "utf8");
    const data = JSON.parse(raw);
    const tok = data?.token;
    return typeof tok === "string" && tok.trim().length >= MIN_TOKEN_LEN ? tok.trim() : null;
  } catch {
    return null;
  }
}

// src/clientError.js
var getClientErrorPage = (port) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>502 | Local App Unreachable</title>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        body { 
            background: #0f172a; color: #f8fafc; 
            font-family: 'Inter', system-ui, -apple-system, sans-serif; 
            display: flex; align-items: center; justify-content: center; 
            height: 100vh; margin: 0; text-align: center; 
        }
        .card { 
            padding: 3.5rem 2.5rem; border: 1px solid #1e293b; border-radius: 28px; 
            background: rgba(30, 41, 59, 0.4); backdrop-filter: blur(16px); 
            max-width: 460px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            position: relative;
        }
        .status-code {
            font-size: 6rem; font-weight: 900; margin: 0;
            background: linear-gradient(to bottom, #f43f5e, #9f1239);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            line-height: 1; margin-bottom: 1rem;
        }
        h1 { font-size: 1.85rem; margin: 0 0 1rem; color: #f8fafc; font-weight: 800; }
        p { color: #94a3b8; line-height: 1.6; margin-bottom: 2.5rem; font-size: 1.05rem; }
        p b { color: #38bdf8; }
        .btn { 
            background: #f43f5e; color: #f8fafc; padding: 0.9rem 2.5rem; 
            border-radius: 12px; text-decoration: none; font-weight: 700; 
            transition: all 0.2s ease; display: inline-block; border: none; 
            cursor: pointer; font-family: inherit; font-size: 1rem;
        }
        .btn:hover { transform: translateY(-2px); filter: brightness(1.1); box-shadow: 0 10px 15px -3px rgba(244, 63, 94, 0.3); }
        .footer { 
            margin-top: 3.5rem; font-size: 0.7rem; color: #475569; 
            letter-spacing: 2px; text-transform: uppercase; font-weight: 600; 
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="status-code">502</div>
        <h1>Local App Unreachable</h1>
        <p>The tunnel is active, but your local server on port <b>${port}</b> is not responding.</p>
        <button onclick="window.location.reload()" class="btn">Retry Connection</button>
        <div class="footer">ApexTunnel V1.1.3 \u2022 BraveraTech</div>
    </div>
</body>
</html>
`;

// client.js
var RELAY_HOST = process.env.APEX_RELAY ?? "relay.apextunnel.top.";
var RELAY_PORT = Number(process.env.APEX_RELAY_PORT ?? "9000");
var DEFAULT_LOCAL_PORT = 8080;
var VERSION = "1.1.3";
var HELP = `
  \x1B[1mApexTunnel v${VERSION}\x1B[0m \u2014 expose localhost to the internet

  \x1B[1mUsage:\x1B[0m
    apex http <port>                       Expose a local port
    apex http <port> --subdomain <name>    Expose with a custom subdomain
    apex authtoken <token>                 Save your auth token
    apex status                            Show saved token & relay info
    apex help                              Show this message

  \x1B[1mExamples:\x1B[0m
    apex http 3000
    apex http 3000 --subdomain myapp
    apex authtoken eyJhbGciOiJIUzI1NiJ9...

  \x1B[1mEnv overrides (for debugging):\x1B[0m
    APEX_RELAY          Relay hostname  (default: relay.apextunnel.top)
    APEX_RELAY_PORT     Relay port      (default: 9000)
`.trimStart();
var argv = process.argv.slice(2);
var [cmd = ""] = argv;
if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(HELP);
  process.exit(0);
}
if (cmd === "--version" || cmd === "-v") {
  console.log(`apex v${VERSION}`);
  process.exit(0);
}
if (cmd === "authtoken") {
  const rawToken = argv[1];
  if (!rawToken || !rawToken.trim()) {
    console.error("\x1B[31m\u2716\x1B[0m Usage: apex authtoken <token>");
    process.exit(1);
  }
  try {
    saveToken(rawToken);
    console.log("\x1B[32m\u2714\x1B[0m Authtoken saved successfully.");
    process.exit(0);
  } catch (err) {
    console.error(`\x1B[31m\u2716\x1B[0m ${err.message}`);
    process.exit(1);
  }
}
if (cmd === "status") {
  const stored = getStoredToken();
  if (!stored) {
    console.log("\x1B[33m\u25CB\x1B[0m  No auth token saved.");
    console.log("   Run: apex authtoken <token>");
  } else {
    const masked = stored.slice(0, 8) + "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" + stored.slice(-4);
    console.log(`\x1B[32m\u2714\x1B[0m  Token   : ${masked}`);
    console.log(`   Relay   : ${RELAY_HOST}:${RELAY_PORT}`);
  }
  process.exit(0);
}
if (cmd !== "http") {
  console.error(`\x1B[31m\u2716\x1B[0m Unknown command: "${cmd}". Run: apex help`);
  process.exit(1);
}
var { values, positionals } = (0, import_util.parseArgs)({
  args: argv.slice(1),
  options: {
    subdomain: { type: "string", default: "" }
  },
  allowPositionals: true,
  strict: true
});
var rawPort = positionals[0] ?? String(DEFAULT_LOCAL_PORT);
var localPort = Number(rawPort);
if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
  console.error(`\x1B[31m\u2716\x1B[0m Invalid port: "${rawPort}". Must be 1\u201365535.`);
  process.exit(1);
}
if (!Number.isInteger(RELAY_PORT) || RELAY_PORT < 1 || RELAY_PORT > 65535) {
  console.error("\x1B[31m\u2716\x1B[0m Invalid APEX_RELAY_PORT value.");
  process.exit(1);
}
var token = getStoredToken();
if (!token) {
  console.error("\x1B[31m\u2716\x1B[0m No auth token found. Run: apex authtoken <token>");
  process.exit(1);
}
var buffer = "";
var tunnel = null;
var intentionalClose = false;
var reconnectDelay = 3e3;
var MAX_RECONNECT_DELAY = 6e4;
setConnecting(String(localPort));
connect();
function connect() {
  buffer = "";
  intentionalClose = false;
  tunnel = import_net.default.connect(RELAY_PORT, RELAY_HOST, () => {
    reconnectDelay = 3e3;
    tunnel.setNoDelay(true);
    tunnel.write(
      JSON.stringify({
        type: "register",
        subdomain: values.subdomain,
        token
      }) + "\n"
    );
  });
  tunnel.on("data", onData);
  tunnel.on("error", (err) => {
    if (!uiActive)
      console.error("[client] Tunnel error:", err.message);
  });
  tunnel.on("close", onClose);
}
function onData(chunk) {
  buffer += chunk.toString();
  const messages = buffer.split("\n");
  buffer = messages.pop();
  for (const raw of messages) {
    if (!raw.trim())
      continue;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg))
      continue;
    if (msg.type === "error") {
      destroyUI();
      console.error("\x1B[31m\u2716\x1B[0m " + String(msg.message ?? "Unknown server error"));
      intentionalClose = true;
      tunnel.destroy();
      process.exit(1);
    }
    if (msg.type === "registered") {
      setOnline({ ...msg, port: String(localPort) });
      continue;
    }
    if (msg.type === "request") {
      proxyRequest(msg);
    }
  }
}
var HOP_BY_HOP = /* @__PURE__ */ new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade"
]);
function proxyRequest(msg) {
  const bodyBuffer = msg.body ? Buffer.from(msg.body, "base64") : Buffer.alloc(0);
  const headers = {};
  for (const [key, val] of Object.entries(msg.headers ?? {})) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers[key] = val;
    }
  }
  if (bodyBuffer.length > 0) {
    headers["content-length"] = String(bodyBuffer.length);
  }
  const safePath = typeof msg.url === "string" && msg.url.startsWith("/") ? msg.url : "/";
  const localReq = import_http.default.request({
    hostname: "127.0.0.1",
    port: localPort,
    path: safePath,
    method: msg.method,
    headers
  }, (localRes) => {
    const chunks = [];
    localRes.on("data", (chunk) => chunks.push(chunk));
    localRes.on("end", () => {
      const bodyBase64 = Buffer.concat(chunks).toString("base64");
      logRequest(msg.method, safePath, localRes.statusCode);
      safeTunnelWrite({
        id: msg.id,
        type: "response",
        statusCode: localRes.statusCode,
        headers: localRes.headers,
        body: bodyBase64
      });
    });
    localRes.on("error", () => localRes.destroy());
  });
  localReq.on("error", () => {
    localReq.destroy();
    const html = getClientErrorPage(localPort);
    logRequest(msg.method, safePath, 502);
    safeTunnelWrite({
      id: msg.id,
      type: "response",
      statusCode: 502,
      headers: {
        "content-type": "text/html",
        "content-length": String(Buffer.byteLength(html))
      },
      body: Buffer.from(html).toString("base64")
    });
  });
  localReq.end(bodyBuffer);
}
function safeTunnelWrite(obj) {
  if (!tunnel || tunnel.destroyed)
    return;
  try {
    tunnel.write(JSON.stringify(obj) + "\n");
  } catch (err) {
    if (!uiActive)
      console.error("[client] Write error:", err.message);
  }
}
function onClose() {
  if (intentionalClose)
    return;
  setReconnecting();
  setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}
var gracefulExit = () => {
  intentionalClose = true;
  destroyUI();
  if (tunnel)
    tunnel.destroy();
  process.exit(0);
};
process.on("SIGINT", gracefulExit);
process.on("SIGTERM", gracefulExit);
