const crypto = require('crypto');
const config = require('../config');

const SIGNATURE_HEADER = 'x-sirecom-signature';
const TIMESTAMP_HEADER = 'x-sirecom-timestamp';

/** Firma HMAC-SHA256 de "<timestamp>.<cuerpo crudo>" (el timestamp evita ataques de repetición) */
const sign = (rawBody, timestamp, secret = config.payments.webhookSecret) =>
  crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

/** Verificación en tiempo constante + ventana de tolerancia del timestamp */
const verify = (rawBody, timestamp, signature, opts = {}) => {
  const secret = opts.secret || config.payments.webhookSecret;
  const tolerance = opts.toleranceSeconds ?? config.payments.webhookToleranceSeconds;
  const now = opts.now ?? Date.now();
  if (typeof rawBody !== 'string' || !timestamp || typeof signature !== 'string') return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > tolerance) return false;
  const expected = Buffer.from(sign(rawBody, timestamp, secret), 'hex');
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

module.exports = { sign, verify, SIGNATURE_HEADER, TIMESTAMP_HEADER };
