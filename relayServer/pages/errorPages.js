const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Restore <b> tags from trusted internal callers after escaping
const safeBold = (str) =>
  escapeHtml(str).replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/g, '<b>$1</b>');

export const errorPage = (code, title, message) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(code)} | ApexTunnel</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; color: #333; background: #fafafa; }
    h1 { font-size: 72px; margin: 0; color: #e74c3c; }
    h2 { margin-top: 10px; color: #555; font-weight: 500; }
    p { line-height: 1.6; color: #666; }
    a { color: #3498db; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .container { text-align: center; }
    .footer { margin-top: 40px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(code)}</h1>
    <h2>${escapeHtml(title)}</h2>
    <p>${safeBold(message)}</p>
    <p><a href="/">Try Again</a></p>
    <p class="footer">ApexTunnel v2.0 • BraveraTech</p>
  </div>
</body>
</html>`;
