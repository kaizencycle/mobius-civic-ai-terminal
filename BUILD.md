# BUILD.md

## Canonical build contract

### Package manager
- `pnpm`

### Runtime
- Node 20.x preferred

### Install
```bash
pnpm install
```

### Dev

```bash
pnpm dev
```

### Typecheck

```bash
pnpm exec tsc --noEmit
```

### Build

```bash
pnpm build
```

### Lint

```bash
pnpm lint
```

---

## Required validation order

Run in this order unless the task is docs-only:

### 1. Typecheck

```bash
pnpm exec tsc --noEmit
```

### 2. Build

```bash
pnpm build
```

### 3. Lint

```bash
pnpm lint
```

If lint is interactive or not configured cleanly, report that explicitly.
Do not silently skip it without saying so.

---

## Definition of done

A code change is not done unless:

* it matches the requested architecture
* typecheck passes
* build passes
* lint result is reported
* any remaining issues are stated clearly

---

## Failure protocol

If a command fails:

### Always report

* exact command that failed
* relevant file(s)
* first meaningful error
* smallest likely fix

### Do not

* stack more features on top of a broken build
* declare success anyway
* hide failing commands

### Preferred behavior

Fix the failure first, then continue.

---

## Known project rules

### Route-based chambers must stay intact

Do not regress to one monolithic terminal page with buried chamber content.

### World State renderer split must stay intact

* mobile = map
* desktop = globe

### Mobile command console

Should remain collapsed by default unless explicitly changed.

### Runtime truth

* lane health must remain visible
* freshness must remain visible
* degraded states must remain explicit

---

## Safe command allowlist

Generally safe:

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm build
pnpm lint
pnpm test
pnpm dev
```

Use caution with:

```bash
pnpm up
pnpm dedupe
rm -rf
git clean -fd
```

Do not run destructive commands unless explicitly requested.

---

## Commit hygiene

Preferred:

* small focused commits
* one architectural intent per commit

Examples:

* `refactor(router): add route-based chamber pages`
* `fix(world-state): restore globe on desktop and map on mobile`
* `fix(mobile): collapse command console into drawer`

Avoid vague commits like:

* `fix stuff`
* `updates`
* `misc changes`

---

## Final rule

A passing build is required.
A claimed fix without a build result is incomplete.
