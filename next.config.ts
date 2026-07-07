import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    optimizeCss: true,
    instrumentationHook: true,
  },
  images: {
    minimumCacheTTL: 3600,
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' }
    ],
  },
  async rewrites() {
    return [
      {
        source: '/apple-touch-icon.png',
        destination: '/pf-logo.png',
      },
      {
        source: '/favicon.ico',
        destination: '/pf-logo.png',
      },
      {
        source: '/favicon-32x32.png',
        destination: '/pf-logo.png',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.google.com https://www.gstatic.com https://apis.google.com https://s3.tradingview.com https://*.tradingview.com https://*.firebaseio.com https://*.firebasedatabase.app https://studio-8383940162-6976e-default-rtdb.asia-southeast1.firebasedatabase.app https://*.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src * data: blob: https:; font-src 'self' https://fonts.gstatic.com; frame-src 'self' https://www.google.com https://s3.tradingview.com https://*.tradingview.com; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.firebasedatabase.app https://studio-8383940162-6976e-default-rtdb.asia-southeast1.firebasedatabase.app wss://*.firebaseio.com wss://*.firebasedatabase.app wss://studio-8383940162-6976e-default-rtdb.asia-southeast1.firebasedatabase.app; worker-src 'self' blob:;",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
