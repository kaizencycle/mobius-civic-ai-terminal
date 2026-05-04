import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  bundlePagesRouterDependencies: true,
  serverExternalPackages: ['@mobius/integrity-core'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  // C-300: Optimize cache headers for shell/digest endpoints to reduce stale hits
  async headers() {
    return [
      {
        source: '/api/terminal/shell',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=30, stale-while-revalidate=60'
          }
        ]
      },
      {
        source: '/api/echo/digest',
        headers: [
          {
            key: 'Cache-Control', 
            value: 'public, s-maxage=60, stale-while-revalidate=120'
          }
        ]
      }
    ];
  }
};

export default nextConfig;
