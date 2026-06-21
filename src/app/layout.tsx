import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import { ProgressBar } from '@/components/ProgressBar';
import { PerformanceTracker } from '@/components/PerformanceTracker';
import { Suspense } from 'react';

const logoUrl = 'https://picsum.photos/seed/pflogo-blue-silver/400/400';

export const viewport: Viewport = {
  themeColor: '#020817',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: 'PrimeFunded | Institutional Trading Challenges',
  description: 'Scale your trading career with PrimeFunded institutional funding. No consistency rules, daily payouts, and up to $200,000 in capital.',
  keywords: ['prop firm', 'funded account', 'trading challenge', 'forex funding', 'institutional capital'],
  authors: [{ name: 'PrimeFunded Global' }],
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://primefunded.com',
    siteName: 'PrimeFunded',
    title: 'PrimeFunded | Trade with Institutional Capital',
    description: 'Get funded up to $200,000. Keep 80% of your profits. Start your challenge today.',
    images: [
      {
        url: logoUrl,
        width: 1200,
        height: 630,
        alt: 'PrimeFunded Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PrimeFunded | Institutional Trading Challenges',
    description: 'The world\'s most transparent prop firm. No hidden rules.',
    images: [logoUrl],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Source+Code+Pro:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground">
        <FirebaseClientProvider>
          <Suspense fallback={null}>
            <PerformanceTracker />
            <ProgressBar />
          </Suspense>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
