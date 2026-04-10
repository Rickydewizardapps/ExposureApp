import blessed from 'blessed';

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

  // Top Status Bar
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

  // Main Log Area - Now full width
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
    label: ' Command (type "help" for list) ',
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

  // Global Key bindings
  screen.key(['q', 'C-c'], () => {
    destroyUI();
    process.exit(0);
  });

  screen.key(['r'], () => {
    handleCommand('restart');
  });

  screen.key(['c'], () => {
    handleCommand('clear');
  });

  screen.key(['h'], () => {
    handleCommand('help');
  });

  // Focus command input by default
  commandInput.focus();
};

const handleCommand = (cmd) => {
  const cleanCmd = cmd.trim().toLowerCase();
  if (!cleanCmd) return;

  if (cleanCmd === 'restart' || cleanCmd === 'r') {
    addLog('{yellow-fg}  Restarting tunnel…{/yellow-fg}');
    process.emit('apexRestart');
  } else if (cleanCmd === 'clear' || cleanCmd === 'c') {
    requestLines = [];
    requestLog.setContent('  Waiting for requests…');
  } else if (cleanCmd === 'help' || cleanCmd === 'h') {
    addLog([
      '{bold}Available Commands:{/bold}',
      '  {cyan-fg}help / h{/cyan-fg}    - Show this list',
      '  {cyan-fg}restart / r{/cyan-fg} - Re-establish connection',
      '  {cyan-fg}clear / c{/cyan-fg}   - Wipe request history',
      '  {cyan-fg}exit / q{/cyan-fg}    - Close ApexTunnel'
    ].join('\n'));
  } else if (cleanCmd === 'exit' || cleanCmd === 'q') {
    process.exit(0);
  } else {
    addLog(`{red-fg}Unknown command: ${cleanCmd}{/red-fg}`);
  }
  screen.render();
};

// Keep existing helper functions for status and logging
export const renderStatus = () => {
  if (!statusBox || !screen) return;
  const accountDisplay = currentInfo.email || 'connecting…';
  const tier = currentInfo.isPremium ? 'Premium ★' : 'Free';
  
  statusBox.setContent(
    [
      `  {bold}ApexTunnel v1.0.0{/bold}`,
      `  ─────────────────────────────────────────`,
      `  Account     ${accountDisplay} (${tier})`,
      `  Status      ${currentInfo.online ? '{green-fg}● online{/green-fg}' : '{yellow-fg}○ connecting…{/yellow-fg}'}`,
      `  Forwarding  ${currentInfo.subdomain ? `{cyan-fg}https://${currentInfo.subdomain}.apextunnel.top{/cyan-fg} → localhost:${currentInfo.port}` : '{yellow-fg}pending…{/yellow-fg}'}`,
      `  ─────────────────────────────────────────`,
      `  Type commands in bottom bar | {bold}h{/bold} for help`,
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
  const time  = new Date().toLocaleTimeString();
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
