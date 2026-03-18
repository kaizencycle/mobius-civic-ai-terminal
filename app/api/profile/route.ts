/**
 * Mobius Profile API Route
 *
 * GET  /api/profile?login=xxx — Get a participant's Mobius profile
 * POST /api/profile — Ensure a profile exists (create if new)
 */

import { NextResponse } from 'next/server';
import { getProfile, ensureProfile, getEpiconsByLogin } from '@/lib/mobius/stores';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const login = searchParams.get('login');

  if (!login) {
    return NextResponse.json({ ok: false, error: 'login parameter is required' }, { status: 400 });
  }

  const profile = getProfile(login);
  if (!profile) {
    return NextResponse.json({
      ok: false,
      error: `No profile found for ${login}`,
      profile: {
        login,
        displayName: login,
        miiScore: 0.50,
        nodeTier: 'participant',
        epiconCount: 0,
        verificationHits: 0,
        verificationMisses: 0,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        miiHistory: [],
      },
      epicons: [],
    });
  }

  const epicons = getEpiconsByLogin(login);
  return NextResponse.json({ ok: true, profile, epicons });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      login: string;
      displayName: string;
    };

    if (!body.login?.trim()) {
      return NextResponse.json({ ok: false, error: 'login is required' }, { status: 400 });
    }

    const profile = ensureProfile(
      body.login.trim(),
      body.displayName?.trim() || body.login.trim(),
    );

    return NextResponse.json({ ok: true, profile });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid request body' },
      { status: 400 },
    );
  }
}
