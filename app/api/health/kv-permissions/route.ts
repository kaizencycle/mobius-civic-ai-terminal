import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ProbeStatus = {
  ok: boolean;
  read: boolean;
  write: boolean;
  counter: boolean;
  list: boolean;
  configured: boolean;
  errors: string[];
  timestamp: string;
};

function getRedisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function GET() {
  const redis = getRedisClient();
  const now = new Date().toISOString();
  const keyToken = crypto.randomUUID();
  const baseKey = `health:kv-permissions:${keyToken}`;
  const errors: string[] = [];

  const status: ProbeStatus = {
    ok: false,
    read: false,
    write: false,
    counter: false,
    list: false,
    configured: Boolean(redis),
    errors,
    timestamp: now,
  };

  if (!redis) {
    errors.push('kv_env_missing');
    return NextResponse.json(status, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    await redis.set(`${baseKey}:string`, now, { ex: 60 });
    status.write = true;
  } catch (error) {
    errors.push(`set_failed: ${errorMessage(error)}`);
  }

  try {
    const value = await redis.get<string>(`${baseKey}:string`);
    status.read = value === now || typeof value === 'string';
  } catch (error) {
    errors.push(`get_failed: ${errorMessage(error)}`);
  }

  try {
    const value = await redis.incr(`${baseKey}:counter`);
    status.counter = typeof value === 'number' && value >= 1;
    await redis.expire(`${baseKey}:counter`, 60);
  } catch (error) {
    errors.push(`incr_failed: ${errorMessage(error)}`);
  }

  try {
    await redis.lpush(`${baseKey}:list`, 'probe');
    const rows = await redis.lrange<string>(`${baseKey}:list`, 0, 0);
    await redis.ltrim(`${baseKey}:list`, 0, 0);
    await redis.expire(`${baseKey}:list`, 60);
    status.list = Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    errors.push(`list_failed: ${errorMessage(error)}`);
  }

  status.ok = status.configured && status.read && status.write && status.counter && status.list;

  return NextResponse.json(status, {
    status: status.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
