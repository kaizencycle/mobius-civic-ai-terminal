import type { NextConfig } from 'next';

// OPT-08(C-352): unsafe-eval is required by Next.js dev hot-reload but not in production.
const isDev = process.env.NODE_ENV === 'development';

// C-318: Security headers applied to every response.
// CSP allows Next.js inline scripts/styles and Vercel Live tooling while
// blocking third-party script execution and iframe embedding from other origins.
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://vercel.live`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' wss: https:",
      "worker-src 'self' blob:",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // C-339 PR-C item 6: make the strict-build contract explicit. These default
  // to false in Next.js, but pinning them here prevents a future "just ship it"
  // edit from silently turning the production build into a warning generator —
  // typecheck and lint errors must keep failing the build (BUILD.md contract).
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  bundlePagesRouterDependencies: true,
  serverExternalPackages: ['@mobius/integrity-core'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'motion'],
  },
  async headers() {
    return [
      // C-318: Security headers on every route
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // C-300: Cache headers for public read-only endpoints
      {
        source: '/api/terminal/shell',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=60' }],
      },
      {
        source: '/api/echo/digest',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=120' }],
      },
      // OPT-05(C-352): edge cache for snapshot-lite — 15s max-age safe given 78s freshness window
      {
        source: '/api/terminal/snapshot-lite',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=15, stale-while-revalidate=30' }],
      },
    ];
  },
};

export default nextConfig;
