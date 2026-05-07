import http from 'http';
import { C } from './colors.js';
import { CONFIG } from './config.js';

let server = null;
let boundPort = null;
const clients = new Set();

export async function startInspector(getState) {
  const { portStart, portEnd, host } = CONFIG.inspector;

  for (let port = portStart; port <= portEnd; port++) {
    try {
      server = http.createServer((req, res) => {
        if (req.url === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(renderDashboard(getState()));
          return;
        }
        if (req.url === '/api/requests') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(getState().requests.slice(-100)));
          return;
        }
        if (req.url === '/api/stream') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });
          clients.add(res);
          req.on('close', () => clients.delete(res));
          return;
        }
        res.writeHead(404);
        res.end('Not found');
      });

      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve();
        });
      });

      boundPort = port;
      console.log(`${C.success}✔${C.reset} Inspector at ${C.brand}http://${host}:${port}${C.reset}`);
      return boundPort;

    } catch (err) {
      if (err.code === 'EADDRINUSE') continue;
      throw err;
    }
  }

  console.log(`${C.warning}○${C.reset} No free inspector port in range ${portStart}–${portEnd}`);
  return null;
}

export function broadcast(request) {
  if (!clients.size) return;
  const data = JSON.stringify(request);
  for (const res of clients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

export function stopInspector() {
  if (server) {
    for (const res of clients) {
      try { res.end(); } catch {}
    }
    clients.clear();
    server.close();
    server = null;
    boundPort = null;
  }
}

export function getInspectorPort() {
  return boundPort;
}

/**
 * SECURITY FIX: Properly escape HTML to prevent XSS attacks
 * Handles: &, <, >, ", '
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function formatHeaders(headers) {
  if (!headers || typeof headers !== 'object') return null;
  const keys = Object.keys(headers);
  if (!keys.length) return null;
  const normalized = {};
  for (const k of keys) {
    const v = headers[k];
    normalized[k] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return JSON.stringify(normalized, null, 2);
}

function truncateUrl(url, max) {
  if (typeof url !== 'string') return '';
  return url.length > max ? url.slice(0, max) + '…' : url;
}

function renderDashboard(state) {
  const { info, requests } = state;
  
  const rows = requests.slice(-50).map((r, idx) => {
    const statusColor = r.status >= 500 ? '#ff4444' : r.status >= 400 ? '#ffcc00' : '#00ff88';
    const reqId = `req-${idx}`;
    const reqHeadersJson = formatHeaders(r.reqHeaders);
    const resHeadersJson = formatHeaders(r.resHeaders);
    
    // SECURITY FIX: All user-controlled data properly escaped
    const escapedUrl = escapeHtml(truncateUrl(r.url, 60));
    const escapedMethod = escapeHtml(r.method);
    const escapedReqHeaders = reqHeadersJson ? escapeHtml(reqHeadersJson) : '';
    const escapedResHeaders = resHeadersJson ? escapeHtml(resHeadersJson) : '';
    const escapedEmail = escapeHtml(info.email || '—');
    const escapedSubdomain = escapeHtml(info.subdomain || '');
    
    return `<tr class="request-row" onclick="toggleDetail('${reqId}')">
      <td class="time-col">${escapeHtml(r.time)}</td>
      <td class="method-col"><span class="method ${escapedMethod.toLowerCase()}">${escapedMethod}</span></td>
      <td class="url-col">${escapedUrl}</td>
      <td class="status-col" style="color:${statusColor};font-weight:600">${r.status}</td>
      <td class="dur-col">${r.duration}ms</td>
    </tr>
    <tr class="detail-row" id="${reqId}" style="display:none">
      <td colspan="5">
        <div class="detail-panel">
          <div class="detail-section">
            <h4>Request Headers</h4>
            <pre>${escapedReqHeaders ? escapedReqHeaders : '<em class="empty-hint">No headers captured</em>'}</pre>
          </div>
          <div class="detail-section">
            <h4>Response Headers</h4>
            <pre>${escapedResHeaders ? escapedResHeaders : '<em class="empty-hint">No headers captured</em>'}</pre>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ApexTunnel Inspector</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Mono', Monaco, 'Courier New', monospace;
      background: #0a0a0a;
      color: #e0e0e0;
      line-height: 1.5;
      min-height: 100vh;
    }
    .header {
      background: #111;
      border-bottom: 1px solid #222;
      padding: 16px 20px;
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .header h1 {
      font-size: 18px;
      font-weight: 600;
      color: #00ff88;
      letter-spacing: -0.3px;
      margin-bottom: 8px;
    }
    .meta {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #666;
      flex-wrap: wrap;
    }
    .meta span { display: flex; align-items: center; gap: 6px; }
    .meta .dot { width: 8px; height: 8px; border-radius: 50%; background: #00ff88; }
    .meta .dot.offline { background: #ffcc00; }
    .container { padding: 16px 20px; max-width: 1400px; margin: 0 auto; }
    .status-bar {
      background: #111;
      border: 1px solid #222;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .status-bar .url {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 13px;
      color: #00ff88;
      word-break: break-all;
    }
    .status-bar .label {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .controls {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .btn {
      background: #1a1a1a;
      border: 1px solid #333;
      color: #ccc;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
    }
    .btn:hover {
      background: #222;
      border-color: #444;
      color: #fff;
    }
    .btn:active {
      background: #1a1a1a;
    }
    .btn.primary {
      background: #00ff8811;
      border-color: #00ff88;
      color: #00ff88;
    }
    .btn.primary:hover {
      background: #00ff8822;
    }
    .table-wrapper {
      overflow-x: auto;
      border-radius: 8px;
      border: 1px solid #222;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { position: sticky; top: 60px; z-index: 10; }
    th {
      text-align: left;
      padding: 10px 12px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      background: #111;
      border-bottom: 1px solid #222;
    }
    td {
      padding: 8px 12px;
      font-size: 12px;
      border-bottom: 1px solid #1a1a1a;
      font-family: 'SF Mono', Monaco, monospace;
      vertical-align: top;
    }
    .time-col { width: 90px; color: #888; }
    .method-col { width: 70px; }
    .url-col { 
      width: auto; 
      word-break: break-all; 
      overflow-wrap: break-word;
      color: #aaa;
    }
    .status-col { width: 60px; text-align: center; }
    .dur-col { width: 70px; text-align: right; color: #888; }
    
    /* ANIMATION: Smooth slide-in for new requests (ngrok-like) */
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .request-row { 
      cursor: pointer; 
      transition: background 0.15s;
      animation: slideIn 0.25s ease-out;
    }
    .request-row:hover td { background: #161616; }
    .request-row:active td { background: #1a1a1a; }
    
    .detail-row { 
      animation: slideIn 0.25s ease-out;
    }
    
    .detail-row td { padding: 0; border: none; }
    .detail-panel {
      background: #0a0a0a;
      border-left: 3px solid #00ff88;
      margin: 0 12px 12px;
      padding: 14px;
      border-radius: 0 6px 6px 0;
      animation: slideIn 0.25s ease-out;
    }
    .detail-section { margin-bottom: 14px; }
    .detail-section:last-child { margin-bottom: 0; }
    .detail-section h4 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      margin-bottom: 6px;
      font-weight: 600;
    }
    .detail-section pre {
      background: #111;
      border: 1px solid #222;
      border-radius: 4px;
      padding: 10px;
      font-size: 11px;
      color: #ccc;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 300px;
      overflow-y: auto;
    }
    .method {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .method.get { background: #00ff8822; color: #00ff88; }
    .method.post { background: #00aaff22; color: #00aaff; }
    .method.put { background: #ffaa0022; color: #ffaa00; }
    .method.patch { background: #aa00ff22; color: #aa00ff; }
    .method.delete { background: #ff004422; color: #ff0044; }
    .method.head { background: #66666622; color: #999; }
    .empty {
      text-align: center;
      padding: 48px;
      color: #444;
      font-size: 13px;
    }
    .empty-hint {
      color: #555;
      font-style: italic;
    }
    .live-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #00ff88;
      background: #00ff8811;
      padding: 4px 10px;
      border-radius: 12px;
      flex-shrink: 0;
    }
    .live-badge::before {
      content: '';
      width: 6px; height: 6px;
      background: #00ff88;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .stats {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .stat-card {
      background: #111;
      border: 1px solid #222;
      border-radius: 8px;
      padding: 12px 16px;
      flex: 1;
      min-width: 150px;
    }
    .stat-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      margin-bottom: 4px;
    }
    .stat-value {
      font-size: 16px;
      font-weight: 600;
      color: #00ff88;
      font-family: 'SF Mono', Monaco, monospace;
    }
    @media (max-width: 768px) {
      .dur-col, .time-col { display: none; }
      .header h1 { font-size: 16px; }
      .meta { font-size: 11px; }
      .container { padding: 12px; }
      .status-bar { padding: 10px 12px; }
      .stats { flex-direction: column; }
      .stat-card { min-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ ApexTunnel Inspector</h1>
    <div class="meta">
      <span><div class="dot ${info.online ? '' : 'offline'}"></div> ${info.online ? 'Online' : 'Connecting…'}</span>
      <span>📧 ${escapeHtml(info.email || '—')}</span>
      <span>${info.isPremium ? '⭐ Premium' : '○ Free'}</span>
    </div>
  </div>
  <div class="container">
    <div class="status-bar">
      <div>
        <div class="label">Forwarding</div>
        <div class="url">${info.subdomain ? 'https://' + escapeHtml(info.subdomain) + '.apextunnel.top → localhost:' + escapeHtml(info.port) : 'Pending…'}</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <div class="live-badge">Live</div>
        <button class="btn primary" onclick="downloadLog()">Export</button>
      </div>
    </div>
    
    <div class="stats">
      <div class="stat-card">
        <div class="stat-label">Total Requests</div>
        <div class="stat-value" id="total-count">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Requests / min</div>
        <div class="stat-value" id="rate">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Response Time</div>
        <div class="stat-value" id="avg-time">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Error Rate</div>
        <div class="stat-value" id="error-rate">0%</div>
      </div>
    </div>
    
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th class="time-col">Time</th>
            <th class="method-col">Method</th>
            <th class="url-col">Path</th>
            <th class="status-col">Status</th>
            <th class="dur-col">Duration</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5" class="empty">Waiting for requests…</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
  <script>
    // Global state for analytics
    let allRequests = [];
    const MAX_STORED = 500;

    function toggleDetail(id) {
      const row = document.getElementById(id);
      const isVisible = row.style.display !== 'none';
      document.querySelectorAll('.detail-row').forEach(r => r.style.display = 'none');
      row.style.display = isVisible ? 'none' : 'table-row';
    }
    
    function truncateUrl(url, max) {
      if (!url) return '';
      return url.length > max ? url.slice(0, max) + '…' : url;
    }
    
    function escapeHtml(str) {
      if (typeof str !== 'string') return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    }
    
    function updateStats() {
      const total = allRequests.length;
      const now = Date.now();
      const oneMinAgo = now - 60000;
      const recentReqs = allRequests.filter(r => r._timestamp > oneMinAgo);
      const rate = Math.round((recentReqs.length / 60) * 60);
      
      const errors = allRequests.filter(r => r.status >= 400);
      const errorRate = total > 0 ? Math.round((errors.length / total) * 100) : 0;
      
      const avgTime = total > 0 
        ? Math.round(allRequests.reduce((sum, r) => sum + r.duration, 0) / total)
        : 0;
      
      document.getElementById('total-count').textContent = total;
      document.getElementById('rate').textContent = rate;
      document.getElementById('avg-time').textContent = avgTime + 'ms';
      document.getElementById('error-rate').textContent = errorRate + '%';
    }
    
    function downloadLog() {
      const json = JSON.stringify(allRequests, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'apex-requests-' + new Date().toISOString().slice(0,10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
    }
    
    const tbody = document.querySelector('tbody');
    const es = new EventSource('/api/stream');
    
    es.onmessage = e => {
      try {
        const r = JSON.parse(e.data);
        r._timestamp = Date.now();
        allRequests.push(r);
        while (allRequests.length > MAX_STORED) {
          allRequests.shift();
        }
        
        const reqId = 'req-' + Date.now() + Math.random();
        const sc = r.status >= 500 ? '#ff4444' : r.status >= 400 ? '#ffcc00' : '#00ff88';
        const reqH = r.reqHeaders && Object.keys(r.reqHeaders).length ? JSON.stringify(r.reqHeaders, null, 2) : null;
        const resH = r.resHeaders && Object.keys(r.resHeaders).length ? JSON.stringify(r.resHeaders, null, 2) : null;
        
        const tr = document.createElement('tr');
        tr.className = 'request-row';
        tr.onclick = () => toggleDetail(reqId);
        
        const escapedUrl = escapeHtml(truncateUrl(r.url, 60));
        const escapedMethod = escapeHtml(r.method);
        const escapedTime = escapeHtml(r.time);
        
        tr.innerHTML = '<td class="time-col">' + escapedTime + '</td>' +
          '<td class="method-col"><span class="method ' + escapedMethod.toLowerCase() + '">' + escapedMethod + '</span></td>' +
          '<td class="url-col">' + escapedUrl + '</td>' +
          '<td class="status-col" style="color:' + sc + ';font-weight:600">' + r.status + '</td>' +
          '<td class="dur-col">' + r.duration + 'ms</td>';
        
        const detailTr = document.createElement('tr');
        detailTr.className = 'detail-row';
        detailTr.id = reqId;
        detailTr.style.display = 'none';
        
        const reqHEscaped = reqH ? escapeHtml(reqH) : '';
        const resHEscaped = resH ? escapeHtml(resH) : '';
        
        detailTr.innerHTML = '<td colspan="5">' +
          '<div class="detail-panel">' +
            '<div class="detail-section">' +
              '<h4>Request Headers</h4>' +
              '<pre>' + (reqHEscaped ? reqHEscaped : '<em class="empty-hint">No headers captured</em>') + '</pre>' +
            '</div>' +
            '<div class="detail-section">' +
              '<h4>Response Headers</h4>' +
              '<pre>' + (resHEscaped ? resHEscaped : '<em class="empty-hint">No headers captured</em>') + '</pre>' +
            '</div>' +
          '</div></td>';
        
        // Remove empty placeholder if exists
        if (tbody.querySelector('.empty')) tbody.innerHTML = '';
        
        tbody.insertBefore(detailTr, tbody.firstChild);
        tbody.insertBefore(tr, tbody.firstChild);
        
        // Keep only last 50 in DOM for performance
        const allRows = tbody.querySelectorAll('.request-row');
        while (allRows.length > 50) {
          const lastRow = allRows[allRows.length - 1];
          const lastDetail = lastRow.nextElementSibling;
          if (lastDetail && lastDetail.classList.contains('detail-row')) lastDetail.remove();
          lastRow.remove();
        }
        
        updateStats();
        
      } catch (err) {
        console.error('EventSource parse error:', err);
      }
    };
    
    es.onerror = () => {
      console.error('EventSource connection lost');
      // Attempt to reconnect after 3s
      setTimeout(() => {
        location.reload();
      }, 3000);
    };
    
    // Update stats every 5 seconds
    setInterval(updateStats, 5000);
    updateStats();
  </script>
</body>
</html>`;
}
