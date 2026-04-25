/**
 * TLS configuration helpers
 */

import fs from 'fs';
import tls from 'tls';
import logger from '../logger.js';

export function getTlsOptions() {
  const keyPath = process.env.TLS_KEY_PATH || './key.pem';
  const certPath = process.env.TLS_CERT_PATH || './cert.pem';

  const keyExists = fs.existsSync(keyPath);
  const certExists = fs.existsSync(certPath);

  if (!keyExists || !certExists) {
    if (process.env.TLS_DISABLED !== 'true') {
      logger.warn({
        keyPath,
        certPath,
        keyExists,
        certExists,
      }, 'TLS certificate files not found. Running in plaintext mode. Set TLS_DISABLED=true to suppress this warning.');
    }
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
