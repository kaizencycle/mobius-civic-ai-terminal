/**
 * C-372: Core parcel flush logic for runtime dispatch (uses shared .mjs format + GitHub App).
 */

import { getSeal } from '@/lib/vault-v2/store';
import type { Seal } from '@/lib/vault-v2/types';
import { listVaultDeposits } from '@/lib/vault/vault';
import type { AgentJournalEntry } from '@/lib/terminal/types';
import { kvGet, kvLrange } from '@/lib/kv/store';

const GENESIS_AGENTS = ['atlas', 'zeus', 'eve', 'hermes', 'aurea', 'jade', 'daedalus', 'echo'] as const;
const KV_JOURNAL_LIST_READ_MAX = 500;

type FlushResult = {
  parcel_path: string;
  parcel_hash: string;
  prev_parcel_hash: string;
  pr_url?: string;
  pr_number?: number;
};

function parseMaybeJson(row: unknown): unknown | null {
  if (typeof row !== 'string') return row ?? null;
  try {
    return JSON.parse(row) as unknown;
  } catch {
    return null;
  }
}

function parseJournalEntry(candidate: unknown): AgentJournalEntry | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  const agent = typeof row.agent === 'string' ? row.agent.toUpperCase() : '';
  const cycle = typeof row.cycle === 'string' ? row.cycle : '';
  const timestamp = typeof row.timestamp === 'string' ? row.timestamp : '';
  const observation = typeof row.observation === 'string' ? row.observation : '';
  const inference = typeof row.inference === 'string' ? row.inference : '';
  const recommendation = typeof row.recommendation === 'string' ? row.recommendation : '';
  const agentOrigin = typeof row.agentOrigin === 'string' ? row.agentOrigin.toUpperCase() : '';
  if (!id || !agent || !cycle || !timestamp || !observation || !inference || !recommendation || !agentOrigin) {
    return null;
  }
  if (row.source !== 'agent-journal') return null;
  return candidate as AgentJournalEntry;
}

async function loadAllJournalEntries(): Promise<AgentJournalEntry[]> {
  const indexRows = (await kvGet<unknown[]>('agent:journal:index').catch(() => null)) ?? [];
  const allRows = await kvLrange<unknown>('journal:all', 0, KV_JOURNAL_LIST_READ_MAX - 1).catch(() => []);
  const agentRows = await Promise.all(
    GENESIS_AGENTS.map((a) =>
      kvLrange<unknown>(`journal:${a}`, 0, KV_JOURNAL_LIST_READ_MAX - 1).catch(() => []),
    ),
  );

  const seen = new Set<string>();
  const out: AgentJournalEntry[] = [];
  for (const row of [...indexRows, ...allRows, ...agentRows.flat()]) {
    const candidate = parseMaybeJson(row);
    const parsed = parseJournalEntry(candidate);
    if (!parsed) continue;
    if (seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    out.push(parsed);
  }
  if (out.length === 0) {
    throw new Error('KV journal read returned zero entries — partial canon forbidden');
  }
  return out;
}

function resolveSealJournalEntries(
  seal: Seal,
  allEntries: AgentJournalEntry[],
  deposits: Awaited<ReturnType<typeof listVaultDeposits>>,
): AgentJournalEntry[] {
  const sigSet = new Set(seal.deposit_hashes ?? []);
  const journalIds = new Set<string>();
  for (const d of deposits) {
    if (sigSet.has(d.content_signature)) journalIds.add(d.journal_id);
  }
  const byId = new Map(allEntries.map((e) => [e.id, e]));
  const resolved: AgentJournalEntry[] = [];
  for (const jid of journalIds) {
    const entry = byId.get(jid);
    if (entry) resolved.push(entry);
  }
  resolved.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  return resolved;
}

export async function flushSealParcelToSubstrate(sealInput: Seal): Promise<FlushResult> {
  const seal = (await getSeal(sealInput.seal_id)) ?? sealInput;
  if (seal.status !== 'attested') {
    throw new Error(`Seal ${seal.seal_id} status is ${seal.status} — only attested seals may flush`);
  }

  const expectedCount = seal.source_entries;
  if (expectedCount <= 0) {
    throw new Error(`Seal ${seal.seal_id} has no source_entries`);
  }

  const [allEntries, deposits] = await Promise.all([loadAllJournalEntries(), listVaultDeposits(200)]);
  const entries = resolveSealJournalEntries(seal, allEntries, deposits);
  if (entries.length === 0) {
    throw new Error(`No journal entries resolved for seal ${seal.seal_id}`);
  }
  if (entries.length !== expectedCount) {
    throw new Error(
      `Entry count mismatch: seal.source_entries=${expectedCount} resolved=${entries.length}`,
    );
  }

  const {
    GENESIS_PARCEL_HASH,
    buildParcelFile,
    compareParcelPaths,
    formatParcelPath,
    verifyParcelFileContent,
  } = await import('../../scripts/lib/parcel-format.mjs');

  const {
    buildFlushIntentBlock,
    createPullRequest,
    ensureBranch,
    getBaseSha,
    getInstallationToken,
    listCanonJournalParcels,
    putFile,
    readRepoFile,
  } = await import('../../scripts/lib/daedalus-github.mjs');

  const token = await getInstallationToken();
  const baseBranch = 'main';
  const paths = await listCanonJournalParcels(token, baseBranch);
  let prevParcelHash = GENESIS_PARCEL_HASH;
  if (paths.length > 0) {
    paths.sort(compareParcelPaths);
    const lastPath = paths[paths.length - 1];
    const content = await readRepoFile(token, lastPath, baseBranch);
    if (!content) throw new Error(`prev parcel ${lastPath} unreadable`);
    const verdict = verifyParcelFileContent(content);
    if (!verdict.ok) throw new Error(`prev parcel invalid: ${verdict.error}`);
    prevParcelHash = verdict.parcelHash ?? GENESIS_PARCEL_HASH;
  }

  const cycle = seal.cycle_at_seal ?? 'unknown';
  const parcelPath = formatParcelPath(cycle, seal.sequence);
  const built = buildParcelFile({
    cycle,
    seal_id: seal.seal_id,
    seal_hash: seal.seal_hash,
    gi_at_seal: seal.gi_at_seal,
    entry_count: expectedCount,
    prev_parcel_hash: prevParcelHash,
    created_at: seal.sealed_at ?? new Date().toISOString(),
    attestations: seal.attestations,
    entries,
  });

  const selfCheck = verifyParcelFileContent(built.fileText);
  if (!selfCheck.ok) throw new Error(`parcel self-check failed: ${selfCheck.error}`);

  const branch = `flush/${cycle}-parcel-${String(seal.sequence).padStart(3, '0')}`;
  const baseSha = await getBaseSha(token, baseBranch);
  await ensureBranch(token, branch, baseSha);
  await putFile(token, branch, parcelPath, built.fileText, `canon(${cycle}): journal parcel ${seal.seal_id}`);

  const prBody = buildFlushIntentBlock({
    cycle,
    seal_id: seal.seal_id,
    entry_count: expectedCount,
    parcel_hash: built.parcelHash,
    prev_parcel_hash: prevParcelHash,
  });

  const pr = await createPullRequest(token, {
    title: `canon(${cycle}): journal parcel flush ${seal.seal_id}`,
    head: branch,
    base: baseBranch,
    body: prBody,
    draft: true,
  });

  return {
    parcel_path: parcelPath,
    parcel_hash: built.parcelHash,
    prev_parcel_hash: prevParcelHash,
    pr_url: pr.html_url as string | undefined,
    pr_number: pr.number as number | undefined,
  };
}
