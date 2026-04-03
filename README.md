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

Pure Node.js — `net` `https` `crypto` `fs`. No npm packages.

---

## Setup

**1. Relay** — run on your VPS

```bash
git clone https://github.com/braverachacha/ExposureApp.git
cd ExposureApp/relayServer

# generate TLS cert
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes

# run
APEX_AUTH_TOKEN=your_secret node relay.js
```

**2. Client** — run locally

```bash
cd ExposureApp/clientServer

APEX_CLIENT_TOKEN=your_secret node client.js \
  --relay your.vps.ip \
  --port 8000 \
  --subdomain myapp
```

```
✓ Connected to relay server successfully
✓ Tunnel ready: https://myapp.yourdomain.com
```

---

## Options

| Flag | Default | Description |
|---|---|---|
| `--relay` | `localhost` | Relay host or IP |
| `--port` | `8000` | Local app port |
| `--subdomain` | random | Your subdomain |

---

## Roadmap

- [x] HTTPS tunnel
- [x] Subdomain routing
- [x] Auth tokens
- [x] Auto-reconnect
- [x] Multi-client
- [ ] Binary executable
- [ ] Let's Encrypt
- [ ] Dashboard

---

<div align="center">
<sub>MIT · <a href="https://github.com/braverachacha">BraveraTech</a></sub>
</div>
