import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveAuthAliasRedirectUrl } from '@/lib/auth/baseUrl';

export function middleware(request: NextRequest): NextResponse {
  const redirectUrl = resolveAuthAliasRedirectUrl(request.nextUrl);
  if (redirectUrl) {
    return NextResponse.redirect(redirectUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/auth/:path*',
};
