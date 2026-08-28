#!/usr/bin/env tsx
/**
 * JOB-17 (C-417) — Track R P3 durable registry/artifact sync.
 *
 * Repairs the gap between Track R's runtime intake state (Vercel cron → KV only,
 * see runTrackRP3GovernanceIntakeCron.ts) and its durable, committed review evidence.
 *
 * Deliberately reads NO KV and makes NO network call: everything this script writes is
 * re-derived deterministically from evidence already committed in this checkout
 * (docs/epicon/cycles/C-407/p3-preparation/runs/<run>/*), via the same hash-verifying
 * runTrackRP3GovernanceIntake() the intake route uses. That is what makes its output
 * durable and reviewable in a PR diff, rather than another runtime-only claim.
 *
 * Writes, only when the intake resolves ok:
 *   - docs/epicon/cycles/C-408/track-r-p3-review/packet-review-registry.json
 *   - docs/epicon/cycles/C-408/track-r-p3-review/<run>/{ZEUS,EVE}_P3_PACKET_REVIEW.md
 *       (machine-verification receipts — explicitly NOT independent review, NOT ADOPT)
 *
 * Never writes a verdict. Never sets zeus_review_status/eve_review_status to anything
 * but 'awaiting_zeus'/'awaiting_eve' unless a real verdict artifact already exists and
 * validates (see trackRP3SelectedReview.ts) or was already terminal in the committed
 * registry, which is preserved rather than clobbered.
 *
 * Usage:
 *   tsx scripts/track-r-p3-review-durability-sync.ts [--expect-run-id=ID] [--expect-packet-hash=HASH] [--repo-root=PATH]
 *
 * If --expect-* is supplied and does not match the resolved candidate, this exits 1
 * with PACKET_BINDING_CHANGED rather than silently syncing a different packet.
 *
 * --repo-root overrides where evidence is read from and output is written (default:
 * process.cwd()) — used by tests to point this script at an isolated copy of the
 * evidence tree instead of the real checkout, so a concurrent test run never mutates
 * shared repository state.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  findPacketReviewEntry,
  loadPacketReviewRegistry,
  upsertPacketReviewEntry,
  writePacketReviewRegistry,
  type PacketReviewRegistry,
  type PacketReviewRegistryEntry,
} from '@/lib/watchdog/batchRepair/p3PacketReviewRegistry';
import { loadIssuedPacketRegistry } from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistry';
import {
  runTrackRP3GovernanceIntake,
  type TrackRP3PacketDisposition,
  type TrackRP3ReviewContext,
} from '@/lib/watchdog/batchRepair/trackRP3GovernanceIntake';
import {
  renderTrackRP3MachineVerificationReceipt,
  trackRP3ReviewArtifactPath,
} from '@/lib/watchdog/batchRepair/trackRP3ReviewArtifacts';
import { resolveTrackRP3SelectedReviewPair } from '@/lib/watchdog/batchRepair/trackRP3SelectedReview';

const TERMINAL_VERDICTS = new Set(['adopt', 'challenge', 'overturn']);

function parseArg(name: string): string | undefined {
  const flag = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(flag));
  return match ? match.slice(flag.length) : undefined;
}

function candidateEntry(args: {
  context: TrackRP3ReviewContext;
  now: string;
  existing?: PacketReviewRegistryEntry;
  repoRoot: string;
}): PacketReviewRegistryEntry {
  const { context, now, existing, repoRoot } = args;
  const samePacket = existing?.packet_hash === context.packet_hash;

  // Resolved as a pair (not two independent calls) so the cross-lane independence
  // collision check always runs before either verdict could be promoted.
  const pair = resolveTrackRP3SelectedReviewPair({ repoRoot, expectedRunId: context.workflow_run_id });
  const zeusVerdict = pair.zeus;
  const eveVerdict = pair.eve;

  const preserveZeus =
    samePacket && existing!.zeus_review_status && TERMINAL_VERDICTS.has(existing!.zeus_review_status);
  const preserveEve =
    samePacket && existing!.eve_review_status && TERMINAL_VERDICTS.has(existing!.eve_review_status);
  const preserveHuman =
    samePacket &&
    existing!.human_review_status &&
    (existing!.human_review_status === 'approved' || existing!.human_review_status === 'rejected');

  const zeusStatus = preserveZeus
    ? existing!.zeus_review_status
    : zeusVerdict.ok && zeusVerdict.review.verdict !== 'PENDING'
      ? (zeusVerdict.review.verdict.toLowerCase() as PacketReviewRegistryEntry['zeus_review_status'])
      : 'awaiting_zeus';
  const eveStatus = preserveEve
    ? existing!.eve_review_status
    : eveVerdict.ok && eveVerdict.review.verdict !== 'PENDING'
      ? (eveVerdict.review.verdict.toLowerCase() as PacketReviewRegistryEntry['eve_review_status'])
      : 'awaiting_eve';

  const humanStatus = preserveHuman ? existing!.human_review_status : 'awaiting_human';

  // Idempotency: if this run's packet-review entry already reflects this exact state
  // (same packet, same statuses, intake already completed), leave last_intake_at as it
  // was rather than stamping 'now' — otherwise a scheduled sync that changes nothing
  // would still produce a git diff (and a commit) every time it runs.
  const unchanged =
    samePacket &&
    existing!.status === 'intake_verified' &&
    existing!.intake_journals_completed === true &&
    existing!.zeus_review_status === zeusStatus &&
    existing!.eve_review_status === eveStatus &&
    existing!.human_review_status === humanStatus;

  return {
    workflow_run_id: context.workflow_run_id,
    packet_hash: context.packet_hash,
    journal_id: context.journal_id,
    journal_hash: context.journal_hash,
    observed_production_commit: context.observed_production_commit,
    capture_id: context.capture_id,
    status: 'intake_verified',
    execution_authorized: false,
    discovered_at: samePacket ? existing!.discovered_at : now,
    intake_verified_at: samePacket ? (existing!.intake_verified_at ?? now) : now,
    zeus_review_status: zeusStatus,
    eve_review_status: eveStatus,
    human_review_status: humanStatus,
    zeus_review_artifact_path: trackRP3ReviewArtifactPath({ workflowRunId: context.workflow_run_id, lane: 'ZEUS' }),
    eve_review_artifact_path: trackRP3ReviewArtifactPath({ workflowRunId: context.workflow_run_id, lane: 'EVE' }),
    intake_journals_completed: true,
    last_intake_at: unchanged ? existing!.last_intake_at! : now,
  };
}

function supersededEntry(args: {
  row: TrackRP3PacketDisposition;
  now: string;
  existing?: PacketReviewRegistryEntry;
  repoRoot: string;
}): PacketReviewRegistryEntry {
  const { row, now, existing, repoRoot } = args;
  const issued = loadIssuedPacketRegistry(repoRoot);
  const issuedEntry = issued.ok
    ? issued.registry.entries.find((entry) => entry.workflow_run_id === row.workflow_run_id)
    : undefined;
  return {
    workflow_run_id: row.workflow_run_id,
    packet_hash: row.packet_hash,
    // Real issued-registry data always wins over a previously-recorded 'unknown'
    // placeholder — 'unknown' must never stick once the true value is available.
    journal_id: issuedEntry?.journal_id ?? existing?.journal_id ?? 'unknown',
    journal_hash: issuedEntry?.journal_hash ?? existing?.journal_hash ?? 'unknown',
    observed_production_commit:
      issuedEntry?.observed_production_commit ?? existing?.observed_production_commit ?? 'unknown',
    capture_id: existing?.capture_id ?? 'unknown',
    status: 'superseded',
    execution_authorized: false,
    discovered_at: existing?.discovered_at ?? now,
    superseded_by_workflow_run_id: row.superseded_by_workflow_run_id,
    zeus_review_status: existing?.zeus_review_status ?? 'awaiting_zeus',
    eve_review_status: existing?.eve_review_status ?? 'awaiting_eve',
    human_review_status: existing?.human_review_status ?? 'awaiting_human',
    intake_journals_completed: existing?.intake_journals_completed ?? false,
    last_intake_at: existing?.last_intake_at ?? now,
  };
}

function writeReceiptFile(args: { repoRoot: string; path: string; content: string }): void {
  const abs = join(args.repoRoot, args.path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${args.content}\n`, 'utf8');
}

const GENERATED_AT_PATTERN = /generated_at:\s*(\S+)/;

/**
 * Idempotency without trusting a stale receipt: an existing file's *content* — not
 * merely its existence — must match what the current packet identity would render,
 * once its own recorded generated_at is substituted back in. A receipt that is
 * missing, corrupted, or bound to superseded identity fields is rewritten (with a
 * fresh timestamp), rather than silently accepted because a file happens to sit at
 * the right path.
 */
function receiptUpToDate(args: {
  repoRoot: string;
  path: string;
  lane: 'ZEUS' | 'EVE';
  context: TrackRP3ReviewContext;
}): boolean {
  const abs = join(args.repoRoot, args.path);
  if (!existsSync(abs)) return false;
  let existing: string;
  try {
    existing = readFileSync(abs, 'utf8');
  } catch {
    return false;
  }
  const match = existing.match(GENERATED_AT_PATTERN);
  if (!match) return false;
  const rerendered = `${renderTrackRP3MachineVerificationReceipt({
    lane: args.lane,
    context: args.context,
    generatedAt: match[1],
    intakeStatus: 'AWAITING_INDEPENDENT_REVIEW',
  })}\n`;
  return rerendered === existing;
}

function main(): void {
  const repoRoot = parseArg('repo-root') ?? process.cwd();
  const expectRunId = parseArg('expect-run-id');
  const expectPacketHash = parseArg('expect-packet-hash');
  const now = new Date().toISOString();

  const intake = runTrackRP3GovernanceIntake({ repoRoot });
  if (!intake.ok) {
    console.error('Track R P3 review durability sync BLOCKED — intake unavailable:');
    for (const error of intake.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  if (expectRunId && expectRunId !== intake.candidate.workflow_run_id) {
    console.error(
      `PACKET_BINDING_CHANGED: expected run_id ${expectRunId}, resolved candidate is ${intake.candidate.workflow_run_id}. Refusing to silently retarget.`,
    );
    process.exit(1);
  }
  if (expectPacketHash && expectPacketHash !== intake.candidate.packet_hash) {
    console.error(
      `PACKET_BINDING_CHANGED: expected packet_hash ${expectPacketHash}, resolved candidate is ${intake.candidate.packet_hash}. Refusing to silently retarget.`,
    );
    process.exit(1);
  }

  const loaded = loadPacketReviewRegistry(repoRoot);
  if (!loaded.ok) {
    console.error('Track R P3 review durability sync BLOCKED — committed registry unreadable:');
    for (const error of loaded.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  let registry: PacketReviewRegistry = loaded.registry;

  const existingCandidate = findPacketReviewEntry(registry, intake.candidate.workflow_run_id);
  registry = upsertPacketReviewEntry({
    registry,
    entry: candidateEntry({ context: intake.candidate, now, existing: existingCandidate, repoRoot }),
  });

  for (const row of intake.historicalPackets.filter((r) => r.status === 'superseded')) {
    const existing = findPacketReviewEntry(registry, row.workflow_run_id);
    registry = upsertPacketReviewEntry({
      registry,
      entry: supersededEntry({ row, now, existing, repoRoot }),
    });
  }

  writePacketReviewRegistry({ registry, repoRoot });

  for (const lane of ['ZEUS', 'EVE'] as const) {
    const path = trackRP3ReviewArtifactPath({ workflowRunId: intake.candidate.workflow_run_id, lane });
    // Idempotency without trusting a stale file: only skip when the existing receipt's
    // content genuinely matches this packet's identity (its own generated_at re-applied).
    // Missing, corrupted, or identity-mismatched receipts are (re)written below.
    if (receiptUpToDate({ repoRoot, path, lane, context: intake.candidate })) continue;
    const content = renderTrackRP3MachineVerificationReceipt({
      lane,
      context: intake.candidate,
      generatedAt: now,
      intakeStatus: 'AWAITING_INDEPENDENT_REVIEW',
    });
    writeReceiptFile({ repoRoot, path, content });
  }

  console.log(
    `Track R P3 review durability sync OK — run ${intake.candidate.workflow_run_id}, packet ${intake.candidate.packet_hash}.`,
  );
  console.log('  zeus_review_status / eve_review_status remain awaiting_* unless a validated verdict artifact exists.');
  console.log('  execution_authorized: false. No KV read or write performed by this script.');
}

main();
