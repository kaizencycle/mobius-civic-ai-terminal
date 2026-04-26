import { NextRequest, NextResponse } from 'next/server';
import { getPromotionState } from '@/lib/epicon/promotion';
import { getEchoEpicon } from '@/lib/echo/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';

export const dynamic = 'force-dynamic';

/**
 * C-293 OPT-6: Lightweight promotion status — reads from KV/memory only.
 * Previously re-exported the full promote/route which called fetchAllSources()
 * (including fetchEveGlobalNews → fetchWikipediaCurrentEvents with a 10s timeout).
 * That caused the promotion-status lane to always 408 at 5001ms in the snapshot.
 *
 * This endpoint returns the current promotion state from KV without triggering
 * any external source fetches. The full promote route still exists at /api/epicon/promote.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const [state, epicon, cycleId] = await Promise.all([
      getPromotionState(),
      Promise.resolve(getEchoEpicon()),
      Promise.resolve(currentCycleId()),
    ]);

    const s = state as unknown as Record<string, unknown>;
    const items = epicon ?? [];
    const pending = items.filter((e) => e.status === 'pending');
    const promotable = pending.filter((e) => (e.confidenceTier ?? 0) >= 1);

    return NextResponse.json({
      ok: true,
      cycleId,
      ingest: s?.ingest ?? null,
      counters: {
        pending_promotable_count: promotable.length,
        promoted_this_cycle_count: typeof s?.promotedThisCycle === 'number' ? s.promotedThisCycle : 0,
        committed_agent_count: typeof s?.committedAgentCount === 'number' ? s.committedAgentCount : 0,
        failed_promotion_count: typeof s?.failedPromotionCount === 'number' ? s.failedPromotionCount : 0,
      },
      diagnostics: {
        last_promotion_run_at: typeof s?.lastRunAt === 'string' ? s.lastRunAt : null,
        promoter_input_count: items.length,
        promoter_eligible_count: promotable.length,
        promoter_excluded_reasons: {
          status_not_promotable: items.length - pending.length,
          confidence_tier_below_1: pending.length - promotable.length,
          category_not_promotable: 0,
          already_promoted: typeof s?.alreadyPromotedCount === 'number' ? s.alreadyPromotedCount : 0,
        },
        promoted_ids_this_cycle: Array.isArray(s?.promotedIds) ? s.promotedIds as string[] : [],
      },
      items: promotable.slice(0, 20).map((e) => ({
        epicon_id: e.id,
        promotion_state: 'pending',
        assigned_agents: [],
        committed_entries: [],
        failed_attempts: 0,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'promotion status unavailable' },
      { status: 500 },
    );
  }
}
