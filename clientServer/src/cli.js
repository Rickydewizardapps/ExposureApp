import blessed from 'blessed';

// State

let screen      = null;
let statusBox   = null;
let requestLog  = null;
let requestLines = [];
let currentInfo  = {};

export let uiActive = false;

const MAX_LOG_LINES = 200;

// UI construction

const buildUI = () => {
  screen = blessed.screen({
    smartCSR: true,
    title: 'ApexTunnel',
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

  requestLog = blessed.box({
    top: 10, left: 0,
    width: '100%', height: '100%-10',
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    content: '  Waiting for requests…',
  });

  screen.append(statusBox);
  screen.append(separator);
  screen.append(requestsLabel);
  screen.append(requestLog);

  // Key bindings
  screen.key(['q', 'C-c'], () => {
    destroyUI();
    process.exit(0);
  });

  screen.key(['r'], () => {
    addLog('{yellow-fg}  Restarting tunnel…{/yellow-fg}');
    // Emit the custom event that client.js listens for
    process.emit('apexRestart');
  });

  screen.key(['c'], () => {
    requestLines = [];
    if (requestLog) {
      requestLog.setContent('  Waiting for requests…');
      screen.render();
    }
  });
};

// Status helpers

const renderStatus = () => {
  if (!statusBox || !screen) return;

  statusBox.setContent(
    [
      `  {bold}ApexTunnel v1.0.0{/bold}`,
      `  ─────────────────────────────────────────`,
      `  Account     ${currentInfo.email || 'connecting…'} (${currentInfo.isPremium ? 'Premium ★' : 'Free'})`,
      `  Status      ${currentInfo.online
        ? '{green-fg}● online{/green-fg}'
        : '{yellow-fg}○ connecting…{/yellow-fg}'}`,
      `  Forwarding  ${
        currentInfo.subdomain
          ? `{cyan-fg}https://${currentInfo.subdomain}.apextunnel.online{/cyan-fg} → localhost:${currentInfo.port}`
          : '{yellow-fg}pending…{/yellow-fg}'
      }`,
      `  ─────────────────────────────────────────`,
      `  Press {bold}Q{/bold} quit  {bold}R{/bold} restart  {bold}C{/bold} clear logs`,
    ].join('\n'),
  );

  screen.render();
};

// Exported API

export const setConnecting = (port) => {
  if (!screen) {
    uiActive = true;
    buildUI();
  }
  currentInfo = { ...currentInfo, online: false, port };
  renderStatus();
};

export const setOnline = (info) => {
  currentInfo = { ...currentInfo, ...info, online: true };
  renderStatus();
};

export const setReconnecting = () => {
  currentInfo = { ...currentInfo, online: false, email: 'reconnecting…', isPremium: false };
  renderStatus();
  addLog('{yellow-fg}  Tunnel closed. Reconnecting…{/yellow-fg}');
};

export const addLog = (line) => {
  if (!requestLog || !screen) return;

  requestLines.push(line);

  // Rolling window — discard oldest entries beyond the cap
  if (requestLines.length > MAX_LOG_LINES) {
    requestLines = requestLines.slice(-MAX_LOG_LINES);
  }

  requestLog.setContent(requestLines.join('\n'));
  requestLog.setScrollPerc(100); // always scroll to bottom
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
    screen     = null;
    statusBox  = null;
    requestLog = null;
  }
  uiActive = false;
};
