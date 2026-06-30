// C-352: motion accessibility audit complete — AnimatePresence in EventScreener.tsx
// does not drive Framer Motion animations directly; animate-pulse uses Tailwind CSS
// which respects prefers-reduced-motion via the @media query in globals.css.
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { MobiusStructuredData } from '@/components/seo/MobiusStructuredData';
import SessionClientProvider from '@/components/auth/SessionClientProvider';
import { CANONICAL_TERMINAL_ORIGIN } from '@/lib/site/canonicalUrl';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
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
  metadataBase: new URL(CANONICAL_TERMINAL_ORIGIN),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: CANONICAL_TERMINAL_ORIGIN,
    siteName: 'Mobius Civic AI Terminal',
    title: 'Mobius Civic AI Terminal — Civic Intelligence Dashboard',
    description:
      'Bloomberg-style civic command console for monitoring Global Integrity, EPICON ledger events, AI agent status, and real-time signals from 9 public APIs.',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'Mobius Civic AI Terminal — Civic Intelligence Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mobius Civic AI Terminal',
    description:
      'Civic AI governance dashboard with real-time integrity monitoring, multi-agent consensus, and public API signal feeds.',
    images: ['/api/og'],
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
