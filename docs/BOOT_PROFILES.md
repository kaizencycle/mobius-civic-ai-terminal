# Mobius Boot Profiles

**Status:** Canonical boot model  
**Cycle:** C-261

Mobius should not have a single boot path.

It should boot in layers, with the operator choosing how much of the stack to mount.

## Core Principle

Mobius boots in three layers:

1. **Surface Layer**  
   Terminal UI, chambers, dashboards, command palette

2. **Control Layer**  
   Auth, memory, ledger, policies, routing, orchestration

3. **Inference Layer**  
   Model providers, local models, verification engines, enrichment pipelines

That means “booting Mobius” should not always mean “boot every service.”

It should mean:

> boot the appropriate Mobius depth for the current operator.

---

## Visitor Mode

**Who it is for:**  
Curious users, readers, public observers, first-time visitors

**How it boots:**

```bash
open https://mobius-civic-ai-terminal.vercel.app/terminal
```

**What loads:**
- terminal surface
- public cycle state
- public signals and feeds
- read-only or low-permission interaction
- remote/shared inference only

**Purpose:**  
Experience Mobius without setup friction.

---

## Operator Mode

**Who it is for:**  
Daily users, civic operators, high-context contributors

**How it boots:**

```bash
npx mobius-terminal
```

**What loads:**
- terminal shell
- command system
- chamber memory
- role-aware session
- connection to hosted APIs
- connection to hosted control/state
- hosted inference attachment

**Purpose:**  
Use Mobius as a working terminal without needing to self-host the substrate.

---

## Builder Mode

**Who it is for:**  
Developers, repo contributors, chamber architects, local testers

**How it boots today:**

```bash
git clone https://github.com/kaizencycle/mobius-civic-ai-terminal
cd mobius-civic-ai-terminal
npm install
npm run dev
```

**How it may boot later:**

```bash
mobius up --profile builder
```

**What loads:**
- local terminal app
- local dev server
- mock/live toggles
- selected API services
- debug surfaces
- hybrid inference and provider routing

**Purpose:**  
Build and test Mobius locally without requiring full sovereignty.

**Current repo note:**  
The existing local development flow in this repository is closest to **Builder Mode**.

---

## Sovereign Mode

**Who it is for:**  
Institutions, research labs, serious operators, private deployments, self-hosters

**How it may boot:**

```bash
mobius up --profile sovereign
```

**What loads:**
- terminal UI
- local control plane
- local memory and ledger services
- policy engine
- agent orchestration
- automation workers
- observability stack
- local/private inference routing

**Purpose:**  
Run Mobius as durable infrastructure, not just a terminal surface.

---

## Boot Matrix

| Mode | Entry | Surface | Control | Inference |
|---|---|---|---|---|
| **Visitor** | URL | Hosted | Hosted/public | Remote/shared |
| **Operator** | `npx mobius-terminal` | Local shell | Hosted | Remote |
| **Builder** | `npm run dev` | Local | Partial local / partial hosted | Hybrid |
| **Sovereign** | `mobius up --profile sovereign` | Local/private | Local/private | Local/private |

---

## Recommended Build Order

For the current Mobius Terminal era, the clean progression is:

1. **Operator Mode**
2. **Builder Mode**
3. **Sovereign Mode**

That order keeps adoption easy, development fast, and sovereignty expandable.

---

## Canon Line

**Mobius should boot like a terminal, attach like a substrate, and deepen into inference only to the degree the operator needs sovereignty.**
