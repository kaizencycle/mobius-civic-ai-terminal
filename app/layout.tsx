import './globals.css';
import type { Metadata, Viewport } from 'next';
import { MobiusStructuredData } from '@/components/seo/MobiusStructuredData';
import SessionClientProvider from '@/components/auth/SessionClientProvider';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: {
    default: 'Mobius Civic AI Terminal — Civic Intelligence Dashboard',
    template: '%s | Mobius Terminal',
  },
  description:
    'Bloomberg-style civic command console for monitoring Global Integrity, EPICON ledger events, AI agent status, and real-time signals from public APIs. Part of the Mobius Substrate governance infrastructure. CC0 public domain.',
  keywords: [
    'civic AI',
    'AI governance',
    'integrity monitoring',
    'EPICON',
    'Global Integrity',
    'Mobius Substrate',
    'AI agents',
    'civic technology',
    'democratic accountability',
    'verifiable memory',
    'public domain',
    'CC0',
  ],
  authors: [
    { name: 'Michael Judan', url: 'https://michaeljudan.substack.com' },
    { name: 'Mobius Substrate', url: 'https://github.com/kaizencycle/Mobius-Substrate' },
  ],
  creator: 'Michael Judan',
  publisher: 'Mobius Substrate',
  metadataBase: new URL('https://mobius-civic-ai-terminal.vercel.app'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://mobius-civic-ai-terminal.vercel.app',
    siteName: 'Mobius Civic AI Terminal',
    title: 'Mobius Civic AI Terminal — Civic Intelligence Dashboard',
    description:
      'Bloomberg-style civic command console for monitoring Global Integrity, EPICON ledger events, AI agent status, and real-time signals from 9 public APIs.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mobius Civic AI Terminal',
    description:
      'Civic AI governance dashboard with real-time integrity monitoring, multi-agent consensus, and public API signal feeds.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mobius Terminal',
  },
  other: {
    'application-name': 'Mobius Civic AI Terminal',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <MobiusStructuredData />
      </head>
      <body className="font-sans"><SessionClientProvider>{children}</SessionClientProvider></body>
    </html>
  );
}
