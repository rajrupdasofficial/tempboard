'use client';
import { useRef, useState } from 'react';
import { put } from '@vercel/blob/client';
import { MAX_TOTAL_BYTES } from '../lib/config';
import { formatBytes } from '../lib/utils';
import { requestUploadTokens, createFileOtp, receiveFiles } from '../app/actions/files';
import OtpDisplay from './OtpDisplay';
import FileSessionModal from './FileSessionModal';
import SegTabs from './SegTabs';

const MODES = [{ id: 'send', label: 'Send' }, { id: 'receive', label: 'Receive' }];
const CONCURRENCY = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Uploads ONE file straight to Vercel Blob and can never hang silently:
//  - attempts 1-2 report real progress; if no progress arrives for 20 s the request is aborted and retried
//  - attempts 3-4 skip the SDK's progress tracking (a different, simpler code path) with a size-based timeout
//  - every failure is logged to the console and the final error message is shown on the file's row
async function uploadOne({ file, pathname, clientToken, onPct, onMode }) {
  const multipart = file.size > 16 * 1024 * 1024;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const tracked = attempt < 2;
    const ac = new AbortController();
    const started = Date.now();
    let lastTick = started;
    const limitMs = tracked ? 20_000 : 30_000 + (file.size / (200 * 1024)) * 1000; // plain mode: 30 s + 200 KB/s floor
    const watchdog = setInterval(() => {
      const idle = Date.now() - (tracked ? lastTick : started);
      if (idle > limitMs) ac.abort(new Error('Upload stalled'));
    }, 1000);
    try {
      onMode(tracked ? 'up' : 'plain');
      return await put(pathname, file, {
        access: 'public',
        token: clientToken,
        multipart,
        abortSignal: ac.signal,
        ...(tracked && {
          onUploadProgress: ({ percentage }) => { lastTick = Date.now(); onPct(Math.min(99, Math.floor(percentage))); },
        }),
      });
    } catch (e) {
      lastErr = e;
      console.warn(`[tempboard] upload attempt ${attempt + 1} failed for "${file.name}":`, e);
    } finally {
      clearInterval(watchdog);
    }
    await sleep(600 * (attempt + 1));
  }
  throw new Error(`"${file.name}" failed: ${lastErr?.message || 'network error'}`);
}
let uid = 0;

export default function FilesTab() {
  const [mode, setMode] = useState('send');
  const [files, setFiles] = useState([]);           // [{ id, file }]
  const [prog, setProg] = useState([]);             // [{ pct, state: wait|up|done|err }] same order as files
  const [destroy, setDestroy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [sentDestroy, setSentDestroy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const [code, setCode] = useState('');
  const [rxBusy, setRxBusy] = useState(false);
  const [rxError, setRxError] = useState('');
  const [session, setSession] = useState(null);

  const total = files.reduce((a, f) => a + f.file.size, 0);

  function addFiles(list) {
    setError(''); setProg([]);
    const next = [...files];
    for (const f of list) {
      if (f.size === 0) { setError(`"${f.name}" is empty, so it was skipped.`); continue; }
      next.push({ id: ++uid, file: f });
    }
    if (next.reduce((a, f) => a + f.file.size, 0) > MAX_TOTAL_BYTES) {
      setError('Total size can’t go over 1 GB. Remove a file or two.');
      return;
    }
    setFiles(next);
  }

  async function generate() {
    setBusy(true); setError('');
    const items = files;
    setProg(items.map(() => ({ pct: 0, state: 'wait' })));
    const upd = (i, patch) => setProg((p) => p.map((x, k) => (k === i ? { ...x, ...patch } : x)));
    try {
      // One server call authorises every file, then all bytes go straight to Vercel Blob in parallel.
      const t = await requestUploadTokens({ files: items.map(({ file }) => ({ name: file.name, size: file.size })) });
      if (!t.ok) throw new Error(t.error);

      const done = new Array(items.length);
      let next = 0, failed = false;
      const worker = async () => {
        while (!failed && next < items.length) {
          const i = next++;
          const { file } = items[i];
          const { pathname, clientToken } = t.uploads[i];
          upd(i, { state: 'up', pct: 0 });
          try {
            const blob = await uploadOne({
              file, pathname, clientToken,
              onPct: (pct) => upd(i, { pct }),
              onMode: (state) => upd(i, { state, pct: 0 }),
            });
            done[i] = { url: blob.url, pathname };
            upd(i, { pct: 100, state: 'done' });
          } catch (e) {
            failed = true;
            upd(i, { state: 'err', msg: e.message });
            throw e;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));

      const r = await createFileOtp({ files: done, destroy });
      if (!r.ok) throw new Error(r.error);
      setOtp(r.otp); setSentDestroy(destroy); setFiles([]); setProg([]);
    } catch (e) { setError(e.message || 'Upload failed. Try again.'); }
    setBusy(false);
  }

  async function receive() {
    setRxBusy(true); setRxError('');
    try {
      const r = await receiveFiles(code);
      if (!r.ok) throw new Error(r.error);
      setSession(r); setCode('');
    } catch (e) { setRxError(e.message); }
    setRxBusy(false);
  }

  const showBars = prog.length === files.length && prog.length > 0;

  return (
    <div className="glass card">
      <SegTabs value={mode} onChange={setMode} options={MODES} label="Files mode" />

      <div className="swap" key={mode}>
        {mode === 'send' ? (
          otp ? (
            <OtpDisplay
              otp={otp}
              note={sentDestroy ? 'One download, then the files are destroyed.' : 'Good for 5 downloads. Leftovers are wiped every 15 days.'}
              onReset={() => setOtp('')} resetLabel="Send more files"
            />
          ) : (
            <>
              <div
                className={`drop ${drag ? 'over' : ''} ${files.length ? 'compact' : ''}`}
                role="button" tabIndex={0}
                onClick={() => !busy && inputRef.current?.click()}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) addFiles([...e.dataTransfer.files]); }}
              >
                <strong>{files.length ? 'Add more files' : 'Drop files here or tap to choose'}</strong>
                {!files.length && <span>Up to 1 GB in total, one big file or many</span>}
                <input ref={inputRef} type="file" multiple hidden onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
              </div>

              {files.length > 0 && (
                <>
                  <ul className="files">
                    {files.map(({ id, file }, i) => {
                      const p = showBars ? prog[i] : null;
                      return (
                        <li key={id} className={`frow ${p?.state || ''}`}>
                          <div className="frow-top">
                            <span className="fname">{file.name}</span>
                            <span className="fsize">{formatBytes(file.size)}</span>
                            {p ? (
                              <span className="pct" aria-live="polite">{p.state === 'done' ? 'Done' : p.state === 'err' ? 'Failed' : p.state === 'plain' ? 'Uploading' : `${p.pct}%`}</span>
                            ) : (
                              !busy && <button className="icon-btn" aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((f) => f.id !== id))}>✕</button>
                            )}
                          </div>
                          {p && (
                            <div className={`bar ${p.state === 'plain' ? 'indet' : ''}`} role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${file.name}`}>
                              <i style={{ width: `${p.pct}%` }} />
                            </div>
                          )}
                          {p?.state === 'err' && p.msg && <p className="error sm">{p.msg}</p>}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="meta">{files.length} file{files.length === 1 ? '' : 's'} · {formatBytes(total)} of 1 GB</div>

                  <label className="check">
                    <input type="checkbox" checked={destroy} disabled={busy} onChange={(e) => setDestroy(e.target.checked)} />
                    <span>Immediate download and destroy files</span>
                  </label>
                  <p className="note">{destroy ? 'One person can download once, then the files are deleted.' : 'Files are deleted after 5 downloads.'}</p>
                </>
              )}

              {error && <p className="error">{error}</p>}
              <button className="btn" disabled={busy || files.length === 0} onClick={generate}>{busy ? 'Uploading…' : 'Generate OTP'}</button>
            </>
          )
        ) : (
          <>
            <input
              className="otp-input" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6}
              aria-label="6-digit OTP" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && receive()}
            />
            {rxError && <p className="error">{rxError}</p>}
            <button className="btn" disabled={rxBusy || code.length !== 6} onClick={receive}>{rxBusy ? 'Checking…' : 'Get files'}</button>
            <p className="note center">Download files one by one or as a single ZIP.</p>
          </>
        )}
      </div>

      {session && <FileSessionModal session={session} onClose={() => setSession(null)} />}
    </div>
  );
}
