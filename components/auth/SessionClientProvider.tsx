'use client';

import { SessionProvider } from 'next-auth/react';

export default function SessionClientProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
