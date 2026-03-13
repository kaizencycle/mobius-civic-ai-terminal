import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mobius Civic AI Terminal',
  description:
    'A civic Bloomberg-style command terminal for Mobius Substrate.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
