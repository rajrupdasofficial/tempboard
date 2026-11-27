import 'server-only';

// The ONLY file that reads process.env for secrets. Everything else calls getEnv().
const REQUIRED = [
  'BLOB_READ_WRITE_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'APP_SECRET',
  'CRON_SECRET',
];

let cached;

export function getEnv() {
  if (cached) return cached;
  const out = {};
  const missing = [];
  for (const k of REQUIRED) {
    const v = process.env[k];
    if (!v || !v.trim()) missing.push(k); else out[k] = v.trim();
  }
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}. See .env.example`);
  if (out.APP_SECRET.length < 32) throw new Error('APP_SECRET must be at least 32 characters');
  if (out.CRON_SECRET.length < 16) throw new Error('CRON_SECRET must be at least 16 characters');
  cached = Object.freeze(out);
  return cached;
}
