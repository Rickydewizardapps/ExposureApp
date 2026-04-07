import blessed from 'blessed';

let screen;
let requestLog;
let requestLines = [];
let statusBox;
let currentInfo = {};
export let uiActive = false;

const buildUI = () => {
  screen = blessed.screen({
    smartCSR: true,
    title: 'ApexTunnel'
  });

  statusBox = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 8,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    tags: true
  });

  const separator = blessed.line({
    top: 8,
    left: 0,
    width: '100%',
    orientation: 'horizontal',
    style: { fg: 'cyan' }
  });

  const requestsLabel = blessed.text({
    top: 9,
    left: 2,
    content: ' Requests ',
    style: { fg: 'cyan', bold: true }
  });

  requestLog = blessed.box({
    top: 10,
    left: 0,
    width: '100%',
    height: '100%-10',
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    content: '  Waiting for requests...'
  });

  screen.append(statusBox);
  screen.append(separator);
  screen.append(requestsLabel);
  screen.append(requestLog);

  screen.key(['q', 'C-c'], () => process.exit(0));

  screen.key(['r'], () => {
    addLog('{yellow-fg}  Restarting tunnel...{/yellow-fg}');
    process.emit('restart');
  });

  screen.key(['c'], () => {
    requestLines = [];
    requestLog.setContent('  Waiting for requests...');
    screen.render();
  });
};

const updateStatus = (info) => {
  if (!statusBox) return;

  currentInfo = { ...currentInfo, ...info };

  statusBox.setContent([
    `  {bold}ApexTunnel v1.0.0{/bold}`,
    `  ─────────────────────────────────────────`,
    `  Account     ${currentInfo.email || 'connecting...'} (${currentInfo.isPremium ? 'Premium ★' : 'Free'})`,
    `  Status      ${currentInfo.online ? '{green-fg}● online{/green-fg}' : '{yellow-fg}○ connecting...{/yellow-fg}'}`,
    `  Forwarding  ${currentInfo.subdomain ? `{cyan-fg}https://${currentInfo.subdomain}.apextunnel.online{/cyan-fg} -> localhost:${currentInfo.port}` : '{yellow-fg}pending...{/yellow-fg}'}`,
    `  ─────────────────────────────────────────`,
    `  Press {bold}Q{/bold} quit  {bold}R{/bold} restart  {bold}C{/bold} clear logs`
  ].join('\n'));

  screen.render();
};

export const setConnecting = (port) => {
  if (!screen) {
    uiActive = true;
    buildUI();
  }
  updateStatus({ online: false, port });
};

export const setOnline = (info) => {
  updateStatus({ ...info, online: true });
};

export const setReconnecting = () => {
  updateStatus({ online: false, email: 'reconnecting...', isPremium: false });
  addLog('{yellow-fg}  Tunnel closed. Reconnecting in 3 seconds...{/yellow-fg}');
};

export const addLog = (line) => {
  if (!requestLog) return;
  requestLines.push(line);
  if (requestLines.length > 50) requestLines.shift();
  requestLog.setContent(requestLines.join('\n'));
  screen.render();
};

export const logRequest = (method, url, status) => {
  if (!screen) return;
  const time = new Date().toLocaleTimeString();
  const color = status >= 400 ? 'red-fg' : 'green-fg';
  addLog(`  {bold}${time}{/bold}  {cyan-fg}${method}{/cyan-fg}  ${url}  {${color}}${status}{/${color}}`);
};

export const destroyUI = () => {
  if (screen) screen.destroy();
};