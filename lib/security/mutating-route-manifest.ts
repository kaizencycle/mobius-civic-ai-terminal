/**
 * C-384 PR-5 — contract manifest for mutating route auth (see tests/contract/mutatingRouteAuth.test.ts).
 */
export type MutatingRouteAuthKind = 'cron' | 'service' | 'operator';

export type MutatingRouteContract = {
  /** Repo-relative path */
  file: string;
  auth: MutatingRouteAuthKind;
};

export const MUTATING_ROUTE_AUTH_CONTRACT: MutatingRouteContract[] = [
  { file: 'app/api/eve/cycle-advance/route.ts', auth: 'cron' },
  { file: 'app/api/epicon/shards/propose/route.ts', auth: 'service' },
  { file: 'app/api/epicon/shards/[id]/review/route.ts', auth: 'service' },
  { file: 'app/api/seal/finalize/route.ts', auth: 'service' },
  { file: 'app/api/seal/reattest/route.ts', auth: 'service' },
  { file: 'app/api/tripwire/status/route.ts', auth: 'service' },
  { file: 'app/api/integrity/grade/requests/route.ts', auth: 'operator' },
  { file: 'app/api/integrity/grade/requests/[id]/review/route.ts', auth: 'operator' },
];

const AUTH_SNIPPET: Record<MutatingRouteAuthKind, RegExp> = {
  cron: /getCronMutatingRouteAuthError/,
  service: /getServiceMutatingRouteAuthError/,
  operator: /getOperatorOrServiceAuthError/,
};

export function postHandlerSource(fileContents: string): string {
  const marker = 'export async function POST';
  const start = fileContents.indexOf(marker);
  if (start < 0) return '';
  const rest = fileContents.slice(start);
  const nextExport = rest.slice(marker.length).search(/\nexport async function /);
  return nextExport >= 0 ? rest.slice(0, marker.length + nextExport) : rest;
}

export function postHandlerMatchesAuthContract(fileContents: string, kind: MutatingRouteAuthKind): boolean {
  const post = postHandlerSource(fileContents);
  if (!post) return false;
  return AUTH_SNIPPET[kind].test(post);
}
