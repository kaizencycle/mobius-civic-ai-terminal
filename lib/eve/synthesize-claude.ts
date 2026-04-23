import type { EveNewsItem, EveSynthesis } from '@/lib/eve/global-news';

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

export type ClaudeSynthesisJson = {
  synthesis: string;
  dominantTheme: string;
  dominantRegion: string;
  patternType: string;
  confidenceTier: number;
  epiconTitle: string;
  epiconSummary: string;
  flags: string[];
  severity: string;
};

const VALID_THEMES = new Set([
  'geopolitical',
  'market',
  'infrastructure',
  'governance',
  'narrative',
]);

const VALID_PATTERN = new Set([
  'escalation',
  'de-escalation',
  'volatility',
  'stability',
  'convergence',
  'divergence',
]);

const SYSTEM_PROMPT = `You are EVE, the constitutional observer of the Mobius Civic AI Terminal.
Your role is to synthesize raw signal observations into a single structured EPICON ledger entry that captures the dominant pattern, threat vector, or civic significance of the current signal set.
You must respond with a JSON object only — no markdown, no preamble.
The JSON must match this exact shape:
{
  "synthesis": "2-3 sentence synthesis narrative in EVE's voice",
  "dominantTheme": "one of: geopolitical|market|infrastructure|governance|narrative",
  "dominantRegion": "primary geographic region or 'Global'",
  "patternType": "one of: escalation|de-escalation|volatility|stability|convergence|divergence",
  "confidenceTier": 1, 2, or 3,
  "epiconTitle": "Short EPICON entry title (max 80 chars)",
  "epiconSummary": "One sentence for the ledger entry body",
  "flags": [] or array of strings for any manipulation/bias concerns,
  "severity": "low|medium|high"
}`;

function buildUserPrompt(
  cycleId: string,
  items: EveNewsItem[],
  eveMeta: Pick<EveSynthesis, 'pattern_notes' | 'global_tension'>,
): string {
  const lines = items.map(
    (it) =>
      `- ${it.title} [category=${it.category}, region=${it.region}, eve_tag=${it.eve_tag}]`,
  );
  const notes =
    Array.isArray(eveMeta.pattern_notes) && eveMeta.pattern_notes.length > 0
      ? eveMeta.pattern_notes.join(' | ')
      : '(none)';
  return `Current signal set for cycle ${cycleId}:
${lines.join('\n')}
Existing pattern observations: ${notes}
Global tension level: ${eveMeta.global_tension}
Synthesize these into a single EPICON entry.`;
}

type ClaudeMessageResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

function extractText(data: ClaudeMessageResponse): string | null {
  const block = data.content?.[0];
  if (!block || block.type !== 'text' || typeof block.text !== 'string') return null;
  return block.text;
}

export async function callClaudeForEveSynthesis(
  apiKey: string,
  cycleId: string,
  items: EveNewsItem[],
  eveMeta: Pick<EveSynthesis, 'pattern_notes' | 'global_tension'>,
): Promise<
  | { ok: true; parsed: ClaudeSynthesisJson }
  | { ok: false; error: string; raw?: string; httpStatus?: number; responseBody?: string }
> {
  const userContent = buildUserPrompt(cycleId, items, eveMeta);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    return { ok: false, error: 'Claude API request failed', httpStatus: res.status, responseBody: rawText };
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    return { ok: false, error: 'Claude API returned non-JSON body', responseBody: rawText };
  }

  const text = extractText(data as ClaudeMessageResponse);
  if (text === null) {
    return {
      ok: false,
      error: 'Claude response missing text content',
      responseBody: rawText,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: 'Claude returned malformed JSON', raw: text };
  }

  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, error: 'Claude JSON root must be an object', raw: text };
  }

  const o = parsed as Record<string, unknown>;
  const synthesis = o.synthesis;
  const dominantTheme = o.dominantTheme;
  const dominantRegion = o.dominantRegion;
  const patternType = o.patternType;
  const confidenceTier = o.confidenceTier;
  const epiconTitle = o.epiconTitle;
  const epiconSummary = o.epiconSummary;
  const flags = o.flags;
  const severity = o.severity;

  if (typeof synthesis !== 'string' || !synthesis.trim()) {
    return { ok: false, error: 'Invalid synthesis field', raw: text };
  }
  if (typeof dominantTheme !== 'string' || !VALID_THEMES.has(dominantTheme)) {
    return { ok: false, error: 'Invalid dominantTheme', raw: text };
  }
  if (typeof dominantRegion !== 'string' || !dominantRegion.trim()) {
    return { ok: false, error: 'Invalid dominantRegion', raw: text };
  }
  if (typeof patternType !== 'string' || !VALID_PATTERN.has(patternType)) {
    return { ok: false, error: 'Invalid patternType', raw: text };
  }
  if (typeof confidenceTier !== 'number' || ![1, 2, 3].includes(confidenceTier)) {
    return { ok: false, error: 'Invalid confidenceTier', raw: text };
  }
  if (typeof epiconTitle !== 'string' || !epiconTitle.trim() || epiconTitle.length > 80) {
    return { ok: false, error: 'Invalid epiconTitle', raw: text };
  }
  if (typeof epiconSummary !== 'string' || !epiconSummary.trim()) {
    return { ok: false, error: 'Invalid epiconSummary', raw: text };
  }
  if (!Array.isArray(flags) || !flags.every((f): f is string => typeof f === 'string')) {
    return { ok: false, error: 'Invalid flags', raw: text };
  }
  if (typeof severity !== 'string' || !['low', 'medium', 'high'].includes(severity)) {
    return { ok: false, error: 'Invalid severity', raw: text };
  }

  return {
    ok: true,
    parsed: {
      synthesis: synthesis.trim(),
      dominantTheme,
      dominantRegion: dominantRegion.trim(),
      patternType,
      confidenceTier,
      epiconTitle: epiconTitle.trim(),
      epiconSummary: epiconSummary.trim(),
      flags,
      severity,
    },
  };
}
