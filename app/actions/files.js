'use server';
import { randomBytes, randomUUID } from 'node:crypto';
import { head, del } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { getEnv } from '../../lib/env';
import { redis, allocateOtp, limit, isLocked, noteFailure, admitUpload, OTP_RE } from '../../lib/redis';
import { keyFor, seal, unseal } from '../../lib/crypto';
import { FILE_TTL, MAX_DOWNLOADS, MAX_TOTAL_BYTES } from '../../lib/config';
import { fail } from '../../lib/result';

const PATH_RE = /^tempboard\/[0-9a-f-]{36}\/[^/]+$/;
const GONE = 'OTP is invalid, expired or files were already removed.';

const safeName = (n) =>
  String(n).normalize('NFKC').replace(/[\\/\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/^\.+/, '').slice(0, 150) || 'file';

const isBlobUrl = (value, pathname) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname.endsWith('.blob.vercel-storage.com') &&
      (pathname === undefined || decodeURIComponent(u.pathname.slice(1)) === pathname);
  } catch { return false; }
};

// 1) ONE call authorises the whole batch (Server Actions run one at a time, so asking per file was the bottleneck).
//    The server picks every path, caps every size and signs short-lived tokens; bytes then go browser -> Blob.
export async function requestUploadTokens(input) {
  try {
    const list = input?.files;
    if (!Array.isArray(list) || list.length < 1 || list.length > 200) return fail('Invalid files.');
    let total = 0;
    for (const f of list) {
      if (!f || typeof f.name !== 'string' || !Number.isSafeInteger(f.size) || f.size < 1 || f.size > MAX_TOTAL_BYTES) {
        return fail('Invalid file.');
      }
      total += f.size;
    }
    if (total > MAX_TOTAL_BYTES) return fail('Total size can’t go over 1 GB.');

    const verdict = await admitUpload(30, total);
    if (verdict === 'rate') return fail('Too many uploads. Wait a minute.');
    if (verdict === 'quota') return fail('Upload limit reached. Try again in an hour.');

    const token = getEnv().BLOB_READ_WRITE_TOKEN;
    const uploads = await Promise.all(list.map(async (f) => {
      const name = safeName(f.name);
      const pathname = `tempboard/${randomUUID()}/${name}`; // 122-bit unguessable folder
      const clientToken = await generateClientTokenFromReadWriteToken({
        token, pathname,
        maximumSizeInBytes: f.size,
        validUntil: Date.now() + 2 * 60 * 60 * 1000,
        addRandomSuffix: false,
        allowOverwrite: true,   // retries are safe: the folder is an unguessable UUID
      });
      return { pathname, clientToken, name, size: f.size };
    }));

    // Remember what we issued so only files WE authorised can be attached to an OTP (one pipelined call).
    const p = redis().pipeline();
    for (const u of uploads) p.set(`up:${u.pathname}`, JSON.stringify({ name: u.name, size: u.size }), { ex: 3 * 60 * 60 });
    await p.exec();

    return { ok: true, uploads: uploads.map(({ pathname, clientToken }) => ({ pathname, clientToken })) };
  } catch (e) {
    console.error('requestUploadTokens', e?.message);
    return fail('Could not start upload.');
  }
}

// 2) After every file is uploaded, bundle them behind one OTP.
export async function createFileOtp(input) {
  try {
    if (!(await limit('file-create', 20))) return fail('Too many requests. Wait a minute.');
    const { files, destroy } = input ?? {};
    if (!Array.isArray(files) || files.length < 1 || files.length > 200) return fail('No files supplied.');
    const token = getEnv().BLOB_READ_WRITE_TOKEN;

    for (const f of files) {
      if (!f || typeof f.pathname !== 'string' || typeof f.url !== 'string' ||
          !PATH_RE.test(f.pathname) || !isBlobUrl(f.url, f.pathname)) return fail('Invalid file.');
    }

    const p = redis().pipeline();
    for (const f of files) p.getdel(`up:${f.pathname}`);   // single use
    const issued = await p.exec();

    const checked = await Promise.all(files.map(async (f, i) => {
      if (!issued[i]) throw new Error('not issued');
      const meta = JSON.parse(issued[i]);
      const h = await head(f.url, { token });                // real size from Vercel, never from the client
      return { url: h.url, downloadUrl: h.downloadUrl, name: meta.name, size: h.size };
    }));

    const total = checked.reduce((a, f) => a + f.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      await del(checked.map((f) => f.url), { token });
      return fail('Total size exceeds 1 GB.');
    }

    const otp = await allocateOtp('file', (o) => seal({ files: checked, destroy: destroy === true }, o), FILE_TTL);
    await redis().set(keyFor('cnt', otp), '0', { ex: FILE_TTL });
    return { ok: true, otp };
  } catch (e) {
    console.error('createFileOtp', e?.message);
    return fail('Could not create OTP for these files.');
  }
}

// 3) Redeem an OTP.
export async function receiveFiles(otpInput) {
  try {
    const otp = String(otpInput ?? '');
    if (!OTP_RE.test(otp)) return fail('Enter a 6-digit OTP.');
    const [locked, allowed] = await Promise.all([isLocked(), limit('file-receive', 10)]);
    if (locked) return fail('Too many wrong attempts. Try again later.');
    if (!allowed) return fail('Too many attempts. Wait a minute.');

    const r = redis();
    const key = keyFor('file', otp), cnt = keyFor('cnt', otp);
    const raw = await r.get(key);
    const record = raw ? unseal(raw, otp) : null;
    if (!record) { await noteFailure(); return fail(GONE); }

    let final = false, remaining = 0;
    if (record.destroy) {
      if (!(await r.getdel(key))) return fail(GONE);   // atomic claim: only one person wins
      await r.del(cnt);
      final = true;
    } else {
      const n = await r.incr(cnt);                      // atomic download counter
      if (n > MAX_DOWNLOADS) { await r.del(key, cnt); return fail(GONE); }
      remaining = MAX_DOWNLOADS - n;
      if (n === MAX_DOWNLOADS) { await r.del(key, cnt); final = true; }
    }

    // Last allowed download: files can only be deleted AFTER the browser has fetched them,
    // so hand out a one-time token that completeFiles() exchanges for the deletion.
    let token = null;
    if (final) {
      token = randomBytes(16).toString('hex');
      await r.set(`pending:${token}`, JSON.stringify(record.files.map((f) => f.url)), { ex: 6 * 60 * 60 });
    }

    return {
      ok: true, final, remaining, token, destroy: record.destroy === true,
      files: record.files.map((f) => ({ name: f.name, size: f.size, url: f.url, downloadUrl: f.downloadUrl })),
    };
  } catch (e) {
    console.error('receiveFiles', e?.message);
    return fail('Could not fetch files.');
  }
}

// 4) Browser finished downloading the last batch -> delete from Blob.
export async function completeFiles(tokenInput) {
  try {
    if (typeof tokenInput !== 'string' || !/^[a-f0-9]{32}$/.test(tokenInput)) return fail('Bad token.');
    if (!(await limit('file-complete', 30))) return fail('Too many requests.');
    const raw = await redis().getdel(`pending:${tokenInput}`);
    if (raw) {
      const urls = JSON.parse(raw).filter((u) => isBlobUrl(u));
      if (urls.length) await del(urls, { token: getEnv().BLOB_READ_WRITE_TOKEN });
    }
    return { ok: true };
  } catch (e) {
    console.error('completeFiles', e?.message);
    return fail('Cleanup failed.');
  }
}
