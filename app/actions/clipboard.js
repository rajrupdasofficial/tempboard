'use server';
import { allocateOtp, redis, limit, isLocked, noteFailure, OTP_RE } from '../../lib/redis';
import { keyFor, seal, unseal } from '../../lib/crypto';
import { CLIP_TTL, MAX_LINES, MAX_TEXT_BYTES } from '../../lib/config';
import { fail } from '../../lib/result';

// Every argument of a Server Action is untrusted user input. Validate everything.

export async function createClip(text) {
  try {
    if (!(await limit('clip-create', 20))) return fail('Too many requests. Wait a minute.');
    if (typeof text !== 'string' || !text.trim()) return fail('Write something first.');
    if (text.split('\n').length > MAX_LINES) return fail(`Limit is ${MAX_LINES.toLocaleString()} lines.`);
    if (Buffer.byteLength(text) > MAX_TEXT_BYTES) return fail('Text is too large. Shorten very long lines.');

    const otp = await allocateOtp('clip', (o) => seal({ t: text }, o), CLIP_TTL);
    return { ok: true, otp };
  } catch (e) {
    console.error('createClip', e?.message);
    return fail('Could not create OTP.');
  }
}

const GONE = 'OTP is invalid, expired or already used.';

export async function receiveClip(otpInput) {
  try {
    const otp = String(otpInput ?? '');
    if (!OTP_RE.test(otp)) return fail('Enter a 6-digit OTP.');
    const [locked, allowed] = await Promise.all([isLocked(), limit('clip-receive', 10)]);
    if (locked) return fail('Too many wrong attempts. Try again later.');
    if (!allowed) return fail('Too many attempts. Wait a minute.');

    // GETDEL = read + delete atomically, so an OTP can only ever be redeemed once.
    const raw = await redis().getdel(keyFor('clip', otp));
    const data = raw ? unseal(raw, otp) : null;
    if (!data) { await noteFailure(); return fail(GONE); }
    return { ok: true, text: data.t };
  } catch (e) {
    console.error('receiveClip', e?.message);
    return fail('Could not fetch clipboard.');
  }
}
