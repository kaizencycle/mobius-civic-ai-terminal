import { NextResponse } from 'next/server';
import { kvGet } from '@/lib/kv/store';
import type { RouterDecisionRecord, RouterFeedbackRecord, RouterRoute } from '@/lib/router/decision';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DECISIONS_KEY = 'router:decisions';
const FEEDBACK_KEY = 'router:feedback';

type RouteRecommendation = {
  route: RouterRoute;
  recommendation: 'hold' | 'use_more' | 'use_less' | 'review';
  reason: string;
  confidence: number;
};

function feedbackForRoute(route: RouterRoute, decisions: RouterDecisionRecord[], feedback: RouterFeedbackRecord[]) {
  const decisionIds = new Set(decisions.filter((d) => d.route === route).map((d) => d.id));
  return feedback.filter((f) => decisionIds.has(f.decision_id));
}

function recommendForRoute(route: RouterRoute, decisions: RouterDecisionRecord[], feedback: RouterFeedbackRecord[]): RouteRecommendation {
  const routeDecisions = decisions.filter((d) => d.route === route);
  const routeFeedback = feedbackForRoute(route, decisions, feedback);
  const correctionCount = routeFeedback.filter((f) => f.outcome === 'corrected' || f.outcome === 'rejected').length;
  const confirmationCount = routeFeedback.filter((f) => f.outcome === 'confirmed').length;
  const correctionRate = routeFeedback.length > 0 ? correctionCount / routeFeedback.length : 0;
  const confirmationRate = routeFeedback.length > 0 ? confirmationCount / routeFeedback.length : 0;
  const usageShare = decisions.length > 0 ? routeDecisions.length / decisions.length : 0;

  if (routeFeedback.length < 3) {
    return { route, recommendation: 'hold', reason: 'insufficient_feedback_for_adaptation', confidence: 0.35 };
  }
  if (correctionRate >= 0.35) {
    return { route, recommendation: 'use_less', reason: 'feedback_correction_rate_high', confidence: Number(Math.min(0.9, correctionRate).toFixed(2)) };
  }
  if (confirmationRate >= 0.8 && usageShare < 0.4) {
    return { route, recommendation: 'use_more', reason: 'high_confirmation_low_usage', confidence: Number(confirmationRate.toFixed(2)) };
  }
  if (usageShare > 0.65 && route !== 'local') {
    return { route, recommendation: 'review', reason: 'cloud_or_hybrid_overuse_possible', confidence: Number(usageShare.toFixed(2)) };
  }
  return { route, recommendation: 'hold', reason: 'route_performance_within_expected_bounds', confidence: Number(Math.max(0.5, confirmationRate).toFixed(2)) };
}

export async function GET() {
  const [decisions, feedback] = await Promise.all([
    kvGet<RouterDecisionRecord[]>(DECISIONS_KEY),
    kvGet<RouterFeedbackRecord[]>(FEEDBACK_KEY),
  ]);

  const decisionRows = decisions ?? [];
  const feedbackRows = feedback ?? [];
  const routes: RouterRoute[] = ['local', 'cloud', 'cloud+zeus', 'hybrid'];
  const recommendations = routes.map((route) => recommendForRoute(route, decisionRows, feedbackRows));

  return NextResponse.json(
    {
      ok: true,
      phase: 'C-298.phase7.adaptive-routing-recommendations',
      enforced: false,
      decisions: decisionRows.length,
      feedback: feedbackRows.length,
      recommendations,
      next_best_action:
        feedbackRows.length < 3
          ? 'collect_more_feedback_before_route_adjustment'
          : 'review_recommendations_before_any_enforcement_phase',
      canon_law: [
        'Recommendations are advisory only.',
        'No route is enforced by this endpoint.',
        'No model execution, Ledger, Canon, Replay, Vault, MIC, or GI mutation occurs here.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'router-recommendations',
      },
    },
  );
}
