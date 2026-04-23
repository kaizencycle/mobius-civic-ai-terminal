/**
 * Internal EVE preview for /api/eve/global-news — no ledger write (C-270).
 * Committed governance synthesis is published only via /api/eve/cycle-synthesize.
 */

import {
  buildEveGovernanceSynthesisOutput,
  buildInternalPreviewFromInput,
  gatherEveGovernanceSynthesisInput,
} from '@/lib/eve/governance-synthesis';
import type { EveNewsItem, EveSynthesis, NewsCategory } from '@/lib/eve/global-news';

type InternalSynthesisResult = {
  cycleId: string;
  items: EveNewsItem[];
  pattern_notes: string[];
  dominant_category: NewsCategory;
  dominant_region: string;
  global_tension: EveSynthesis['global_tension'];
  /** Always false — publishing is automation-only via cycle-synthesize. */
  committed: false;
};

export type EveInternalSynthesisBuildOptions = {
  externalItemCount?: number;
  externalDegradedReason?: string;
};

export async function buildAndCommitEveInternalSynthesis(
  options?: EveInternalSynthesisBuildOptions,
): Promise<InternalSynthesisResult> {
  const input = await gatherEveGovernanceSynthesisInput();
  const output = buildEveGovernanceSynthesisOutput(input);
  const preview = buildInternalPreviewFromInput(input, output);

  const contextNotes: string[] = [];
  if (typeof options?.externalItemCount === 'number') {
    contextNotes.push(`External observation lane: ${options.externalItemCount} fresh item(s) in blend window.`);
  }
  if (options?.externalDegradedReason && options.externalDegradedReason.trim()) {
    contextNotes.push(
      `External feed degraded (${options.externalDegradedReason.trim()}); substrate-first synthesis retained.`,
    );
  }
  const pattern_notes = [...contextNotes, ...preview.pattern_notes].slice(0, 6);

  return {
    cycleId: input.cycleId,
    items: preview.items,
    pattern_notes,
    dominant_category: preview.dominant_category,
    dominant_region: preview.dominant_region,
    global_tension: preview.global_tension,
    committed: false,
  };
}
