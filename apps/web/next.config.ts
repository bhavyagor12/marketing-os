import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@marketing-os/db', '@marketing-os/shared'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
