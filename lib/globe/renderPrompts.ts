import type { GlobeRenderDomain, GlobeRenderKind } from './types';

function domainTone(domain?: GlobeRenderDomain): string {
  switch (domain) {
    case 'civic':
      return 'regulatory transparency, federal civic layer';
    case 'environ':
      return 'natural systems, hazards, ecological integrity';
    case 'financial':
      return 'market pulse, stability-oriented civic finance view';
    case 'narrative':
      return 'information velocity, discourse integrity';
    case 'infrastructure':
      return 'systems resilience, deployment substrate';
    case 'institutional':
      return 'open data, institutional trust signals';
    default:
      return 'civic integrity systems';
  }
}

export function buildIncidentCardPrompt(params: {
  title: string;
  domain?: GlobeRenderDomain;
  severity?: string;
  regionHint?: string;
}): string {
  const { title, domain, severity, regionHint } = params;
  const tone = domainTone(domain);
  const sev = severity ?? 'elevated';
  const place = regionHint ? `Focus: ${regionHint}. ` : '';
  return [
    'Dark civic command interface artwork, glowing globe, Mobius Terminal aesthetic.',
    `${place}Subject: ${title.slice(0, 120)}.`,
    `${tone}. Severity mood: ${sev} — amber pulse accents if elevated, restrained red if critical.`,
    'Midnight palette, cyan and amber signal lines, minimal text, high contrast, precise not generic sci-fi.',
  ].join(' ');
}

export function buildCycleHeroPrompt(params: {
  cycle: string;
  giBand: string;
  highlights: string[];
}): string {
  const lines = params.highlights.slice(0, 4).join(' · ');
  return [
    `Mobius Civic Terminal cycle recap: ${params.cycle}.`,
    `Global integrity band: ${params.giBand}.`,
    lines ? `Signal highlights: ${lines}.` : 'Live world-state synthesis.',
    'Deep midnight background, globe with elevated pulse regions, cyan and amber accents, constitutional systems feeling, elegant technical composition, no logos.',
  ].join(' ');
}

export function promptForKind(
  kind: GlobeRenderKind,
  body: {
    title: string;
    domain?: GlobeRenderDomain;
    cycle?: string;
    severity?: string;
    metadata?: Record<string, unknown>;
    customPrompt?: string;
  },
): string {
  if (body.customPrompt?.trim()) return body.customPrompt.trim();

  if (kind === 'cycle_hero') {
    const meta = body.metadata as { highlights?: string[]; giBand?: string } | undefined;
    return buildCycleHeroPrompt({
      cycle: body.cycle ?? 'C-current',
      giBand: meta?.giBand ?? 'nominal',
      highlights: Array.isArray(meta?.highlights) ? meta.highlights : [body.title],
    });
  }

  if (kind === 'domain_icon') {
    return `Minimal sigil icon for Mobius domain ${body.domain ?? 'civic'}, ${domainTone(body.domain)}, flat vector-like, midnight and cyan, square asset.`;
  }

  if (kind === 'overlay_texture') {
    return `Subtle transparent overlay texture for globe, ${domainTone(body.domain)}, soft signal bloom, tileable, dark base.`;
  }

  const regionHint =
    typeof body.metadata?.region === 'string'
      ? body.metadata.region
      : typeof body.metadata?.place === 'string'
        ? body.metadata.place
        : undefined;

  return buildIncidentCardPrompt({
    title: body.title,
    domain: body.domain,
    severity: body.severity,
    regionHint,
  });
}
