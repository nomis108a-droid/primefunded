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
  },
  images: {
    minimumCacheTTL: 3600,
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }
    ],
  },
  async rewrites() {
    // Serve standard icon paths from the local logo file added to the project
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
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://s3.tradingview.com https://*.tradingview.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src * data: blob: https:; font-src 'self' https://fonts.gstatic.com; frame-src 'self' https://www.google.com https://s.tradingview.com https://*.tradingview.com; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.firebasedatabase.app;",
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
