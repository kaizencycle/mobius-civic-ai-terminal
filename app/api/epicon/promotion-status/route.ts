import { NextRequest, NextResponse } from 'next/server';
import { getPromotionState, defaultPromotionState, type PromotionStateValue } from '@/lib/epicon/promotion';
import { getEchoEpicon } from '@/lib/echo/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';

export const dynamic = 'force-dynamic';

function countStateValues(state: Record<string, PromotionStateValue>) {
  const values = Object.values(state);
  return {
    promoted_this_cycle_count: values.filter((v) => v.promotion_state === 'promoted').length,
    committed_agent_count: values.reduce((sum, v) => sum + v.committed_entries.length, 0),
    failed_promotion_count: values.filter((v) => v.promotion_state === 'failed' || v.failed_attempts > 0).length,
    selected_count: values.filter((v) => v.promotion_state === 'selected').length,
  };
}

/**
 * C-293: Lightweight promotion status — reads from KV/memory only.
 *
 * This endpoint returns the persisted per-item promotion map without triggering
 * external source fetches. Clients should see selected/promoted/failed progress
 * already stored in promotion state instead of synthetic all-pending rows.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const [state, epicon, cycleId] = await Promise.all([
      getPromotionState(),
      Promise.resolve(getEchoEpicon()),
      Promise.resolve(currentCycleId()),
    ]);

    const items = epicon ?? [];
    const pending = items.filter((e) => e.status === 'pending');
    const promotable = pending.filter((e) => (e.confidenceTier ?? 0) >= 1);
    const counters = countStateValues(state);
    const nowIso = new Date().toISOString();

    return NextResponse.json({
      ok: true,
      cycleId,
      ingest: null,
      counters: {
        pending_promotable_count: promotable.length,
        ...counters,
      },
      diagnostics: {
        last_promotion_run_at: Object.values(state)
          .map((v) => v.last_attempt_at)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
        promoter_input_count: items.length,
        promoter_eligible_count: promotable.length,
        promoter_excluded_reasons: {
          status_not_promotable: items.length - pending.length,
          confidence_tier_below_1: pending.length - promotable.length,
          category_not_promotable: 0,
          already_promoted: Object.values(state).filter((v) => v.promotion_state === 'promoted').length,
        },
        promoted_ids_this_cycle: Object.entries(state)
          .filter(([, v]) => v.promotion_state === 'promoted')
          .map(([id]) => id),
      },
      items: promotable.slice(0, 20).map((e) => {
        const saved = state[e.id] ?? defaultPromotionState(nowIso);
        return {
          epicon_id: e.id,
          promotion_state: saved.promotion_state,
          assigned_agents: saved.assigned_agents,
          committed_entries: saved.committed_entries,
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
