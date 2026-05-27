import { NextResponse } from 'next/server';
import { kvGetSafe } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

type ZeusDispute = { cycle: string; message: string; ts: number };
type EpiconEscalation = {
  failures: number;
  severity: 'warn' | 'error' | 'critical' | 'alert';
  label: string;
  ts: number;
};

export async function GET() {
  const [zeusDispute, epiconEscalation] = await Promise.all([
    kvGetSafe<ZeusDispute>('zeus:dispute:latest'),
    kvGetSafe<EpiconEscalation>('watchdog:epicon:escalation'),
  ]);

  return NextResponse.json({ zeusDispute, epiconEscalation });
}
