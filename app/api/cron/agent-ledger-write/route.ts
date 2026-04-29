// PATCHED: Phase 8 ZEUS integration
// (only showing modified sections for clarity)

// --- add below shouldRequireQuorum ---
function shouldRequireZeus(request: NextRequest): boolean {
  if (boolFromEnv(process.env.MOBIUS_AGENT_LEDGER_REQUIRE_ZEUS)) return true;
  return request.nextUrl.searchParams.get('require_zeus') === 'true';
}

// --- inside GET handler, after quorum block ---
  const requireZeus = shouldRequireZeus(request);

  if (requireZeus && quorumJournalIds) {
    const zeusUrl = new URL('/api/agents/ledger-zeus', request.nextUrl.origin);
    zeusUrl.searchParams.set('limit', String(limit));

    const zeusRes = await fetch(zeusUrl.toString(), { cache: 'no-store' });
    const zeusData = await zeusRes.json();

    const zeusIds = new Set(zeusData.journal_ids || []);

    quorumJournalIds = quorumJournalIds.filter((id) => zeusIds.has(id));

    if (quorumJournalIds.length === 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'blocked_by_zeus',
        activeCycle,
        dry_run: dryRun,
        require_quorum: requireQuorum,
        require_zeus: true,
        timestamp: new Date().toISOString(),
      });
    }
  }
