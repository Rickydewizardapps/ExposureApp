/**
 * Security utilities
 */

const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const MAX_SUBDOMAIN_LENGTH = 63;

export function validateSubdomain(sub) {
  if (!sub || typeof sub !== 'string') return false;
  if (sub.length > MAX_SUBDOMAIN_LENGTH) return false;
  return SUBDOMAIN_REGEX.test(sub);
}

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'proxy-connection',
]);

export function sanitizeHeaders(headers) {
  const clean = {};
  for (const [key, val] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP.has(lowerKey)) continue;
    if (lowerKey === 'proxy-connection') continue;
    if (typeof val === 'string') {
      clean[key] = val.replace(/[\r\n]/g, '');
    } else if (Array.isArray(val)) {
      clean[key] = val.map(v => String(v).replace(/[\r\n]/g, ''));
    }
  }
  return clean;
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
