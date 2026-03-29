# Cursor Execution Modes — Quick Reference

## Canon

**Code belongs in Git. Signals belong in KV.**

---

## PR_MODE
Use for source code changes.

### Use when changing
- routes
- components
- hooks
- types
- schemas
- dependencies
- workflows
- docs

### Output
- one branch
- one PR
- one reviewable patch

### Do not use for
- heartbeat emissions
- ZEUS runtime events
- EPICON live feed writes
- recurring automation logs

---

## KV_RUNTIME_MODE
Use for live operational signal.

### Use when emitting
- heartbeat events
- ZEUS verification events
- EPICON feed items
- runtime ledger writes
- ingest or health signals

### Output
- runtime write to KV
- no PR
- no branch
- no commit

### Hard rule
Git is not the runtime bus.

---

## DIRECT_MAIN_MODE
Use only when explicitly authorized.

### Use for
- approved low-risk cleanup
- stable docs refresh
- canonical markdown updates

### Output
- direct push to `main`
- no PR

### If blocked
- stop
- report branch protection or permission blocker
- switch to PR_MODE

---

## Dispatcher

If task changes code → **PR_MODE**  
If task emits live signal → **KV_RUNTIME_MODE**  
If task updates approved low-risk static artifacts and direct push is explicitly allowed → **DIRECT_MAIN_MODE**

---

## C-622 split

### Stage 1 — implementation
**PR_MODE**

### Stage 2 — runtime operation
**KV_RUNTIME_MODE**
