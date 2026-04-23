import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  bundlePagesRouterDependencies: true,
  serverExternalPackages: ['@mobius/integrity-core'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};

export default nextConfig;
