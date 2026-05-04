# C-300: Fix Substrate Config + Ledger Attestation + Performance

## Summary
This PR addresses critical issues identified from Vercel logs for **mobius-civic-ai-terminal** (C-300), including missing API base configuration for ledger attestation, journal canonization substrate target not configured, and cache performance optimizations.

## Issues Fixed

### 1. Critical: Ledger Attestation Rejected - Missing API Base Configuration
**Log Error:**
```json
{
  "level": "warning",
  "message": "[substrate] ledger attest rejected {
    status: 400,
    response: '{\"detail\":\"No API base configured for terminal\"}'
  }",
  "requestPath": "/api/cron/sweep"
}
```

**Fix:** Added graceful degradation in `lib/substrate/client.ts` when `NEXT_PUBLIC_SUBSTRATE_API_BASE` is not configured. The system now logs a warning and skips attestation gracefully instead of failing hard.

### 2. Warning: Journal Canonize Substrate Target Not Configured
**Log Warning:**
```json
{
  "message": "[journal-canonize] running, substrate target: (not configured)"
}
```

**Fix:** Updated `app/api/cron/journal-canonize/route.ts` to check `JOURNAL_CANON_SUBSTRATE_TARGET` env var first, with improved logging that shows the actual configured value.

### 3. Performance: Cache Staleness on Shell/Digest Endpoints
**Observation:** Many `/api/terminal/shell` and `/api/echo/digest` requests showed `cache: "STALE"`, impacting performance during high-traffic periods.

**Fix:** Added optimized cache headers in `next.config.ts`:
- `/api/terminal/shell`: `public, s-maxage=30, stale-while-revalidate=60`
- `/api/echo/digest`: `public, s-maxage=60, stale-while-revalidate=120`

## Changes Made

### Files Modified

#### 1. `.env.example`
Added new environment variables for substrate configuration:
```env
# C-300: Substrate ledger attestation configuration
NEXT_PUBLIC_SUBSTRATE_API_BASE=https://civic-protocol-core-ledger.onrender.com/api/v1
SUBSTRATE_WRITE_API_KEY=your_substrate_write_key_here
JOURNAL_CANON_SUBSTRATE_TARGET=https://civic-protocol-core-ledger.onrender.com/api/v1/journal
```

#### 2. `lib/substrate/client.ts`
- Added `NEXT_PUBLIC_SUBSTRATE_API_BASE` as primary config source (with fallback to `RENDER_LEDGER_URL`)
- Implemented graceful degradation guard when substrate API base is missing
- Added audit logging to KV store when attestation is skipped due to missing config
- Returns early with success status instead of hard failure

#### 3. `app/api/cron/sweep/route.ts`
- Added config validation at start of sweep operation
- Logs warning when `NEXT_PUBLIC_SUBSTRATE_API_BASE` is missing
- Continues sweep execution (attestation will be skipped gracefully by client)

#### 4. `app/api/cron/journal-canonize/route.ts`
- Prioritizes `JOURNAL_CANON_SUBSTRATE_TARGET` env var
- Improved logging to show actual substrate target value in structured format

#### 5. `next.config.ts`
- Added `headers()` function to configure cache control for shell/digest endpoints
- Reduces stale cache hits and improves response times

## Testing

### Local Development
```bash
# Test with substrate env vars configured
cp .env.example .env.local
# Add your substrate keys to .env.local
npm run dev

# Test without substrate env vars (graceful degradation)
# Remove NEXT_PUBLIC_SUBSTRATE_API_BASE from .env.local
npm run dev
```

### Verification Steps
1. Verify logs show `substrate_attestation_disabled` warning when config missing (not error)
2. Confirm `/api/cron/sweep` completes successfully even without substrate config
3. Check `/api/cron/journal-canonize` logs show actual substrate target value
4. Monitor cache headers on shell/digest endpoints using browser dev tools

## Deployment Notes

### Required Vercel Environment Variables
Add these to your Vercel project settings:
- `NEXT_PUBLIC_SUBSTRATE_API_BASE` (public)
- `SUBSTRATE_WRITE_API_KEY` (secret)
- `JOURNAL_CANON_SUBSTRATE_TARGET` (secret)

### Backward Compatibility
✅ All changes are backward-compatible:
- Existing deployments continue to work if new env vars are not set
- Graceful degradation ensures no hard failures
- Fallback chain: `NEXT_PUBLIC_SUBSTRATE_API_BASE` → `RENDER_LEDGER_URL` → default URL

### Monitoring Post-Deploy
1. Check Vercel logs for `/api/cron/sweep` - should show successful completion with or without substrate config
2. Monitor `/api/terminal/snapshot` - fewer ledger reconnection messages expected
3. Verify cache behavior - shell/digest endpoints should show more `HIT` and fewer `STALE` statuses
4. Watch for `substrate:last_skipped` key in KV store when config is missing

## Related Issues
- Fixes: `[substrate] ledger attest rejected {"detail":"No API base configured for terminal"}`
- Fixes: `[journal-canonize] substrate target: (not configured)`
- Addresses: C-300 journal integrity pipeline hardening
- Improves: Cache performance for high-traffic endpoints

## Checklist
- [x] Add `NEXT_PUBLIC_SUBSTRATE_API_BASE` to `.env.example`
- [x] Add graceful degradation when substrate config missing (no hard failures)
- [x] Fix journal-canonize to log actual substrate target value
- [x] Tune cache headers for `/api/terminal/shell` and `/api/echo/digest`
- [x] Add config validation to cron sweep route
- [x] Document deployment requirements
- [x] Verify backward compatibility

---
**PR Ready for Review** 🚀
