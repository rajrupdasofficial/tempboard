import 'server-only';
import { Redis } from '@upstash/redis';
import { randomInt } from 'node:crypto';
import { headers } from 'next/headers';
import { getEnv } from './env';
import { anon, keyFor } from './crypto';
import { FAIL_LOCK_THRESHOLD, UPLOAD_QUOTA_BYTES } from './config';

let client;
export function redis() {
  if (!client) {
    const e = getEnv();
    // Raw strings in/out: we seal + parse ourselves, so no surprise auto-JSON-parsing.
    client = new Redis({ url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN, automaticDeserialization: false });
  }
  return client;
}

export const OTP_RE = /^\d{6}$/;

async function clientId() {
  const h = await headers();
  // On Vercel the platform sets these headers, clients can't spoof them.
  const ip = (h.get('x-real-ip') || h.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  return anon(ip);
}

// Allocates a unique OTP and stores build(otp) at the hashed key atomically (NX).
export async function allocateOtp(prefix, build, ttl) {
  for (let i = 0; i < 8; i++) {
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const ok = await redis().set(keyFor(prefix, otp), build(otp), { nx: true, ex: ttl });
    if (ok) return otp;
  }
  throw new Error('OTP allocation failed');
}

// Fixed-window limiter per client + scope. ONE Redis round trip. Returns true if allowed.
export async function limit(scope, max, windowSec = 60) {
  const key = `rl:${scope}:${await clientId()}`;
  const p = redis().pipeline();
  p.incr(key);
  p.expire(key, windowSec, 'NX');
  const [n] = await p.exec();
  return n <= max;
}

// Wrong-OTP lockout: too many bad guesses in an hour locks the client out for the rest of the window.
export async function isLocked() {
  const n = Number((await redis().get(`fail:${await clientId()}`)) || 0);
  return n >= FAIL_LOCK_THRESHOLD;
}
export async function noteFailure() {
  const key = `fail:${await clientId()}`;
  const p = redis().pipeline();
  p.incr(key);
  p.expire(key, 3600, 'NX');
  await p.exec();
}

// Rate limit + hourly upload byte quota in ONE round trip.
export async function admitUpload(max, bytes) {
  const id = await clientId();
  const rl = `rl:upload:${id}`, q = `quota:${id}`;
  const r = redis();
  const p = r.pipeline();
  p.incr(rl); p.expire(rl, 60, 'NX');
  p.incrby(q, bytes); p.expire(q, 3600, 'NX');
  const [n, , used] = await p.exec();
  if (n > max) { await r.decrby(q, bytes); return 'rate'; }
  if (used > UPLOAD_QUOTA_BYTES) { await r.decrby(q, bytes); return 'quota'; }
  return 'ok';
}
