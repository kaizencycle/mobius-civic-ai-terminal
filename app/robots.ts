import type { MetadataRoute } from 'next';

import { CANONICAL_TERMINAL_ORIGIN } from '@/lib/site/canonicalUrl';

const AI_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'PerplexityBot',
  'anthropic-ai',
  'Googlebot',
  'Applebot',
] as const;

export default function robots(): MetadataRoute.Robots {
  const rules: MetadataRoute.Robots['rules'] = [
    {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
    ...AI_CRAWLERS.map((userAgent) => ({
      userAgent,
      allow: '/',
      disallow: '/api/',
    })),
  ];

  return {
    rules,
    host: CANONICAL_TERMINAL_ORIGIN,
  };
}
