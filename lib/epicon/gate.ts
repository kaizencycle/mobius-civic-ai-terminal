export type EpiconGateResult = {
  decision: 'PASS' | 'NEEDS_CLARIFICATION' | 'FAIL'
  reason?: string
  epicon_hash?: string
}

export async function runEpiconGateDryRun(payload: any): Promise<EpiconGateResult> {
  try {
    const res = await fetch('/api/epicon/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      return { decision: 'FAIL', reason: 'epicon_check_failed' }
    }

    const data = await res.json()

    return {
      decision: data.decision ?? 'NEEDS_CLARIFICATION',
      reason: data.reason,
      epicon_hash: data.hash,
    }
  } catch (err) {
    return { decision: 'FAIL', reason: 'epicon_runtime_error' }
  }
}
