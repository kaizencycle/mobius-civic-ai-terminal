import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, kv } from '@vercel/kv';
import type { ReconciliationSealRecord, SealReconciliationMeta, SealStatus } from '@/lib/seal/types';

const SEAL_DIR = path.join(process.cwd(), 'data', 'seals');
const RECON_KEY_PREFIX = 'seal:reconciliation:';

function getKvClient(): ReturnType<typeof createClient> | typeof kv | null {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) return kv;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return createClient({ url, token });
  return null;
}

function defaultReconciliationMeta(reason: string | null = null): SealReconciliationMeta {
  return {
    quarantine_reason: reason,
    attempt_count: 0,
    last_attempt_at: null,
    last_attempt_result: null,
    finalized_at: null,
    failed_at: null,
    reserve_increment_applied: false,
  };
}

function hydrateSeal(record: ReconciliationSealRecord): ReconciliationSealRecord {
  return {
    ...record,
    reconciliation: {
      ...defaultReconciliationMeta(record.reconciliation?.quarantine_reason ?? null),
      ...(record.reconciliation ?? {}),
    },
  };
}

async function readSealFromDisk(sealId: string): Promise<ReconciliationSealRecord> {
  const raw = await fs.readFile(path.join(SEAL_DIR, `${sealId}.json`), 'utf-8');
  return hydrateSeal(JSON.parse(raw) as ReconciliationSealRecord);
}

async function writeSealToDisk(sealId: string, record: ReconciliationSealRecord): Promise<void> {
  await fs.mkdir(SEAL_DIR, { recursive: true });
  await fs.writeFile(path.join(SEAL_DIR, `${sealId}.json`), JSON.stringify(record, null, 2));
}

export async function loadSeal(sealId: string): Promise<ReconciliationSealRecord | null> {
  try {
    const base = await readSealFromDisk(sealId);
    const client = getKvClient();
    if (!client) return base;

    const meta = await client.get<SealReconciliationMeta>(`${RECON_KEY_PREFIX}${sealId}`);
    if (!meta) return base;

    return {
      ...base,
      status: inferStatusFromMeta(base.status, meta),
      reconciliation: {
        ...base.reconciliation,
        ...meta,
      },
    };
  } catch {
    return null;
  }
}

function inferStatusFromMeta(current: SealStatus, meta: SealReconciliationMeta): SealStatus {
  if (meta.finalized_at) return 'finalized';
  if (meta.failed_at) return 'failed_permanent';
  return current;
}

export async function saveSeal(sealId: string, record: ReconciliationSealRecord): Promise<void> {
  await writeSealToDisk(sealId, record);

  const client = getKvClient();
  if (!client) return;

  await client.set(`${RECON_KEY_PREFIX}${sealId}`, record.reconciliation);
}

export async function updateSealStatus(
  sealId: string,
  status: SealStatus,
  patch: Partial<SealReconciliationMeta> = {},
): Promise<ReconciliationSealRecord | null> {
  const seal = await loadSeal(sealId);
  if (!seal) return null;

  const updated: ReconciliationSealRecord = {
    ...seal,
    status,
    reconciliation: {
      ...seal.reconciliation,
      ...patch,
    },
  };

  await saveSeal(sealId, updated);
  return updated;
}

export async function listSeals(): Promise<ReconciliationSealRecord[]> {
  try {
    await fs.mkdir(SEAL_DIR, { recursive: true });
    const files = await fs.readdir(SEAL_DIR);
    const parsed = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          const raw = await fs.readFile(path.join(SEAL_DIR, f), 'utf-8');
          return hydrateSeal(JSON.parse(raw) as ReconciliationSealRecord);
        }),
    );

    return parsed;
  } catch {
    return [];
  }
}

export async function listSealsByStatus(status: SealStatus): Promise<ReconciliationSealRecord[]> {
  const seals = await listSeals();
  return seals.filter((seal) => seal.status === status);
}
