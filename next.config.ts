import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Libera fotos hospedadas fora do projeto (Unsplash hoje, seu CDN depois).
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
    ],
  },
};

export default nextConfig;
