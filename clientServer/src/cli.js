import blessed from 'blessed';
import { exec } from 'child_process';

// ─── State

let screen = null;
let statusBox = null;
let requestLog = null;
let commandInput = null;
let requestLines = [];
let currentInfo = {};
let restartCallback = null;

export let uiActive = false;

const MAX_LOG_LINES = 200;

// Detect Termux once at startup
const isTermux = typeof process.env.TERMUX_VERSION === 'string'
  || (typeof process.env.PREFIX === 'string' && process.env.PREFIX.includes('com.termux'));

// ─── UI Construction

const buildUI = () => {
  screen = blessed.screen({
    smartCSR: true,
    title: 'ApexTunnel',
    fullUnicode: true,
  });

  statusBox = blessed.box({
    top: 0, left: 0,
    width: '100%', height: 8,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    tags: true,
  });

  const separator = blessed.line({
    top: 8,
    left: 0,
    width: '100%',
    orientation: 'horizontal',
    style: { fg: 'cyan' },
  });

  const requestsLabel = blessed.text({
    top: 9,
    left: 2,
    content: ' Requests ',
    style: { fg: 'cyan', bold: true },
  });

  requestLog = blessed.box({
    top: 10,
    left: 0,
    width: '100%',
    height: '100%-13',
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    content: ' Waiting for requests…',
  });

  commandInput = blessed.textbox({
    bottom: 0,
    left: 0,
    height: 3,
    width: '100%',
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    label: ' Command (type "h" for help) ',
    inputOnFocus: true,
  });

  screen.append(statusBox);
  screen.append(separator);
  screen.append(requestsLabel);
  screen.append(requestLog);
  screen.append(commandInput);

  commandInput.on('submit', (value) => {
    handleCommand(value);
    commandInput.clearValue();
    commandInput.focus();
    screen.render();
  });

  screen.key(['q', 'C-c'], () => { destroyUI(); process.exit(0); });
  screen.key(['r'], () => handleCommand('restart'));
  screen.key(['c'], () => handleCommand('clear'));
  screen.key(['h'], () => handleCommand('help'));
  screen.key(['o'], () => handleCommand('open'));

  commandInput.focus();
};

// ─── Browser Open

const openInBrowser = (url) => {
  let bin;
  if (isTermux) bin = 'termux-open-url';
  else if (process.platform === 'darwin') bin = 'open';
  else if (process.platform === 'win32') bin = 'start';
  else bin = 'xdg-open';

  exec(`${bin} ${url}`, (err) => {
    if (err) addLog(`{red-fg} Failed to open browser: ${err.message}{/red-fg}`);
  });
};

// ─── Command Handler

const handleCommand = (cmd) => {
  const c = cmd.trim().toLowerCase();
  if (!c) return;

  switch (c) {
    case 'open':
    case 'o':
      if (currentInfo.subdomain) {
        const url = `https://${currentInfo.subdomain}.apextunnel.top`;
        openInBrowser(url);
        addLog(`{cyan-fg} Opening ${url} in browser…{/cyan-fg}`);
      } else {
        addLog('{red-fg} Error: No active subdomain to open.{/red-fg}');
      }
      break;

    case 'restart':
    case 'r':
      addLog('{yellow-fg} Restarting tunnel…{/yellow-fg}');
      restartCallback?.();
      break;

    case 'clear':
    case 'c':
      requestLines = [];
      requestLog.setContent(' Waiting for requests…');
      break;

    case 'help':
    case 'h':
      addLog([
        '{bold}Available Commands:{/bold}',
        ' {cyan-fg}open / o{/cyan-fg} - Open tunnel URL in browser',
        ' {cyan-fg}help / h{/cyan-fg} - Show this list',
        ' {cyan-fg}restart / r{/cyan-fg} - Re-establish connection',
        ' {cyan-fg}clear / c{/cyan-fg} - Wipe request history',
        ' {cyan-fg}exit / q{/cyan-fg} - Close ApexTunnel',
      ].join('\n'));
      break;

    case 'exit':
    case 'q':
      destroyUI();
      process.exit(0);
      break;

    default:
      addLog(`{red-fg} Unknown command: "${c}". Press H for help.{/red-fg}`);
  }

  screen?.render();
};

// ─── Status Render

const renderStatus = () => {
  if (!statusBox || !screen) return;

  statusBox.setContent([
    ` {bold}ApexTunnel v2.0.0{/bold}`,
    ` ─────────────────────────────────────────`,
    ` Account     ${currentInfo.email || 'connecting…'} (${currentInfo.isPremium ? 'Premium ★' : 'Free'})`,
    ` Status      ${currentInfo.online ? '{green-fg}● online{/green-fg}' : '{yellow-fg}○ connecting…{/yellow-fg}'}`,
    ` Forwarding  ${
      currentInfo.subdomain
        ? `{cyan-fg}https://${currentInfo.subdomain}.apextunnel.top{/cyan-fg} → localhost:${currentInfo.port}`
        : '{yellow-fg}pending…{/yellow-fg}'
    }`,
    ` ─────────────────────────────────────────`,
    ` Press {bold}O{/bold} open browser | {bold}H{/bold} help | {bold}Q{/bold} quit`,
  ].join('\n'));

  screen.render();
};

// ─── Exports

export const setConnecting = (port) => {
  if (!screen) { uiActive = true; buildUI(); }
  currentInfo = { ...currentInfo, online: false, port };
  renderStatus();
};

export const setOnline = (info) => {
  currentInfo = { ...currentInfo, ...info, online: true };
  renderStatus();
};

export const setReconnecting = () => {
  currentInfo = { ...currentInfo, online: false };
  renderStatus();
  addLog('{yellow-fg} Tunnel closed. Reconnecting…{/yellow-fg}');
};

export const addLog = (line) => {
  if (!requestLog || !screen) return;
  requestLines.push(line);
  if (requestLines.length > MAX_LOG_LINES) {
    requestLines = requestLines.slice(-MAX_LOG_LINES);
  }
  requestLog.setContent(requestLines.join('\n'));
  requestLog.setScrollPerc(100);
  screen.render();
};

export const logRequest = (method, url, status) => {
  if (!screen) return;
  const time = new Date().toLocaleTimeString();
  const color = status >= 500 ? 'red-fg' : status >= 400 ? 'yellow-fg' : 'green-fg';
  addLog(` {bold}${time}{/bold} {cyan-fg}${method.padEnd(7)}{/cyan-fg} ${url} {${color}}${status}{/${color}}`);
};

export const destroyUI = () => {
  if (screen) {
    screen.destroy();
    screen = null;
    statusBox = null;
    requestLog = null;
    commandInput = null;
  }
  uiActive = false;
};

export const setRestartCallback = (cb) => {
  restartCallback = cb;
};
