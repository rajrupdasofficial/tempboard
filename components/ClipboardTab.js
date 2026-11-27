'use client';
import { useState } from 'react';
import { MAX_LINES } from '../lib/config';
import { copyText } from '../lib/utils';
import { createClip, receiveClip } from '../app/actions/clipboard';
import OtpDisplay from './OtpDisplay';
import Modal from './Modal';
import SegTabs from './SegTabs';

const MODES = [{ id: 'send', label: 'Send' }, { id: 'receive', label: 'Receive' }];

export default function ClipboardTab() {
  const [mode, setMode] = useState('send');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [rxBusy, setRxBusy] = useState(false);
  const [rxError, setRxError] = useState('');
  const [received, setReceived] = useState(null);
  const [copied, setCopied] = useState(false);

  const lines = text ? text.split('\n').length : 0;
  const tooLong = lines > MAX_LINES;

  async function submit() {
    setBusy(true); setError('');
    try {
      const r = await createClip(text);
      if (!r.ok) throw new Error(r.error);
      setOtp(r.otp); setText('');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function receive() {
    setRxBusy(true); setRxError('');
    try {
      const r = await receiveClip(code);
      if (!r.ok) throw new Error(r.error);
      setReceived(r.text); setCopied(false); setCode('');
    } catch (e) { setRxError(e.message); }
    setRxBusy(false);
  }

  return (
    <div className="glass card">
      <SegTabs value={mode} onChange={setMode} options={MODES} label="Clipboard mode" />

      <div className="swap" key={mode}>
        {mode === 'send' ? (
          otp ? (
            <OtpDisplay otp={otp} note="Works once and expires in 30 minutes." onReset={() => setOtp('')} resetLabel="Send another" />
          ) : (
            <>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste or type anything…" spellCheck={false} rows={9} />
              <div className={`meta ${tooLong ? 'bad' : ''}`}>{lines.toLocaleString()} / {MAX_LINES.toLocaleString()} lines</div>
              {error && <p className="error">{error}</p>}
              <button className="btn" disabled={busy || !text.trim() || tooLong} onClick={submit}>{busy ? 'Creating OTP…' : 'Get OTP'}</button>
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
            <button className="btn" disabled={rxBusy || code.length !== 6} onClick={receive}>{rxBusy ? 'Checking…' : 'Show text'}</button>
            <p className="note center">Opening the text uses up the OTP.</p>
          </>
        )}
      </div>

      <Modal open={received !== null} onClose={() => setReceived(null)} title="Clipboard text">
        <textarea className="viewer" readOnly value={received ?? ''} rows={12} />
        <div className="row">
          <button className="btn" onClick={async () => { await copyText(received); setCopied(true); }}>{copied ? 'Copied to clipboard' : 'Copy to clipboard'}</button>
          <button className="btn ghost" onClick={() => setReceived(null)}>Close</button>
        </div>
      </Modal>
    </div>
  );
}
