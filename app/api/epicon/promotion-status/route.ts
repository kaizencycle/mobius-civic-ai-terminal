import { NextRequest, NextResponse } from 'next/server';
import { getPromotionState, defaultPromotionState, type PromotionStateValue } from '@/lib/epicon/promotion';
import { getEchoEpicon } from '@/lib/echo/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import type { EpiconItem } from '@/lib/terminal/types';

export const dynamic = 'force-dynamic';

type PromotableCategory = EpiconItem['category'];

const PROMOTABLE_CATEGORIES = new Set<PromotableCategory>([
  'market',
  'infrastructure',
  'geopolitical',
  'governance',
  'narrative',
]);

function committedInCycle(value: PromotionStateValue, cycleId: string): string[] {
  const prefix = `LE-${cycleId}-`;
  return value.committed_entries.filter((entryId) => entryId.startsWith(prefix));
}

function countStateValues(state: Record<string, PromotionStateValue>, cycleId: string) {
  const values = Object.values(state);
  return {
    promoted_this_cycle_count: values.filter((v) => v.promotion_state === 'promoted' && committedInCycle(v, cycleId).length > 0).length,
    committed_agent_count: values.reduce((sum, v) => sum + committedInCycle(v, cycleId).length, 0),
    failed_promotion_count: values.filter((v) => v.last_attempt_at && v.failed_attempts > 0).length,
    selected_count: values.filter((v) => v.promotion_state === 'selected').length,
  };
}

function isPromotable(item: EpiconItem, state: Record<string, PromotionStateValue>): boolean {
  if (item.status !== 'pending' && item.status !== 'verified') return false;
  if ((item.confidenceTier ?? 0) < 1) return false;
  if (!PROMOTABLE_CATEGORIES.has(item.category)) return false;
  if (state[item.id]?.promotion_state === 'promoted') return false;
  return true;
}

/**
 * C-293: Lightweight promotion status — reads from KV/memory only.
 *
 * This endpoint returns the persisted per-item promotion map without triggering
 * external source fetches. Counts are scoped to the active cycle and pending
 * eligibility mirrors the promoter gate so dashboards do not overstate work.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const cycleId = currentCycleId();
    const [state, epicon] = await Promise.all([
      getPromotionState(cycleId),
      Promise.resolve(getEchoEpicon()),
    ]);

    const items = epicon ?? [];
    const promotable = items.filter((e) => isPromotable(e, state));
    const counters = countStateValues(state, cycleId);
    const nowIso = new Date().toISOString();
    const values = Object.values(state);

    return NextResponse.json({
      ok: true,
      cycleId,
      ingest: null,
      counters: {
        pending_promotable_count: promotable.length,
        ...counters,
      },
      diagnostics: {
        last_promotion_run_at: values
          .map((v) => v.last_attempt_at)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
        promoter_input_count: items.length,
        promoter_eligible_count: promotable.length,
        promoter_excluded_reasons: {
          status_not_promotable: items.filter((e) => e.status !== 'pending' && e.status !== 'verified').length,
          confidence_tier_below_1: items.filter((e) => (e.status === 'pending' || e.status === 'verified') && (e.confidenceTier ?? 0) < 1).length,
          category_not_promotable: items.filter((e) => (e.status === 'pending' || e.status === 'verified') && (e.confidenceTier ?? 0) >= 1 && !PROMOTABLE_CATEGORIES.has(e.category)).length,
          already_promoted: items.filter((e) => state[e.id]?.promotion_state === 'promoted').length,
        },
        promoted_ids_this_cycle: Object.entries(state)
          .filter(([, v]) => v.promotion_state === 'promoted' && committedInCycle(v, cycleId).length > 0)
          .map(([id]) => id),
      },
      items: promotable.slice(0, 20).map((e) => {
        const saved = state[e.id] ?? defaultPromotionState(nowIso);
        return {
          epicon_id: e.id,
          promotion_state: saved.promotion_state,
          assigned_agents: saved.assigned_agents,
          committed_entries: committedInCycle(saved, cycleId),
          failed_attempts: saved.failed_attempts,
          last_attempt_at: saved.last_attempt_at,
        };
      }),
      timestamp: nowIso,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'promotion status unavailable' },
      { status: 500 },
    );
  }
}
