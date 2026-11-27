import { NextResponse } from 'next/server';
import { list, del } from '@vercel/blob';
import { getEnv } from '../../../../lib/env';
import { redis } from '../../../../lib/redis';
import { safeEqual } from '../../../../lib/crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Vercel Cron can only call a GET URL, so this is the single HTTP route in the app.
// It rejects everything that doesn't carry the CRON_SECRET bearer token.
export async function GET(request) {
  let env;
  try { env = getEnv(); } catch { return new NextResponse(null, { status: 500 }); }

  const auth = request.headers.get('authorization') || '';
  if (!safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) return new NextResponse(null, { status: 401 });

  const token = env.BLOB_READ_WRITE_TOKEN;
  const urls = [];
  let cursor;
  do {
    const page = await list({ token, cursor, limit: 1000, prefix: 'tempboard/' });
    urls.push(...page.blobs.map((b) => b.url));
    cursor = page.cursor;
  } while (cursor);
  for (let i = 0; i < urls.length; i += 500) await del(urls.slice(i, i + 500), { token });

  const r = redis();
  let keysDeleted = 0;
  for (const match of ['file:*', 'cnt:*', 'pending:*', 'up:*']) {
    let c = '0';
    do {
      const [next, keys] = await r.scan(c, { match, count: 500 });
      if (keys.length) { await r.del(...keys); keysDeleted += keys.length; }
      c = String(next);
    } while (c !== '0');
  }

  return NextResponse.json({ blobsDeleted: urls.length, keysDeleted }, { headers: { 'Cache-Control': 'no-store' } });
}
