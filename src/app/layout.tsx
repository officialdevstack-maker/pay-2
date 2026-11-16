import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';

export const metadata: Metadata = {
  title: { default: 'Spurs Pay', template: '%s · Spurs Pay' },
  description: 'Payment methods and checkout for Spurs products.',
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

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={inter.variable}>
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
