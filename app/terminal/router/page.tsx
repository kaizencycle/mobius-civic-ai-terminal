import type { Metadata } from 'next';
import RouterPageClient from './RouterPageClient';

export const metadata: Metadata = {
  title: 'Router · Mobius Terminal',
};

export default function RouterPage() {
  return <RouterPageClient />;
}
