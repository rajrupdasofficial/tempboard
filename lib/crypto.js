import 'server-only';
import { createHmac, hkdfSync, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { getEnv } from './env';

// Redis key for an OTP = HMAC(APP_SECRET, otp). A Redis dump never reveals live OTPs
// and the 6-digit space can't be brute-forced offline without APP_SECRET.
export const keyFor = (prefix, otp) =>
  `${prefix}:${createHmac('sha256', getEnv().APP_SECRET).update(`key:${otp}`).digest('hex')}`;

// Pseudonymous client id for rate limiting (raw IPs are never stored).
export const anon = (value) =>
  createHmac('sha256', getEnv().APP_SECRET).update(`ip:${value}`).digest('hex').slice(0, 32);

const dek = (otp) => Buffer.from(hkdfSync('sha256', getEnv().APP_SECRET, String(otp), 'tempboard-seal-v1', 32));

// AES-256-GCM, key derived from APP_SECRET + the OTP. Data at rest is unreadable without both.
export function seal(obj, otp) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', dek(otp), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

export function unseal(str, otp) {
  try {
    const b = Buffer.from(str, 'base64');
    const d = createDecipheriv('aes-256-gcm', dek(otp), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

export function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
}
