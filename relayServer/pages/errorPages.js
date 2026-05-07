const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeBold = (str) =>
  escapeHtml(str).replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/g, '<b>$1</b>');

export const errorPage = (code, title, message) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(code)} | ApexTunnel</title>
  <style>
    body {
      font-family: 'Courier New', Courier, monospace;
      max-width: 600px;
      margin: 80px auto;
      padding: 0 20px;
      color: #00ff88;
      background: #0a0a0a;
      text-align: center;
    }
    h1 { font-size: 72px; margin: 0; color: #00ff88; text-shadow: 0 0 20px #00ff8844; }
    h2 { margin-top: 10px; color: #00cc6a; font-weight: 500; }
    p { line-height: 1.6; color: #88ffaa; }
    a { color: #00ff88; text-decoration: none; border-bottom: 1px solid #00ff8844; }
    a:hover { border-bottom-color: #00ff88; }
    .footer { margin-top: 40px; font-size: 12px; color: #44aa66; }
    strong { color: #00ff88; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(code)}</h1>
    <h2>${escapeHtml(title)}</h2>
    <p>${safeBold(message)}</p>
    <p><a href="/">Try Again</a></p>
    <p class="footer">ApexTunnel v2.0.1 • BraveraTech</p>
  </div>
</body>
</html>`;
