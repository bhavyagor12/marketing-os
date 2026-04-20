import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@marketing-os/db', '@marketing-os/shared'],
  experimental: {
    typedRoutes: true,
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
};

export default nextConfig;
