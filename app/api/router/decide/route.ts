import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Task = {
  type?: string;
  affectsLedger?: boolean;
  highImpact?: boolean;
  repetitive?: boolean;
  private?: boolean;
};

function routeTask(task: Task) {
  if (task.affectsLedger) return 'cloud+zeus';
  if (task.highImpact) return 'cloud';
  if (task.repetitive) return 'local';
  if (task.private) return 'local';
  return 'hybrid';
}

export async function POST(req: NextRequest) {
  let task: Task = {};
  try {
    task = await req.json();
  } catch {
    task = {};
  }

  const route = routeTask(task);

  return NextResponse.json({
    ok: true,
    route,
    task,
    phase: 'C-298.phase1.readonly',
    notes: [
      'No model execution performed',
      'No ledger/canon/replay mutation',
      'Routing decision only'
    ],
    timestamp: new Date().toISOString()
  }, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'X-Mobius-Source': 'router-decide'
    }
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: 'C-298.phase1.router.v1',
    usage: {
      method: 'POST',
      example: {
        affectsLedger: true,
        highImpact: true
      }
    }
  });
}
