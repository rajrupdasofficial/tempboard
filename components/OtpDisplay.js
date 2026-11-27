'use client';
import { useState } from 'react';
import { copyText } from '../lib/utils';

export default function OtpDisplay({ otp, note, onReset, resetLabel }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="otp-card" key={otp}>
      <div className="otp-digits" aria-label={`OTP ${otp.split('').join(' ')}`}>
        {otp.split('').map((d, i) => <span key={i} style={{ animationDelay: `${i * 70}ms` }}>{d}</span>)}
      </div>
      <p className="note center">{note}</p>
      <div className="row full">
        <button className="btn" onClick={async () => { await copyText(otp); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? 'OTP copied' : 'Copy OTP'}
        </button>
        {onReset && <button className="btn ghost" onClick={onReset}>{resetLabel}</button>}
      </div>
    </div>
  );
}
