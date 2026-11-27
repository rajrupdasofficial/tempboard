import './globals.css';
import { connection } from 'next/server';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';

const sans = Space_Grotesk({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata = {
  title: 'Tempboard: temporary clipboard & file sharing',
  description: 'Share text and files with a one-time OTP. Nothing sticks around.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#060a14',
};

export default async function RootLayout({ children }) {
  await connection(); // render per-request so the CSP nonce can be applied to Next's scripts
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
