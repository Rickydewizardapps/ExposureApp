/**
 * TLS configuration helpers
 */

import fs from 'fs';
import tls from 'tls';

export function getTlsOptions() {
  const keyPath = process.env.TLS_KEY_PATH || './key.pem';
  const certPath = process.env.TLS_CERT_PATH || './cert.pem';

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    return null;
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
    // Modern TLS settings
    minVersion: 'TLSv1.2',
    ciphers: [
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_128_GCM_SHA256',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-RSA-CHACHA20-POLY1305',
    ].join(':'),
    honorCipherOrder: true,
  };
}

export function createSecureServer(options, connectionListener) {
  return tls.createServer(options, connectionListener);
}
