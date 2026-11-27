'use client';
import { useEffect, useRef, useState } from 'react';
import { downloadZip } from 'client-zip';
import Modal from './Modal';
import { formatBytes, linkDownload, saveBlob } from '../lib/utils';
import { completeFiles } from '../app/actions/files';

// `final` sessions (destroy mode, or the 5th download) download through fetch() so we know
// exactly when they're finished, then ask the server to delete the blobs.
export default function FileSessionModal({ session, onClose }) {
  const { files, destroy, final, remaining, token } = session;
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [doneSet, setDoneSet] = useState(() => new Set());
  const [cleaned, setCleaned] = useState(false);
  const doneRef = useRef(new Set());
  const cleanedRef = useRef(false);
  const started = useRef(false);

  async function cleanup() {
    if (!final || !token || cleanedRef.current) return;
    cleanedRef.current = true;
    try {
      const r = await completeFiles(token);
      if (!r.ok) throw new Error(r.error);
      setCleaned(true);
    } catch { cleanedRef.current = false; }
  }

  function markDone(indices) {
    indices.forEach((i) => doneRef.current.add(i));
    setDoneSet(new Set(doneRef.current));
    if (doneRef.current.size === files.length) cleanup();
  }

  async function fetchFile(f) {
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`Couldn’t fetch ${f.name}`);
    return res;
  }

  async function downloadOne(i) {
    const f = files[i];
    if (!final) { linkDownload(f.downloadUrl); return; }
    setBusy(true); setStatus(`Downloading ${f.name}…`);
    try {
      saveBlob(await (await fetchFile(f)).blob(), f.name);
      markDone([i]); setStatus('');
    } catch (e) { setStatus(e.message); }
    setBusy(false);
  }

  async function downloadAll() {
    if (files.length === 1) return downloadOne(0);
    setBusy(true); setStatus('Building ZIP, keep this tab open…');
    try {
      const used = new Map();
      const inputs = [];
      for (const f of files) {
        const n = used.get(f.name) || 0;
        used.set(f.name, n + 1);
        const name = n ? f.name.replace(/(\.[^.]*)?$/, (ext) => ` (${n})${ext || ''}`) : f.name;
        inputs.push({ name, input: await fetchFile(f), lastModified: new Date() });
      }
      saveBlob(await downloadZip(inputs).blob(), 'tempboard-files.zip');
      markDone(files.map((_, i) => i)); setStatus('');
    } catch (e) { setStatus(e.message || 'ZIP failed. Try again.'); }
    setBusy(false);
  }

  // Destroy mode starts the download immediately.
  useEffect(() => {
    if (destroy && !started.current) { started.current = true; downloadAll(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    if (final && !cleanedRef.current) {
      if (!window.confirm('Closing now permanently deletes these files. Close anyway?')) return;
      cleanup();
    }
    onClose();
  }

  const banner = destroy
    ? 'One-time download. Files are deleted from the server as soon as it finishes.'
    : final
      ? 'That was the 5th and last download. Files are deleted once you’ve got them all.'
      : `${remaining} download${remaining === 1 ? '' : 's'} left after this one.`;

  return (
    <Modal open onClose={close} title="Your files">
      <p className="note top">{banner}</p>
      <ul className="files">
        {files.map((f, i) => (
          <li key={i}>
            <span className="fname">{f.name}</span>
            <span className="fsize">{formatBytes(f.size)}</span>
            <button className="btn sm ghost" disabled={busy || cleaned} onClick={() => downloadOne(i)}>
              {doneSet.has(i) ? 'Again' : 'Download'}
            </button>
          </li>
        ))}
      </ul>
      {status && <p className="note">{status}</p>}
      {cleaned && <p className="ok">Files deleted from the server.</p>}
      <div className="row">
        {files.length > 1 && <button className="btn" disabled={busy || cleaned} onClick={downloadAll}>Download all as ZIP</button>}
        <button className="btn ghost" onClick={close}>Close</button>
      </div>
    </Modal>
  );
}
