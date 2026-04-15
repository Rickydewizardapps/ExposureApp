<div align="center">
  <img src="assets/logo.svg" alt="ExposureApp" width="400"/>
</div>

<br/>

<div align="center">

[![MIT](https://img.shields.io/badge/license-MIT-00D4FF?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-0066FF?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Zero deps](https://img.shields.io/badge/dependencies-zero-00D4FF?style=flat-square)]()

</div>

---

A self-hosted reverse tunnel. Expose any local server to the internet via a persistent TCP connection between a relay (VPS) and a client (your machine).

```
Browser → relay:443 ──── TCP ────→ client → localhost:8000
```

---

## Stack

Pure Node.js — `net` `https` `crypto` `fs`. No npm packages on the relay. Client uses `blessed` for the terminal UI.

---

## Setup

**1. Relay** - Run on your VPS

```bash
cd ExposureApp/relayServer

# 1. Generate TLS certificates for secure tunneling
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes

# 2. Configure environment
cp .env.example .env  
# Edit .env to set your API_URL, INTERNAL_SECRET, and FRONTEND_URL

# 3. Start the relay
pnpm install
pnpm dev
```

**2. Client** — run locally

**Option A — Download binary** (Linux / macOS / Windows)

Grab the binary for your platform from the [releases page](https://github.com/braverachacha/ExposureApp/releases), then:

```bash
# Linux/macOS — make it executable and move to PATH
chmod +x apex-linux-arm64   # or apex-linux-x64 / apex-macos-x64
sudo mv apex-linux-arm64 /usr/local/bin/apex
```

**Option B — Run from source** (Termux / Android or any Node.js environment)

```bash
cd ExposureApp/clientServer
pnpm install
pnpm run bundle          # builds dist/bundle.cjs

# Link globally so the `apex` command is available anywhere
pnpm link --global
```

---

Once installed, save your auth token once:

```bash
apex authtoken <your_token>
```

Then expose a local port:

```bash
# Expose port 3000
apex http 3000

# Expose with a custom subdomain
apex http 3000 --subdomain myapp
```

```
✔ Authtoken saved to ~/.apextunnel

┌─────────────────────────────────────────────────────────┐
│  ApexTunnel v1.1.3                                      │
│  ─────────────────────────────────────────              │
│  Account     you@example.com (Free)                     │
│  Status      ● online                                   │
│  Forwarding  https://swift-falcon.apextunnel.top ->     │
│  localhost:3000                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Commands

| Command | Description |
|---|---|
| `apex http <port>` | Expose a local port |
| `apex http <port> --subdomain <name>` | Expose with a custom subdomain |
| `apex authtoken <token>` | Save your auth token |
| `apex status` | Show saved token & relay info |
| `apex help` | Show help message |

---

## Keybinds

| Key | Action |
|---|---|
| `Q` | Quit |
| `R` | Restart tunnel |
| `C` | Clear request log |

---

## Auth Token

Your token is stored at `~/.apextunnel` after running `authtoken`. No need to pass it on every run.

---

## Env Overrides (debugging)

| Variable | Default | Description |
|---|---|---|
| `APEX_RELAY` | `relay.apextunnel.top` | Relay hostname |
| `APEX_RELAY_PORT` | `9000` | Relay port |

---

## Progress

- [x] HTTPS tunnel
- [x] Subdomain routing
- [x] Auth tokens
- [x] Token persistence via `~/.apextunnel`
- [x] Auto-reconnect
- [x] Multi-client
- [x] Terminal UI with live request log
- [x] Binary executable
- [x] Let's Encrypt
- [ ] Dashboard

---

<div align="center">
<sub>MIT · <a href="https://github.com/braverachacha">BraveraTech</a></sub>
</div>
