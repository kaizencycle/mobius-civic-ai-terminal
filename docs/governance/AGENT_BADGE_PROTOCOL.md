# Agent Badge Protocol v0.1

**Cycle:** C-410  
**Posture:** DESIGN / FAIL-CLOSED  
**Phase:** 1 (canon + schema) with Phase 2 read-only validation  
**Production mutation:** FORBIDDEN  
**Economic mechanism:** NONE  

---

## Constitutional rule

| Mechanism | Meaning |
|-----------|---------|
| Agent identity | Which registered agent acted |
| Badge | What work that agent may perform |
| Job capability | Permission for a specific task and evidence packet |
| Attestation | The agent's signed conclusion |
| Quorum | Agreement among eligible, independent witnesses |
| Human approval | Consent for the exact consequential action |
| Execution authorization | Narrow, time-bound permission derived from human approval |

**A Badge proves role eligibility. It does not grant sovereign or execution authority.**

Agents may observe, build, review, challenge, and attest within registered scopes. They may not independently authorize consequential execution.

---

## What a Badge is not

- MIC, money, a tradeable token, or a reward
- Proof that an agent's claim is correct
- Permanent execution authority
- Permission to self-approve

---

## Authorization state machine

States advance in order; none may be skipped:

1. **REGISTERED** — agent identity exists  
2. **BADGED** — agent eligible for a defined role  
3. **ASSIGNED** — job-bound capability issued  
4. **ATTESTED** — agent signs conclusion on exact packet  
5. **QUORUM_REACHED** — required independent attestations agree  
6. **HUMAN_APPROVED** — Michael approves exact action and evidence hash  
7. **EXECUTION_AUTHORIZED** — narrow, expiring execution grant issued  
8. **EXPIRED_OR_REVOKED** — grant no longer usable  

**Quorum alone must never transition directly to EXECUTION_AUTHORIZED.**

Example fail-closed posture:

```yaml
badge_valid: true
capability_valid: true
attestations_valid: true
quorum_satisfied: true
human_approval: false
execution_authorized: false
```

---

## Division of labor

Every governed job identifies:

| Role | Responsibility |
|------|----------------|
| STEWARD | Owns and coordinates the work |
| CONTRIBUTOR | Supplies domain-specific evidence |
| VERIFIER | Independently tests claims |
| GUARDIAN | Evaluates civic and constitutional consequences |
| HUMAN | May authorize the consequential action |

No agent may simultaneously build the consequential change, supply its only supporting evidence, verify its own claims, and authorize its execution.

---

## Repository placement (C-410)

| Path | Purpose |
|------|---------|
| `governance/schemas/` | JSON Schema for badge, capability, job routing, authorization state |
| `governance/agents/` | Public badge declarations (`registry.json` + per-agent exports) |
| `lib/agents/badge/` | Canonical stewardship registry + read-only validation |
| `docs/governance/AGENT_BADGE_PROTOCOL.md` | This document |
| `mobius.yaml` → `stewardship` | Surface routing declarations |

**Terminal is a renderer, not the authority source.** Durable truth remains in canon / ledger layers (CPC anchoring in Phase 3+).

---

## Cryptography

`public_key_id` is `null` until Phase 3 attestation binding. Do not simulate valid signatures.

No secrets, API keys, private signing keys, or raw credentials belong in public badge records.

---

## Implementation phases

| Phase | Scope | C-410 status |
|-------|-------|--------------|
| 1 | Canon, schema, registry, fixtures | **In scope** |
| 2 | Read-only validation + status exposure | **Partial** (validation module, no runtime API) |
| 3 | Attestation binding + CPC anchoring | Out of scope |
| 4 | Human execution grants | **Forbidden** by this handoff |

---

## Canon anchor

> Agents receive standing to participate, not sovereignty to rule.

Identity establishes who acted.  
The Badge establishes eligibility.  
The attestation records judgment.  
Quorum establishes evidentiary support.  
Human consent authorizes consequential action.

---

*See also:* `lib/agents/badge/stewardshipRegistry.ts`, `tests/contract/agentBadgeProtocol.test.ts`
