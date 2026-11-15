import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Figtree } from 'next/font/google';

export const metadata: Metadata = {
  title: { default: 'Spurs Pay', template: '%s · Spurs Pay' },
  description: 'Send, receive and manage money with your Spurs account.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7fa' },
    { media: '(prefers-color-scheme: dark)', color: '#09111e' },
  ],
};

const figtree = Figtree({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-figtree',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  

  return (
    <html lang="en-NG">
      <body className={`antialiased ${figtree.variable}`}>{children}</body>
    </html>
  );
}
