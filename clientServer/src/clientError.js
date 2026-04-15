export const getClientErrorPage = (port) => `
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
        <div class="footer">ApexTunnel V1.1.3 • BraveraTech</div>
    </div>
</body>
</html>
`;
