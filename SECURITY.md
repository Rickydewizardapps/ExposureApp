# Security Policy

## Reporting Vulnerabilities

Please report security issues to security@braveratech.com.

## Known Issues Fixed in v2.0.1

### 1. Leaked Environment Variables (CRITICAL)
**File:** `relayServer/.env.save`  
**Impact:** Production API tokens, internal secrets, and auth tokens were committed to the repository.  
**Fix:** File removed from repository. `.gitignore` updated to exclude all `.env.*` files.

### 2. JWT Token Rejection (HIGH)
**File:** `clientServer/src/auth.js`  
**Impact:** Valid JWT tokens containing `+`, `/`, or `=` characters were rejected by the token validation regex.  
**Fix:** Regex updated from `/^[A-Za-z0-9\-_.]+$/` to `/^[A-Za-z0-9\-_./+=]+$/`.

### 3. Base64 Memory Exhaustion (HIGH)
**File:** `relayServer/relay.js`, `clientServer/client.js`  
**Impact:** All request/response bodies were buffered entirely into memory and base64-encoded. Large file uploads/downloads could exhaust RAM.  
**Fix:** Replaced with binary framing protocol that streams bodies chunk-by-chunk without encoding.

### 4. Subdomain Permanent Lockout (HIGH)
**File:** `relayServer/handlers/register.js`  
**Impact:** If a client disconnected uncleanly, its subdomain remained in the `clients` map forever, blocking reconnection with "already in use".  
**Fix:** `ConnectionManager.get()` now validates socket health and reclaims dead connections automatically.

### 5. No Rate Limiting (MEDIUM)
**File:** `relayServer/relay.js`  
**Impact:** Unlimited requests and registration attempts from any IP.  
**Fix:** Token bucket rate limiter added for both HTTP (120/min) and registration (10/min) endpoints.

### 6. Header Injection (MEDIUM)
**File:** `relayServer/relay.js`  
**Impact:** User-controlled headers were forwarded without sanitization, allowing CRLF injection.  
**Fix:** Header values are stripped of `\r` and `\n` characters before forwarding.

### 7. Unbounded Buffer Growth (MEDIUM)
**File:** `relayServer/relay.js`  
**Impact:** TCP socket buffer could grow unbounded if a malicious client never sent a newline.  
**Fix:** Binary protocol has explicit frame length limits (16MB max). Body size capped at 100MB. Backpressure controller pauses at 8MB buffered.

### 8. Missing Request Timeouts (LOW)
**File:** `relayServer/handlers/register.js`  
**Impact:** Registration API calls could hang indefinitely if the auth service was slow.  
**Fix:** `AbortController` with 10s timeout added to all fetch calls.

### 9. Plaintext Tunnel Traffic (LOW)
**File:** `relayServer/relay.js`, `clientServer/client.js`  
**Impact:** TCP tunnel between relay and client ran in plaintext.  
**Fix:** Optional TLS wrapping added with modern cipher suites (`TLS_AES_256_GCM_SHA384`, `TLS_CHACHA20_POLY1305_SHA256`, etc.).
