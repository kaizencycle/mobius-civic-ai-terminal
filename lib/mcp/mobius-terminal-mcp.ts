/**
 * Mobius Terminal MCP tools — integrity-governed bridge (C-286).
 * Registers tools on an MCP `McpServer` instance (mcp-handler / @modelcontextprotocol/sdk).
 */

import { createHash } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerRequest, ServerNotification } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { loadGIState, kvGet, KV_KEYS } from '@/lib/kv/store';
import type { GIState } from '@/lib/kv/store';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';

const NODE_REQUIRE_GI = 0.5;
const WRITE_REQUIRE_GI = 0.6;

const TOOL_EPICON_TAGS: Record<string, string> = {
  get_integrity_snapshot: 'tool:integrity-read',
  get_epicon_feed: 'tool:ledger-read',
  get_vault_status: 'tool:vault-read',
  get_agent_journal: 'tool:journal-read',
  post_epicon_entry: 'tool:ledger-write',
  get_mic_readiness: 'tool:mic-read',
};

export type GiGateResult = {
  allowed: boolean;
  gi: number | null;
  reason?: string;
};

export async function resolveMcpCycleId(): Promise<string> {
  try {
    const fromKv = await kvGet<string>(KV_KEYS.CURRENT_CYCLE);
    if (typeof fromKv === 'string' && fromKv.trim()) return fromKv.trim();
  } catch {
    /* ignore */
  }
  try {
    return await resolveOperatorCycleId();
  } catch {
    return 'unknown';
  }
}

/** GI gate: block only when GI is known and below threshold (never invent GI). */
export async function checkGiGate(minGi: number): Promise<GiGateResult> {
  if (minGi <= 0) return { allowed: true, gi: null };

  let st: GIState | null = null;
  try {
    st = await loadGIState();
  } catch {
    return { allowed: true, gi: null, reason: 'gi_check_failed_allowing' };
  }

  if (!st || typeof st.global_integrity !== 'number' || !Number.isFinite(st.global_integrity)) {
    return { allowed: true, gi: null, reason: 'gi_unknown_allowing' };
  }

  const gi = Math.max(0, Math.min(1, st.global_integrity));
  if (gi < minGi) {
    return { allowed: false, gi, reason: `gi_${gi}_below_threshold_${minGi}` };
  }
  return { allowed: true, gi };
}

export async function logMcpInvocation(params: {
  tool: string;
  args: Record<string, unknown>;
  result_ok: boolean;
  gi: number | null;
  cycle: string;
}): Promise<void> {
  const tag = TOOL_EPICON_TAGS[params.tool] ?? `tool:${params.tool}`;
  const idSuffix = createHash('sha256')
    .update(`${params.tool}:${Date.now()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 12);
  const entry: EpiconLedgerFeedEntry = {
    id: `MCP-${params.tool}-${idSuffix}`,
    timestamp: new Date().toISOString(),
    author: 'HERMES',
    title: `MCP tool: ${params.tool}`,
    body: JSON.stringify({ args: params.args, gi: params.gi, result_ok: params.result_ok }),
    type: 'epicon',
    severity: params.result_ok ? 'nominal' : 'degraded',
    gi: params.gi,
    tags: ['mcp', tag, `tool:${params.tool}`, params.result_ok ? 'result:ok' : 'result:error', `cycle:${params.cycle}`],
    source: 'mcp-bridge',
    verified: false,
    cycle: params.cycle,
    category: 'agent-action',
    status: 'committed',
    agentOrigin: 'HERMES',
  };
  try {
    await pushLedgerEntry(entry);
  } catch {
    /* non-blocking */
  }
}

function internalOrigin(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  return 'http://localhost:3000';
}

async function fetchInternalJson(
  pathWithQuery: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const origin = internalOrigin();
  const url = `${origin}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers as Record<string, string>),
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function textResult(obj: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }],
  };
}

type McpExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export function registerMobiusTerminalMcpTools(server: McpServer): void {
  server.registerTool(
    'get_integrity_snapshot',
    {
      title: 'Integrity snapshot (lite)',
      description:
        'Returns Terminal snapshot-lite: GI, mode, lane freshness, and deployment hints. Prefer before governance actions.',
    },
    async (_extra: McpExtra) => {
      const gate = await checkGiGate(NODE_REQUIRE_GI);
      if (!gate.allowed) {
        return textResult({
          ok: false,
          error: 'gi_gate_blocked',
          gi: gate.gi,
          reason: gate.reason,
        });
      }
      const cycle = await resolveMcpCycleId();
      const { ok, status, data } = await fetchInternalJson('/api/terminal/snapshot-lite');
      await logMcpInvocation({
        tool: 'get_integrity_snapshot',
        args: {},
        result_ok: ok,
        gi: gate.gi,
        cycle,
      });
      if (!ok) return textResult({ ok: false, http_status: status, upstream: data });
      return textResult(data);
    },
  );

  server.registerTool(
    'get_epicon_feed',
    {
      title: 'EPICON feed',
      description: 'Recent EPICON / civic ledger entries from the Terminal feed API.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().default(20),
      },
    },
    async ({ limit }: { limit?: number }, _extra: McpExtra) => {
      const gate = await checkGiGate(NODE_REQUIRE_GI);
      if (!gate.allowed) {
        return textResult({ ok: false, error: 'gi_gate_blocked', gi: gate.gi, reason: gate.reason });
      }
      const cycle = await resolveMcpCycleId();
      const lim = limit ?? 20;
      const { ok, status, data } = await fetchInternalJson(`/api/epicon/feed?limit=${lim}`);
      await logMcpInvocation({
        tool: 'get_epicon_feed',
        args: { limit: lim },
        result_ok: ok,
        gi: gate.gi,
        cycle,
      });
      if (!ok) return textResult({ ok: false, http_status: status, upstream: data });
      return textResult(data);
    },
  );

  server.registerTool(
    'get_vault_status',
    {
      title: 'Vault status',
      description: 'MIC vault / reserve state, Seal lane, and hash coverage from /api/vault/status.',
    },
    async (_extra: McpExtra) => {
      const gate = await checkGiGate(NODE_REQUIRE_GI);
      if (!gate.allowed) {
        return textResult({ ok: false, error: 'gi_gate_blocked', gi: gate.gi, reason: gate.reason });
      }
      const cycle = await resolveMcpCycleId();
      const { ok, status, data } = await fetchInternalJson('/api/vault/status');
      await logMcpInvocation({
        tool: 'get_vault_status',
        args: {},
        result_ok: ok,
        gi: gate.gi,
        cycle,
      });
      if (!ok) return textResult({ ok: false, http_status: status, upstream: data });
      return textResult(data);
    },
  );

  server.registerTool(
    'get_agent_journal',
    {
      title: 'Agent journals',
      description: 'Recent sentinel journal entries (substrate-backed) from /api/agents/journal.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().default(30),
      },
    },
    async ({ limit }: { limit?: number }, _extra: McpExtra) => {
      const gate = await checkGiGate(NODE_REQUIRE_GI);
      if (!gate.allowed) {
        return textResult({ ok: false, error: 'gi_gate_blocked', gi: gate.gi, reason: gate.reason });
      }
      const cycle = await resolveMcpCycleId();
      const lim = limit ?? 30;
      const { ok, status, data } = await fetchInternalJson(`/api/agents/journal?limit=${lim}`);
      await logMcpInvocation({
        tool: 'get_agent_journal',
        args: { limit: lim },
        result_ok: ok,
        gi: gate.gi,
        cycle,
      });
      if (!ok) return textResult({ ok: false, http_status: status, upstream: data });
      return textResult(data);
    },
  );

  server.registerTool(
    'get_mic_readiness',
    {
      title: 'MIC readiness',
      description: 'MIC_READINESS_V1 merge (local + upstream) from /api/mic/readiness.',
    },
    async (_extra: McpExtra) => {
      const gate = await checkGiGate(NODE_REQUIRE_GI);
      if (!gate.allowed) {
        return textResult({ ok: false, error: 'gi_gate_blocked', gi: gate.gi, reason: gate.reason });
      }
      const cycle = await resolveMcpCycleId();
      const { ok, status, data } = await fetchInternalJson('/api/mic/readiness');
      await logMcpInvocation({
        tool: 'get_mic_readiness',
        args: {},
        result_ok: ok,
        gi: gate.gi,
        cycle,
      });
      if (!ok) return textResult({ ok: false, http_status: status, upstream: data });
      return textResult(data);
    },
  );

  server.registerTool(
    'post_epicon_entry',
    {
      title: 'Trigger ECHO ingest (ledger write path)',
      description:
        'POST /api/echo/ingest — refreshes ECHO batch and side-effects (KV, EPICON feed). Requires GI ≥ 0.6 when GI is known. Intent fields are logged to the MCP EPICON row only.',
      inputSchema: {
        title: z.string().min(5).max(200),
        category: z.enum(['governance', 'infrastructure', 'market', 'civic-risk', 'agent-action']),
        rationale: z.string().min(10).max(2000),
        confidence: z.number().min(0).max(1),
      },
    },
    async (
      input: { title: string; category: string; rationale: string; confidence: number },
      _extra: McpExtra,
    ) => {
      const gate = await checkGiGate(WRITE_REQUIRE_GI);
      const cycle = await resolveMcpCycleId();
      if (!gate.allowed) {
        await logMcpInvocation({
          tool: 'post_epicon_entry',
          args: input as Record<string, unknown>,
          result_ok: false,
          gi: gate.gi,
          cycle,
        });
        return textResult({
          ok: false,
          error: 'gi_gate_blocked',
          gi: gate.gi,
          reason: gate.reason,
          message: `GI ${gate.gi ?? 'unknown'} is below the ${WRITE_REQUIRE_GI} threshold required for this write tool.`,
        });
      }

      const { ok, status, data } = await fetchInternalJson('/api/echo/ingest', { method: 'POST' });
      await logMcpInvocation({
        tool: 'post_epicon_entry',
        args: input as Record<string, unknown>,
        result_ok: ok,
        gi: gate.gi,
        cycle,
      });
      if (!ok) return textResult({ ok: false, http_status: status, upstream: data, intent: input });
      return textResult({ ok: true, ingest: data, intent: input, note: 'ECHO ingest triggered; ZEUS verification follows normal promotion flows.' });
    },
  );
}
