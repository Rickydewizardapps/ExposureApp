# Changelog

## [2.0.0] — 2026-04-25

### Protocol
- **Replaced newline-delimited JSON with a binary framing protocol**
  - Frame format: `[4-byte length][1-byte type][payload]`
  - Frame types: JSON_CONTROL, REQUEST_START, RESPONSE_START, BODY_CHUNK, BODY_END, PING, PONG
  - Eliminates base64 encoding overhead for all request/response bodies
  - Supports true streaming for large files (images, videos, audio)
  - Maximum frame size: 16MB

### Security
- **Fixed leaked secrets in `.env.save`** — removed from repo, added `.env.*` to `.gitignore`
- **Fixed token regex** — original `/^[A-Za-z0-9\-_.]+$/` rejected valid JWTs with `+/=` padding. Now accepts `/^[A-Za-z0-9\-_./+=]+$/`
- **Added input validation** — subdomain format validation, header sanitization (strips `\r\n`), hop-by-hop header filtering
- **Added request size limits** — 64KB max headers, 100MB max body
- **Added fetch timeout** — registration API calls abort after 10s via `AbortController`
- **Added client IP extraction** — respects `X-Forwarded-For` for accurate rate limiting behind proxies
- **Safer error responses** — HTML error pages properly escape all user-controlled input
- **TLS tunnel encryption** — optional TLS wrapping on TCP connections with modern cipher suites

### Connection Management
- **Added heartbeat mechanism** — relay pings clients every 30s, clients pong back. Dead connections auto-cleaned after 10s timeout
- **Added `ConnectionManager` class** — centralized connection tracking with automatic cleanup of destroyed sockets
- **Fixed subdomain reclaim bug** — stale/dead connections are now forcefully reclaimed instead of permanently blocking the subdomain with "already in use"
- **Fixed reconnect loop** — client no longer exits on `SUBDOMAIN_IN_USE`; instead it retries with exponential backoff and jitter

### Rate Limiting
- **Added token bucket rate limiter** on relay
  - HTTP requests: 120 req/min per IP
  - Registration attempts: 10 req/min per IP
  - Returns `429 Too Many Requests` with `Retry-After` header

### Backpressure
- **Added `BackpressureController`** — tracks socket buffer state, pauses writes when buffered bytes exceed 8MB
- **Drain event handling** — automatically resumes when socket buffer drains
- Prevents memory exhaustion when downstream client is slower than upstream browser

### Performance
- **Streaming bodies** — request and response bodies are streamed chunk-by-chunk instead of being buffered entirely into memory and base64-encoded
- **Eliminated base64 bottleneck** — reduces CPU and memory usage, especially for large binary payloads
- **Added concurrent request limit** — relay caps at 1000 concurrent requests to prevent resource exhaustion

### Observability
- **Prometheus metrics endpoint** (`:9090/metrics`)
  - `apex_requests_total` — counter by method and status
  - `apex_request_duration_seconds` — histogram
  - `apex_connections_total` — total connections
  - `apex_active_connections` — current gauge
  - `apex_uptime_seconds` — process uptime
- **Health check endpoint** (`:9090/health`) — returns JSON with status, uptime, active connections, pending requests

### Testing
- **Added comprehensive test suite** using Vitest
  - `protocol.test.js` — frame encoding/decoding, partial frame handling, error cases
  - `rateLimiter.test.js` — token bucket behavior, window refill, independent keys
  - `security.test.js` — subdomain validation, header sanitization, HTML escaping
  - `backpressure.test.js` — pause/resume, drain events, destroyed socket handling

### Reliability
- **Graceful shutdown** — both relay and client clean up timers, sockets, and pending requests on SIGINT/SIGTERM
- **Request timeout** — 30s timeout on pending requests with proper cleanup
- **Early chunk buffering** — client buffers body chunks that arrive before the local HTTP request is established, then flushes them
- **Socket timeout** — 60s idle timeout on client sockets

### Dependencies
- Updated `dotenv` to `^16.4.7`
- Updated `pino` to `^9.6.0`
- Updated `esbuild` to `^0.25.0`
- Added `vitest` for testing
- Removed `dotenv` from client dependencies

## [1.1.3] — Previous
- HTTPS tunnel
- Subdomain routing
- Auth tokens
- Token persistence via `~/.apextunnel`
- Auto-reconnect
- Multi-client
- Terminal UI with live request log
- Binary executable
