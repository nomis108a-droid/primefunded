
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const rateLimitMap = new Map<string, { count: number; lastReset: number }>();

export function middleware(request: NextRequest) {
  // 1. Identify Client (Prefer x-forwarded-for in production)
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : (request.ip ?? '127.0.0.1');
  const now = Date.now();
  const pathname = request.nextUrl.pathname;
  
  // 2. Define Critical Path Flags
  const isApiRoute = pathname.startsWith('/api');
  const isAdminPath = pathname.startsWith('/admin');
  const isMaintenancePage = pathname === '/maintenance';
  const isStaticAsset = pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico') || pathname.endsWith('.png') || pathname.endsWith('.jpg');

  /**
   * CRITICAL BYPASS: Ensure Administrative and Core API paths are never blocked 
   * by the UI rate limiter. This restores access to /admin immediately.
   */
  if (isAdminPath || isApiRoute || isStaticAsset || isMaintenancePage) {
    return NextResponse.next();
  }

  // 3. Maintenance Mode Redirect
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
  if (isMaintenanceMode) {
    return NextResponse.redirect(new URL('/maintenance', request.url));
  }

  /**
   * 4. Rate Limiting (Standard UI Routes Only)
   * Threshold: 200 requests per 60 seconds.
   */
  const limit = 200;
  const windowMs = 60 * 1000;

  const currentLimit = rateLimitMap.get(ip) ?? { count: 0, lastReset: now };

  // Reset window if expired
  if (now - currentLimit.lastReset > windowMs) {
    currentLimit.count = 1;
    currentLimit.lastReset = now;
  } else {
    currentLimit.count++;
  }

  rateLimitMap.set(ip, currentLimit);

  if (currentLimit.count > limit) {
    console.warn(`[Middleware] Rate limit exceeded for IP: ${ip} on path: ${pathname}`);
    return new NextResponse('Too Many Requests', { 
      status: 429,
      headers: {
        'Retry-After': '60',
        'Content-Type': 'text/plain'
      }
    });
  }

  const response = NextResponse.next();
  
  // 5. Security Headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
