import blessed from 'blessed';
import { exec } from 'child_process'; 

// State
let screen       = null;
let statusBox    = null;
let requestLog   = null;
let commandInput = null;
let requestLines = [];
let currentInfo  = {};

export let uiActive = false;
const MAX_LOG_LINES = 200;

// UI construction
const buildUI = () => {
  screen = blessed.screen({
    smartCSR: true,
    title: 'ApexTunnel',
    fullUnicode: true
  });

  statusBox = blessed.box({
    top: 0, left: 0,
    width: '100%', height: 8,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    tags: true,
  });

  const separator = blessed.line({
    top: 8, left: 0,
    width: '100%',
    orientation: 'horizontal',
    style: { fg: 'cyan' },
  });

  const requestsLabel = blessed.text({
    top: 9, left: 2,
    content: ' Requests ',
    style: { fg: 'cyan', bold: true },
  });

  // Main Log Area
  requestLog = blessed.box({
    top: 10, left: 0,
    width: '100%', height: '100%-13',
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    content: '  Waiting for requests…',
  });

  // Command Input (Bottom Bar)
  commandInput = blessed.textbox({
    bottom: 0, left: 0,
    height: 3, width: '100%',
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    label: ' Command (type "h" for help) ',
    inputOnFocus: true
  });

  screen.append(statusBox);
  screen.append(separator);
  screen.append(requestsLabel);
  screen.append(requestLog);
  screen.append(commandInput);

  // Input Handling
  commandInput.on('submit', (value) => {
    handleCommand(value);
    commandInput.clearValue();
    commandInput.focus();
    screen.render();
  });

  // Key bindings
  screen.key(['q', 'C-c'], () => {
    destroyUI();
    process.exit(0);
  });

  screen.key(['r'], () => handleCommand('restart'));
  screen.key(['c'], () => handleCommand('clear'));
  screen.key(['h'], () => handleCommand('help'));
  screen.key(['o'], () => handleCommand('open')); //

  commandInput.focus();
};

const handleCommand = (cmd) => {
  const cleanCmd = cmd.trim().toLowerCase();
  if (!cleanCmd) return;

  if (cleanCmd === 'open' || cleanCmd === 'o') {
    if (currentInfo.subdomain) {
      const url = `https://${currentInfo.subdomain}.apextunnel.top`;
      const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${start} ${url}`); //
      addLog(`{cyan-fg}  Opening ${url} in browser...{/cyan-fg}`);
    } else {
      addLog('{red-fg}  Error: No active subdomain to open.{/red-fg}');
    }
  } else if (cleanCmd === 'restart' || cleanCmd === 'r') {
    addLog('{yellow-fg}  Restarting tunnel…{/yellow-fg}');
    process.emit('apexRestart');
  } else if (cleanCmd === 'clear' || cleanCmd === 'c') {
    requestLines = [];
    requestLog.setContent('  Waiting for requests…');
  } else if (cleanCmd === 'help' || cleanCmd === 'h') {
    addLog([
      '{bold}Available Commands:{/bold}',
      '  {cyan-fg}open / o{/cyan-fg}     - Open link in browser',
      '  {cyan-fg}help / h{/cyan-fg}     - Show this list',
      '  {cyan-fg}restart / r{/cyan-fg}  - Re-establish connection',
      '  {cyan-fg}clear / c{/cyan-fg}    - Wipe request history',
      '  {cyan-fg}exit / q{/cyan-fg}     - Close ApexTunnel'
    ].join('\n'));
  } else if (cleanCmd === 'exit' || cleanCmd === 'q') {
    destroyUI();
    process.exit(0);
  } else {
    addLog(`{red-fg}Unknown command: ${cleanCmd}{/red-fg}`);
  }
  screen.render();
};

const renderStatus = () => {
  if (!statusBox || !screen) return;

  statusBox.setContent(
    [
      `  {bold}ApexTunnel v1.0.1{/bold}`,
      `  ─────────────────────────────────────────`,
      `  Account     ${currentInfo.email || 'connecting…'} (${currentInfo.isPremium ? 'Premium ★' : 'Free'})`,
      `  Status      ${currentInfo.online ? '{green-fg}● online{/green-fg}' : '{yellow-fg}○ connecting…{/yellow-fg}'}`,
      `  Forwarding  ${currentInfo.subdomain 
          ? `{cyan-fg}https://${currentInfo.subdomain}.apextunnel.top{/cyan-fg} → localhost:${currentInfo.port}` 
          : '{yellow-fg}pending…{/yellow-fg}'}`,
      `  ─────────────────────────────────────────`,
      `  Press {bold}O{/bold} open browser | {bold}H{/bold} help | {bold}Q{/bold} quit`,
    ].join('\n'),
  );

  screen.render();
};

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
  // Fixed: Keep the email during reconnection blips
  currentInfo = { ...currentInfo, online: false };
  renderStatus();
  addLog('{yellow-fg}  Tunnel closed. Reconnecting…{/yellow-fg}');
};

export const addLog = (line) => {
  if (!requestLog || !screen) return;
  requestLines.push(line);
  if (requestLines.length > MAX_LOG_LINES) requestLines = requestLines.slice(-MAX_LOG_LINES);
  requestLog.setContent(requestLines.join('\n'));
  requestLog.setScrollPerc(100);
  screen.render();
};

export const logRequest = (method, url, status) => {
  if (!screen) return;
  const time = new Date().toLocaleTimeString();
  const color = status >= 500 ? 'red-fg' : status >= 400 ? 'yellow-fg' : 'green-fg';
  addLog(`  {bold}${time}{/bold}  {cyan-fg}${method.padEnd(7)}{/cyan-fg}  ${url}  {${color}}${status}{/${color}}`);
};

export const destroyUI = () => {
  if (screen) {
    screen.destroy();
    screen = null;
    statusBox = null;
    requestLog = null;
  }
  uiActive = false;
};
