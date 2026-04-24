# C-291 — url.parse Deprecation Trace Notes

## Purpose

Track the runtime-only Node warning showing in Vercel logs:

```txt
[DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead.
```

## Current finding

Repository search did not find a direct project-level use of:

- `url.parse`
- `parseUrl`
- `require('url')`
- `from 'url'`

That suggests the warning is likely coming from a dependency or transitive dependency during runtime execution.

## Affected routes in observed logs

The warning appeared during successful 200 responses for routes such as:

- `/api/echo/digest`
- `/api/epicon/feed`
- `/api/terminal/snapshot`

## Operational impact

The warning is noisy but not currently breaking runtime behavior. The routes still returned HTTP 200.

## Next trace step

Run with Node trace warnings in a preview or local runtime:

```bash
NODE_OPTIONS="--trace-deprecation" pnpm run build
NODE_OPTIONS="--trace-deprecation" pnpm start
```

Then call:

```txt
/api/echo/digest
/api/epicon/feed
/api/terminal/snapshot
```

The stack trace should reveal which package still calls `url.parse()`.

## Follow-up options

Once the source package is identified:

1. Upgrade the dependency if a patched version exists.
2. Replace the dependency if it is stale.
3. Patch local usage only if the trace proves it is in project code.
4. Suppress only as a last resort; prefer source fix.

## Acceptance criteria for future fix

- [ ] Trace identifies the package or file causing DEP0169.
- [ ] Runtime logs no longer emit DEP0169 on the three affected routes.
- [ ] No secret values are printed in trace logs.
- [ ] Routes continue returning 200 after fix.
