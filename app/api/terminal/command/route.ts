import { NextRequest, NextResponse } from 'next/server';
import { runTerminalCommand } from '@/lib/commands/run';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await runTerminalCommand(body.input || '');

  return NextResponse.json({
    ok: true,
    result,
  });
}
