export type EpiconGateDecision = 'PASS' | 'NEEDS_CLARIFICATION' | 'FAIL'

export type EpiconGateResult = {
  decision: EpiconGateDecision
  status?: string
  reason?: string
  epicon_hash?: string
  ecs?: number
  quorum?: unknown
  dissent?: unknown
}

type EpiconGateOptions = {
  origin?: string
  fetcher?: typeof fetch
}

function normalizeDecision(value: unknown): EpiconGateDecision {
  const normalized = String(value ?? '').toLowerCase()
  if (normalized === 'pass' || normalized === 'passed') return 'PASS'
  if (normalized === 'needs_clarification' || normalized === 'needs-clarification' || normalized === 'clarify') {
    return 'NEEDS_CLARIFICATION'
  }
  if (normalized === 'fail' || normalized === 'failed' || normalized === 'reject' || normalized === 'rejected') return 'FAIL'
  return 'NEEDS_CLARIFICATION'
}

function resolveEpiconCheckUrl(origin?: string): string {
  if (origin) return new URL('/api/epicon/check', origin).toString()
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL('/api/epicon/check', window.location.origin).toString()
  }
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
  if (envOrigin) {
    const normalizedOrigin = envOrigin.startsWith('http') ? envOrigin : `https://${envOrigin}`
    return new URL('/api/epicon/check', normalizedOrigin).toString()
  }
  throw new Error('epicon_origin_unavailable')
}

export async function runEpiconGateDryRun(
  payload: unknown,
  options: EpiconGateOptions = {},
): Promise<EpiconGateResult> {
  try {
    const fetcher = options.fetcher ?? fetch
    const res = await fetcher(resolveEpiconCheckUrl(options.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      return { decision: 'FAIL', reason: 'epicon_check_failed' }
    }

    const data = await res.json()
    const status = data?.status ?? data?.decision

    return {
      decision: normalizeDecision(status),
      status: typeof status === 'string' ? status : undefined,
      reason: data?.reason,
      epicon_hash: data?.hash ?? data?.epicon_hash,
      ecs: typeof data?.ecs === 'number' ? data.ecs : undefined,
      quorum: data?.quorum,
      dissent: data?.dissent,
    }
  } catch (err) {
    return {
      decision: 'FAIL',
      reason: err instanceof Error ? err.message : 'epicon_runtime_error',
    }
  }
}
