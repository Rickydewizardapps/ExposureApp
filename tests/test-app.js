import express from 'express';
import os from 'os';

const app = express();
const PORT = 3000;

let requestHistory = [];

app.use(express.json());

// Log middleware
app.use((req, res, next) => {
  if (!['/api/requests', '/favicon.ico'].includes(req.path) && !req.path.startsWith('/images')) {
    requestHistory.unshift({
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      method: req.method,
      path: req.path,
      host: req.headers.host
    });
    if (requestHistory.length > 5) requestHistory.pop();
  }
  next();
});

app.get('/api/requests', (req, res) => res.json(requestHistory));

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en" class="scroll-smooth">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ExposureApp | Production Test</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-slate-50 text-slate-900 font-sans">

        <nav class="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
            <div class="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
                <span class="text-xl font-black tracking-tighter text-blue-600">EXPOSURE<span class="text-slate-900">APP</span></span>
                <div class="hidden md:flex gap-8 text-sm font-medium text-slate-600">
                    <a href="#about" class="hover:text-blue-600 transition">About</a>
                    <a href="#gallery" class="hover:text-blue-600 transition">Gallery</a>
                    <a href="#debugger" class="hover:text-blue-600 transition">Tunnel Debugger</a>
                </div>
                <div class="flex items-center gap-2 bg-green-100 px-3 py-1 rounded-full border border-green-200">
                    <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span class="text-[10px] font-bold text-green-700 uppercase">Tunnel Active</span>
                </div>
            </div>
        </nav>

        <header class="relative py-20 px-6 bg-gradient-to-b from-white to-slate-50 overflow-hidden">
            <div class="max-w-4xl mx-auto text-center relative z-10">
                <h1 class="text-5xl md:text-7xl font-black text-slate-900 mb-6 tracking-tight">
                    Testing the <span class="text-blue-600">Future</span> of Tunnels.
                </h1>
                <p class="text-lg text-slate-600 mb-10 max-w-2xl mx-auto">
                    This is a complete landing page test. If you see this, your relay is successfully handling multi-part HTML, CSS injection, and font-awesome assets.
                </p>
                <div class="flex flex-col md:flex-row justify-center gap-4">
                    <button onclick="pingApi()" class="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-full font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95">
                        <i class="fas fa-bolt mr-2"></i> Trigger API Call
                    </button>
                    <a href="#debugger" class="bg-white border border-slate-200 px-8 py-4 rounded-full font-bold hover:bg-slate-50 transition">View Logs</a>
                </div>
                <div id="api-result" class="mt-6 p-4 bg-slate-900 rounded-2xl text-cyan-400 font-mono text-xs hidden max-w-sm mx-auto overflow-hidden"></div>
            </div>
        </header>

        <section id="about" class="py-20 px-6 max-w-6xl mx-auto">
            <div class="grid md:grid-cols-2 gap-12 items-center">
                <div class="bg-blue-600 rounded-3xl p-10 text-white shadow-2xl">
                    <h2 class="text-3xl font-bold mb-4">Relay Performance</h2>
                    <p class="opacity-90 mb-6 leading-relaxed">
                        Running on <b>${os.platform()}</b> (${os.arch()}). This section tests the relay's ability to serve static text content and nested div structures efficiently.
                    </p>
                    <div class="space-y-4">
                        <div class="flex justify-between border-b border-white/20 pb-2">
                            <span>Memory Usage</span>
                            <span class="font-mono">${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                        <div class="flex justify-between border-b border-white/20 pb-2">
                            <span>Uptime</span>
                            <span class="font-mono">${Math.floor(process.uptime())}s</span>
                        </div>
                    </div>
                </div>
                <div>
                    <h3 class="text-2xl font-bold mb-4 italic text-slate-400">"The best way to predict the future is to tunnel it."</h3>
                    <p class="text-slate-600">Your relay server is currently managing the protocol handshake, frame encoding, and the WebSocket upgrade required to render this page.</p>
                </div>
            </div>
        </section>

        <section id="gallery" class="py-20 px-6 bg-slate-900 text-white">
            <div class="max-w-6xl mx-auto">
                <h2 class="text-3xl font-bold mb-10">Tunnel Stress Test: Gallery</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=400&fit=crop" class="rounded-xl hover:scale-105 transition duration-500 shadow-xl" alt="Test 1">
                    <img src="https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=400&fit=crop" class="rounded-xl hover:scale-105 transition duration-500 shadow-xl" alt="Test 2">
                    <img src="https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&h=400&fit=crop" class="rounded-xl hover:scale-105 transition duration-500 shadow-xl" alt="Test 3">
                    <img src="https://imgs.search.brave.com/TKemYQjFprc_9GZC_ODE0ml3kr7pA6A1uEPgyqjQMFw/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9pbWFn/ZXMucGV4ZWxzLmNv/bS9waG90b3MvMzU0/MTUzMzUvcGV4ZWxz/LXBob3RvLTM1NDE1/MzM1L2ZyZWUtcGhv/dG8tb2YtY3VydmVk/LXR1bm5lbC13aXRo/LWFyY2hpdGVjdHVy/YWwtbGlnaHRpbmct/aW4tdGFpd2FuLmpw/ZWc_YXV0bz1jb21w/cmVzcyZjcz10aW55/c3JnYiZkcHI9MSZ3/PTUwMA" class="rounded-xl hover:scale-105 transition duration-500 shadow-xl" alt="Test 4">
                </div>
            </div>
        </section>

        <section id="debugger" class="py-20 px-6 max-w-xl mx-auto">
            <div class="bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
                <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 class="font-bold uppercase tracking-widest text-xs text-slate-500">Traffic Debugger</h3>
                    <span id="last-update" class="text-[10px] font-mono text-blue-600"></span>
                </div>
                <div id="log-container" class="divide-y divide-slate-100">
                    </div>
            </div>
        </section>

        <footer class="py-10 border-t border-slate-200 text-center text-slate-400 text-sm">
            <p>&copy; 2026 ExposureApp Tunnel Testing Suite</p>
            <p class="mt-2 font-mono text-[10px]">Client Version: 2.0.1 | Relay: ^2.0.0</p>
        </footer>

        <script>
            async function pingApi() {
                const el = document.getElementById('api-result');
                el.classList.remove('hidden');
                el.innerText = 'Connecting to tunnel...';
                try {
                    const res = await fetch('/api/test');
                    const data = await res.json();
                    el.innerText = JSON.stringify(data, null, 2);
                } catch (e) { el.innerText = 'Error: ' + e.message; }
            }

            async function updateLogs() {
                try {
                    const res = await fetch('/api/requests');
                    const logs = await res.json();
                    const container = document.getElementById('log-container');
                    document.getElementById('last-update').innerText = 'SYNCED: ' + new Date().toLocaleTimeString();
                    
                    container.innerHTML = logs.map(log => \`
                        <div class="p-4 flex justify-between items-center">
                            <div class="flex flex-col">
                                <span class="text-[10px] font-bold text-slate-400">\${log.time}</span>
                                <span class="text-sm font-mono font-bold text-slate-800 uppercase">\${log.method} \${log.path}</span>
                            </div>
                            <span class="text-[10px] font-mono bg-slate-100 px-2 py-1 rounded text-slate-500 max-w-[100px] truncate">\${log.host}</span>
                        </div>
                    \`).join('') || '<div class="p-10 text-center italic text-slate-400">Waiting for traffic...</div>';
                } catch (e) {}
            }

            setInterval(updateLogs, 3000);
            updateLogs();
        </script>
    </body>
    </html>
  `);
});

app.get('/api/test', (req, res) => {
  res.json({ status: "success", version: "2.0.1", node: process.version, engine: "ExposureApp-Relay" });
});

app.listen(PORT, () => console.log(`🚀 Extreme Test App: http://localhost:${PORT}`));
