export const errorPage = (code, title, message) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${code} | ApexTunnel</title>
    <style>
        body { 
            background: #0f172a; color: #f8fafc; 
            font-family: 'Inter', system-ui, -apple-system, sans-serif; 
            display: flex; align-items: center; justify-content: center; 
            height: 100vh; margin: 0; text-align: center; 
        }
        .card { 
            padding: 3rem; border: 1px solid #1e293b; border-radius: 24px; 
            background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px); 
            max-width: 480px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .status-code {
            font-size: 5rem; font-weight: 900; margin: 0;
            background: linear-gradient(to bottom, #38bdf8, #1d4ed8);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            line-height: 1; opacity: 0.8;
        }
        h1 { font-size: 1.8rem; margin: 1rem 0 0.5rem; color: #f8fafc; font-weight: 800; }
        p { color: #94a3b8; line-height: 1.6; margin-bottom: 2.5rem; font-size: 1.1rem; }
        b { color: #38bdf8; }
        .btn { 
            background: #38bdf8; color: #0f172a; padding: 0.8rem 2rem; 
            border-radius: 12px; text-decoration: none; font-weight: 700; 
            transition: all 0.2s; display: inline-block;
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(56, 189, 248, 0.4); }
        .footer { 
            margin-top: 3rem; font-size: 0.7rem; color: #475569; 
            letter-spacing: 2px; text-transform: uppercase; font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="status-code">${code}</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="/" class="btn">Try Again</a>
        <div class="footer">ApexTunnel v1.1.3 • BraveraTech</div>
    </div>
</body>
</html>`;
