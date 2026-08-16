import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { shouldRedirectAuthAliasNavigation } from '@/lib/auth/baseUrl';

export function middleware(request: NextRequest): NextResponse {
  const redirectUrl = shouldRedirectAuthAliasNavigation(
    request.nextUrl,
    request.headers,
    request.method,
  );
  if (redirectUrl) {
    return NextResponse.redirect(redirectUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/auth/:path*',
};
