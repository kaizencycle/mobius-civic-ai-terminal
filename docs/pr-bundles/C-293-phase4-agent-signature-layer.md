# C-293 Phase 4 — Agent Signature Layer

## Purpose

Bind registered Mobius agents to signed actions and dedupe keys.

Phase 1: shared quorum state reader.  
Phase 2: canonical state machine.  
Phase 3: agent registry + scope cards.  
Phase 4: signatures + dedupe.

## New modules

```txt
lib/agents/signatures.ts
lib/agents/dedupe.ts
```

## New endpoints

```txt
POST /api/agents/signature/verify
POST /api/agents/signature/consume
```

## Signature envelope

```json
{
  "version": "C-293.phase4.v1",
  "agent": "ZEUS",
  "registry_id": "mobius.agent.zeus",
  "cycle": "C-293",
  "action": "quorum_attestation",
  "payload_hash": "sha256:...",
  "dedupe_key": "ZEUS:C-293:quorum_attestation:seal-C-293-001",
  "signed_at": "...",
  "signature": "..."
}
```

## What gets checked

A signed action is valid only when:

1. agent is registered
2. registry ID matches
3. action is within scope/signs list
4. action is not forbidden
5. payload hash matches body
6. signature verifies
7. dedupe key has not already been consumed

## Dedupe patterns

```txt
AUREA:{cycle}:daily_close
ZEUS:{cycle}:quorum_attestation:{seal_id}
ATLAS:{cycle}:heartbeat:{hour_bucket}
ECHO:{cycle}:ingest:{source_hash}
JADE:{cycle}:canon:{target_hash}
EVE:{cycle}:risk:{incident_or_signal_hash}
HERMES:{cycle}:route:{lane}:{signal_hash}
DAEDALUS:{cycle}:infra:{deployment_or_endpoint_hash}
```

## Current security posture

This PR uses per-agent HMAC signing secrets:

```txt
ECHO_SIGNING_SECRET
ATLAS_SIGNING_SECRET
ZEUS_SIGNING_SECRET
AUREA_SIGNING_SECRET
EVE_SIGNING_SECRET
JADE_SIGNING_SECRET
HERMES_SIGNING_SECRET
DAEDALUS_SIGNING_SECRET
```

This is Phase 4A. A later Phase 4B can move from shared server-side HMAC secrets to asymmetric public/private key verification.

## Canon

Quorum is not consensus by vibes.
Quorum is signed agreement over one shared state.

Signatures prevent impersonation.
Dedupe prevents repeated action.
Scope prevents authority drift.
State machine prevents invalid transitions.

We heal as we walk.
