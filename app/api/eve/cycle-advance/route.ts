/**
 * EVE-Bot Cycle Advance API Route
 *
 * POST /api/eve/cycle-advance — Advance to the next Mobius cycle
 * GET  /api/eve/cycle-advance — Check current cycle status
 *
 * Triggered by Vercel Cron at midnight EST (5 AM UTC).
 * Can also be triggered manually: curl -X POST /api/eve/cycle-advance
 *
 * EVE-bot:
 *   1. Calculates the correct cycle from epoch (deterministic)
 *   2. Seals the previous cycle's ledger
 *   3. Commits a genesis entry for the new cycle
 *   4. Advances the transform layer's cycle counter
 *   5. Updates the ECHO store
 *   6. Writes a snapshot to docs/echo/
 */

import { NextResponse } from 'next/server';
import {
  currentCycleId,
  previousCycleId,
  cycleForDate,
  buildCycleTransition,
} from '@/lib/eve/cycle-engine';
import {
  syncCycleToEpoch,
  getCurrentCycleId,
} from '@/lib/echo/transform';
import {
  pushIngestResult,
  getEchoStatus,
  getEchoEpicon,
  getEchoLedger,
  getEchoAlerts,
} from '@/lib/echo/store';
import { writeSnapshot } from '@/lib/echo/snapshot-writer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  const correctCycleId = currentCycleId(now);
  const transformCycleId = getCurrentCycleId();
  const inSync = correctCycleId === transformCycleId;

  return NextResponse.json({
    agent: 'EVE',
    role: 'Cycle Rotation Engine',
    status: inSync ? 'in_sync' : 'drift_detected',
    currentCycle: correctCycleId,
    previousCycle: previousCycleId(now),
    cycleNumber: cycleForDate(now),
    transformCycle: transformCycleId,
    inSync,
    epoch: '2025-07-07 (C-0)',
    timezone: 'America/New_York (EST/EDT)',
    rotation: 'midnight EST daily',
    timestamp: now.toISOString(),
  });
}

export async function POST() {
  const startTime = Date.now();
  const now = new Date();

  try {
    // 1. Calculate correct cycle from epoch
    const correctCycleId = currentCycleId(now);
    const transformCycleId = getCurrentCycleId();

    // 2. Sync the transform layer to the epoch-correct cycle
    const synced = syncCycleToEpoch(now);

    // 3. Build the cycle transition records
    const status = getEchoStatus();
    const transition = buildCycleTransition(
      now,
      status.counts.ledger,
      0.83, // Will be replaced by live GI when available
    );

    // 4. Push transition as an ingest result to the store
    pushIngestResult({
      cycleId: transition.newCycleId,
      epicon: [transition.genesisEpicon],
      ledger: [transition.sealEntry, transition.genesisEntry],
      alerts: [],
      integrity: {
        cycleId: transition.newCycleId,
        timestamp: now.toISOString(),
        eventCount: 1,
        avgMii: 0,
        totalGiDelta: 0,
        totalMicMinted: 0,
        agentAverages: {},
        ratings: [],
      },
      sourceCount: 0,
      duplicateSuppressedCount: 0,
      timestamp: now.toISOString(),
    });

    // 5. Write snapshot (best-effort)
    let snapshotWritten = false;
    try {
      snapshotWritten = await writeSnapshot(
        getEchoStatus(),
        getEchoEpicon(),
        getEchoLedger(),
        getEchoAlerts(),
      );
    } catch {
      // Snapshot writing is best-effort on read-only filesystems
    }

    return NextResponse.json({
      agent: 'EVE',
      action: 'cycle_advance',
      result: 'ok',
      previousCycle: transition.previousCycleId,
      newCycle: transition.newCycleId,
      cycleNumber: transition.cycleNumber,
      synced: {
        from: transformCycleId,
        to: synced,
        correctPerEpoch: correctCycleId,
      },
      entries: {
        seal: transition.sealEntry.id,
        genesis: transition.genesisEntry.id,
        epicon: transition.genesisEpicon.id,
      },
      snapshot: snapshotWritten ? 'written' : 'skipped',
      duration: Date.now() - startTime,
      timestamp: transition.timestamp,
    });
  } catch (error) {
    return NextResponse.json(
      {
        agent: 'EVE',
        action: 'cycle_advance',
        result: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}
