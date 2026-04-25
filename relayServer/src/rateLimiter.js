/**
 * Token Bucket Rate Limiter
 */

export class RateLimiter {
  constructor({ windowMs = 60000, maxRequests = 100, keyPrefix = '' } = {}) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.keyPrefix = keyPrefix;
    this.clients = new Map();
    this.cleanupInterval = setInterval(() => this._cleanup(), windowMs);
  }

  isAllowed(key) {
    const now = Date.now();
    const fullKey = this.keyPrefix + key;
    let client = this.clients.get(fullKey);

    if (!client) {
      client = { tokens: this.maxRequests, lastRefill: now };
      this.clients.set(fullKey, client);
    }

    const elapsed = now - client.lastRefill;
    const refillCount = Math.floor(elapsed / this.windowMs);
    if (refillCount > 0) {
      client.tokens = Math.min(this.maxRequests, client.tokens + refillCount * this.maxRequests);
      client.lastRefill = now;
    }

    if (client.tokens > 0) {
      client.tokens--;
      return { allowed: true, remaining: client.tokens };
    }

    const retryAfter = Math.ceil((this.windowMs - (now - client.lastRefill)) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  _cleanup() {
    const now = Date.now();
    const expiry = this.windowMs * 2;
    for (const [key, client] of this.clients) {
      if (now - client.lastRefill > expiry) {
        this.clients.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.clients.clear();
  }
}
