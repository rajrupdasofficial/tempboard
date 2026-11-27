'use client';
import { useState } from 'react';
import Background from '../components/Background';
import ClipboardTab from '../components/ClipboardTab';
import FilesTab from '../components/FilesTab';
import SegTabs from '../components/SegTabs';

const icon = (d) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const TABS = [
  { id: 'clipboard', label: 'Clipboard', icon: icon('M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 12h6M9 16h4') },
  { id: 'files', label: 'Files', icon: icon('M12 16V4m0 0L7 9m5-5 5 5M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3') },
];

export default function Home() {
  const [tab, setTab] = useState('clipboard');
  return (
    <>
      <Background />
      <main className="shell">
        <header className="hero">
          <h1>tempboard</h1>
          <p>Send text or files with a 6-digit code.<br />It disappears after it&apos;s used.</p>
        </header>

        <SegTabs value={tab} onChange={setTab} options={TABS} variant="dock" label="Section" />

        {/* Both stay mounted so an upload keeps running if you switch tabs. */}
        <div className={tab === 'clipboard' ? 'pane' : 'pane hidden'}><ClipboardTab /></div>
        <div className={tab === 'files' ? 'pane' : 'pane hidden'}><FilesTab /></div>
      </main>
    </>
  );
}
