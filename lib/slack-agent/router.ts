import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { terminalInternalOrigin } from '@/lib/oaa/internalOrigin';
import { publishToOaaAndLedger } from '@/lib/oaa/publishSnapshot';
import { OAADataClient } from '@/lib/ingestion/OAADataClient';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import { loadDeclaredWorkflowIdsFromMobiusYaml } from '@/lib/mesh/loadMobiusYaml';
import { provenanceShortLabel } from '@/lib/terminal/memoryMode';
import {
  createGithubBranchRef,
  createGithubDraftPullRequest,
  dispatchGithubWorkflow,
  getDefaultBranchSha,
  getRepoFileSha,
  putRepoFileOnBranch,
  resolveSlackAgentGithubRepo,
  slackAgentWorkflowFilename,
} from '@/lib/slack-agent/githubOps';
import type { MobiusManifestV1, ParsedSlackCommand, SlackCommandResult } from '@/lib/slack-agent/types';

async function fetchJson(path: string): Promise<unknown> {
  const origin = terminalInternalOrigin();
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`fetch_${path}_${res.status}`);
  return res.json();
}

function fmtSourceFooterFromLite(lite: Record<string, unknown>): string {
  const meta = lite.meta && typeof lite.meta === 'object' ? (lite.meta as Record<string, unknown>) : {};
  const kvAvail = meta.kv_available === true;
  const prov = typeof lite.gi_provenance === 'string' ? lite.gi_provenance : null;
  const verified = lite.gi_verified === true;
  const giSrc = typeof lite.gi_source === 'string' ? lite.gi_source : 'unknown';
  const memShort = provenanceShortLabel(prov);
  const ledgerLine =
    verified && prov === 'oaa-verified'
      ? 'Ledger-backed: OAA verified GI (warm mirror)'
      : verified
        ? 'Ledger-backed: GI marked verified (see snapshot provenance)'
        : 'Ledger-backed: no (GI not OAA-verified in this snapshot)';
  return [
    '— Source mode —',
    `KV: ${kvAvail ? 'available' : 'unavailable / degraded'}`,
    `Verified memory: ${verified ? 'yes' : 'no'} (${memShort}${prov ? ` · ${prov}` : ''})`,
    `GI lane: ${giSrc}`,
    ledgerLine,
  ].join('\n');
}

function fmtStatus(lite: Record<string, unknown>): string {
  const cycle = typeof lite.cycle === 'string' ? lite.cycle : '?';
  const gi = typeof lite.gi === 'number' ? lite.gi.toFixed(2) : String(lite.gi ?? 'n/a');
  const degraded = lite.degraded === true;
  const lanes = lite.lanes && typeof lite.lanes === 'object' ? (lite.lanes as Record<string, unknown>) : {};
  const kv = lanes.kv && typeof lanes.kv === 'object' ? (lanes.kv as Record<string, unknown>) : {};
  const kvOk = kv.ok === true;
  const integ = lanes.integrity && typeof lanes.integrity === 'object' ? (lanes.integrity as Record<string, unknown>) : {};
  const giSource = typeof integ.source === 'string' ? integ.source : 'unknown';
  const tw = lanes.tripwire && typeof lanes.tripwire === 'object' ? (lanes.tripwire as Record<string, unknown>) : {};
  const twElev = tw.elevated === true;
  const hb = lite.heartbeat && typeof lite.heartbeat === 'object' ? (lite.heartbeat as Record<string, unknown>) : {};
  const runtimeHb = hb.runtime != null ? JSON.stringify(hb.runtime) : 'n/a';

  const lines = [
    `${cycle} · GI ${gi} · KV ${kvOk ? 'ok' : 'degraded'} · degraded=${degraded}`,
    `GI source: ${giSource} · tripwires elevated=${twElev}`,
    `heartbeat runtime: ${runtimeHb}`,
    `Source: /api/terminal/snapshot-lite`,
    '',
    fmtSourceFooterFromLite(lite),
  ];
  return lines.join('\n');
}

function pickVaultSummary(vault: Record<string, unknown>): string {
  const balance =
    typeof vault.balance_reserve === 'number'
      ? vault.balance_reserve
      : typeof vault.in_progress_balance === 'number'
        ? vault.in_progress_balance
        : null;
  const thr = typeof vault.activation_threshold === 'number' ? vault.activation_threshold : null;
  const seal = vault.seal_lane && typeof vault.seal_lane === 'object' ? (vault.seal_lane as Record<string, unknown>) : {};
  const fountain = typeof seal.fountain === 'string' ? seal.fountain : JSON.stringify(seal.fountain ?? seal);
  const gi = typeof vault.gi_current === 'number' ? vault.gi_current.toFixed(2) : String(vault.gi_current ?? 'n/a');
  const giThr = typeof vault.gi_threshold === 'number' ? vault.gi_threshold.toFixed(2) : String(vault.gi_threshold ?? 'n/a');

  const lines = [
    balance != null && thr != null ? `Reserve in window: ${balance} / ${thr}` : `Vault payload keys: ${Object.keys(vault).slice(0, 8).join(', ')}…`,
    `Fountain / seal lane: ${fountain}`,
    `GI ${gi} vs threshold ${giThr}`,
    `Source: /api/vault/status + /api/mic/readiness (MIC line below)`,
  ];
  return lines.join('\n');
}

function fmtMicLine(mic: Record<string, unknown>): string {
  const snap = mic.snapshot && typeof mic.snapshot === 'object' ? (mic.snapshot as Record<string, unknown>) : mic;
  const ready = snap.mint_eligible === true ? 'mint eligible (upstream)' : 'mint eligibility per upstream / snapshot';
  return `MIC readiness: ${ready} (see /api/mic/readiness for full envelope)`;
}

function fmtCycle(cycleFile: Record<string, unknown>, lite: Record<string, unknown> | null): string {
  const c = typeof cycleFile.cycle === 'string' ? cycleFile.cycle : '?';
  const mode = typeof cycleFile.mode === 'string' ? cycleFile.mode : String(cycleFile.mode ?? '');
  const deg = cycleFile.degraded === true;
  const blockers = deg ? 'degraded=true (from cycle-state)' : 'no cycle-state degraded flag';
  const fetched = typeof cycleFile.fetched_at === 'string' ? cycleFile.fetched_at : '';
  const lines = [
    `Cycle: ${c} · mode ${mode}`,
    `Blockers / state: ${blockers}`,
    `cycle-state fetched_at: ${fetched}`,
  ];
  if (lite?.meta && typeof lite.meta === 'object') {
    const m = lite.meta as Record<string, unknown>;
    lines.push(`snapshot-lite cycle_source: ${String(m.cycle_source ?? '')}`);
  }
  lines.push(`Source: ledger/cycle-state.json (+ snapshot-lite when available)`);
  let out = lines.join('\n');
  if (lite) {
    out += `\n\n${fmtSourceFooterFromLite(lite)}`;
  } else {
    out += '\n\n— Source mode —\nsnapshot-lite unavailable (KV / verified-memory footer skipped)';
  }
  return out;
}

function fmtPulse(lite: Record<string, unknown>): string {
  const lanes = lite.lanes && typeof lite.lanes === 'object' ? (lite.lanes as Record<string, unknown>) : {};
  const pulse = lanes.pulse && typeof lanes.pulse === 'object' ? (lanes.pulse as Record<string, unknown>) : {};
  const integ = lanes.integrity && typeof lanes.integrity === 'object' ? (lanes.integrity as Record<string, unknown>) : {};
  const lines = [
    `pulse ok=${pulse.ok === true} composite=${String(pulse.composite ?? 'n/a')} instruments=${String(pulse.instruments ?? 'n/a')} anomalies=${String(pulse.anomalies ?? 'n/a')}`,
    `pulse freshness=${String(pulse.freshness ?? '')} age_seconds=${String(pulse.age_seconds ?? '')}`,
    `integrity GI=${String(integ.gi ?? '')} verified=${String(integ.verified ?? '')}`,
    `Source: snapshot-lite lanes (SYSTEM_PULSE in KV)`,
    '',
    fmtSourceFooterFromLite(lite),
  ];
  return lines.join('\n');
}

function fmtReadiness(mic: Record<string, unknown>): string {
  return `MIC readiness (truncated):\n${JSON.stringify(mic).slice(0, 3500)}${JSON.stringify(mic).length > 3500 ? '…' : ''}`;
}

function fmtJournal(lite: Record<string, unknown>): string {
  const hb = lite.heartbeat && typeof lite.heartbeat === 'object' ? (lite.heartbeat as Record<string, unknown>) : {};
  const j = hb.journal;
  return [
    `Journal heartbeat: ${j != null ? JSON.stringify(j) : 'n/a'}`,
    `Full feed: GET /api/agents/journal (service auth on host)`,
    '',
    fmtSourceFooterFromLite(lite),
  ].join('\n');
}

async function logOaaAudit(args: {
  manifest: MobiusManifestV1;
  actor: string;
  command: string;
  cycle: string;
  intent: string;
}): Promise<SlackCommandResult['oaa']> {
  if (!args.manifest.slack_agent.write_policy.oaa_logging_required) {
    return { ok: true, skipped: true };
  }
  const client = OAADataClient.fromEnv();
  if (!client) {
    return { ok: false, skipped: true, error: 'oaa_client_unconfigured' };
  }
  const r = await client.write({
    key: `slack:agent:audit:${randomUUID()}`,
    value: {
      type: 'SLACK_AGENT_AUDIT_V1',
      source: 'slack-agent',
      actor: args.actor,
      command: args.command,
      cycle: args.cycle,
      intent: args.intent,
      timestamp: new Date().toISOString(),
    },
    agent: 'SLACK_AGENT',
    cycle: args.cycle,
    intent: `slack_audit:${args.command}`,
    previousHash: null,
  });
  if (r.ok) return { ok: true, hash: r.hash };
  return { ok: false, error: 'error' in r ? r.error : 'oaa_failed' };
}

export async function executeSlackCommand(args: {
  manifest: MobiusManifestV1;
  parsed: ParsedSlackCommand;
  actorUserId: string;
  actorDisplay?: string;
}): Promise<SlackCommandResult> {
  const { manifest, parsed } = args;
  const actor = args.actorDisplay?.trim() || args.actorUserId;
  const cycle = await resolveOperatorCycleId().catch(() => 'unknown');

  if (!manifest.slack_agent.enabled) {
    return { text: 'Mobius Slack agent is disabled in mobius-manifest.json.' };
  }
  if (!manifest.slack_agent.allowed_commands.includes(parsed.name)) {
    await logOaaAudit({ manifest, actor, command: parsed.name, cycle, intent: parsed.raw }).catch(() => null);
    return { text: `Command \`${parsed.name}\` is not allowed by manifest.` };
  }

  const audit = await logOaaAudit({ manifest, actor, command: parsed.name, cycle, intent: parsed.raw });

  try {
    switch (parsed.name) {
      case 'status': {
        const lite = (await fetchJson('/api/terminal/snapshot-lite')) as Record<string, unknown>;
        return { text: fmtStatus(lite), oaa: audit };
      }
      case 'vault': {
        const [vault, mic, lite] = await Promise.all([
          fetchJson('/api/vault/status') as Promise<Record<string, unknown>>,
          fetchJson('/api/mic/readiness') as Promise<Record<string, unknown>>,
          fetchJson('/api/terminal/snapshot-lite') as Promise<Record<string, unknown>>,
        ]);
        return {
          text: `${pickVaultSummary(vault)}\n${fmtMicLine(mic)}\n\n${fmtSourceFooterFromLite(lite)}`,
          oaa: audit,
        };
      }
      case 'cycle': {
        let cycleFile: Record<string, unknown> = {};
        try {
          const raw = readFileSync(join(process.cwd(), 'ledger/cycle-state.json'), 'utf8');
          cycleFile = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          cycleFile = { error: 'cycle_state_unreadable' };
        }
        let lite: Record<string, unknown> | null = null;
        try {
          lite = (await fetchJson('/api/terminal/snapshot-lite')) as Record<string, unknown>;
        } catch {
          lite = null;
        }
        return { text: fmtCycle(cycleFile, lite), oaa: audit };
      }
      case 'pulse': {
        const lite = (await fetchJson('/api/terminal/snapshot-lite')) as Record<string, unknown>;
        return { text: fmtPulse(lite), oaa: audit };
      }
      case 'readiness': {
        const mic = (await fetchJson('/api/mic/readiness')) as Record<string, unknown>;
        return {
          text: `${fmtReadiness(mic)}\n\n— Source mode —\nMIC readiness is a dedicated API envelope (not snapshot-lite).\nUse \`@Mobius status\` for KV + verified-memory + GI lane in one view.`,
          oaa: audit,
        };
      }
      case 'journal': {
        const lite = (await fetchJson('/api/terminal/snapshot-lite')) as Record<string, unknown>;
        return { text: fmtJournal(lite), oaa: audit };
      }
      case 'quest': {
        const task = parsed.args.trim().length > 0 ? parsed.args.trim() : '(no quest text)';
        const proposal = await publishToOaaAndLedger({
          kind: 'slack_agent_command',
          key: `slack:agent:quest:${randomUUID()}`,
          value: {
            type: 'SLACK_AGENT_QUEST_V1',
            source: 'slack-agent',
            actor,
            cycle,
            task,
            timestamp: new Date().toISOString(),
          },
          agent: 'SLACK_AGENT',
          intent: `slack_quest:${task}`,
        });
        return {
          text: `Logged quest proposal to OAA.\nTask: ${task}\nOAA: ${proposal.oaa.ok ? 'ok' : proposal.oaa.error ?? 'failed'}${proposal.oaa.hash ? ` hash=${proposal.oaa.hash}` : ''}`,
          oaa: audit,
          ledger: proposal.ledger,
        };
      }
      case 'propose': {
        if (!parsed.args.trim()) {
          return { text: 'Usage: `@Mobius propose <task>`', oaa: audit };
        }
        const proposal = await publishToOaaAndLedger({
          kind: 'slack_agent_command',
          key: `slack:agent:proposal:${randomUUID()}`,
          value: {
            type: 'SLACK_AGENT_PROPOSAL_V1',
            source: 'slack-agent',
            actor,
            command: 'propose',
            cycle,
            task: parsed.args.trim(),
            timestamp: new Date().toISOString(),
          },
          agent: 'SLACK_AGENT',
          intent: `slack_propose:${parsed.args.trim()}`,
        });
        return {
          text: [
            `Logged proposal to OAA.`,
            `Task: ${parsed.args.trim()}`,
            `OAA: ${proposal.oaa.ok ? 'ok' : proposal.oaa.error ?? 'failed'}${proposal.oaa.hash ? ` · hash=${proposal.oaa.hash}` : ''}`,
            manifest.slack_agent.write_policy.ledger_logging_for_meaningful_actions
              ? `Ledger proof: ${proposal.ledger.ok ? 'ok' : proposal.ledger.skipped ? `skipped (${proposal.ledger.reason ?? ''})` : 'failed'}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          oaa: audit,
          ledger: proposal.ledger,
        };
      }
      case 'draft-pr': {
        if (manifest.slack_agent.write_policy.auto_merge_allowed) {
          return { text: 'Refusing draft-pr: manifest has auto_merge_allowed (must stay false for Slack agent).', oaa: audit };
        }
        const title = parsed.args.trim() || '(untitled)';
        const repo =
          manifest.slack_agent.github?.repo?.trim() ||
          resolveSlackAgentGithubRepo();
        if (!repo) {
          return {
            text: `Draft PR not configured: set \`slack_agent.github.repo\` (owner/repo) or env \`GITHUB_REPOSITORY\` / \`SLACK_AGENT_GITHUB_REPO\`, plus \`GITHUB_TOKEN\` with contents + pull_requests.\nTitle requested: ${title}`,
            oaa: audit,
          };
        }
        const baseBranch =
          manifest.slack_agent.github?.default_branch?.trim() ||
          process.env.SLACK_AGENT_GITHUB_BASE?.trim() ||
          'main';
        const relPath =
          manifest.slack_agent.github?.draft_pr_path?.trim() ||
          '.mobius/slack-agent/drafts/README.md';
        const baseSha = await getDefaultBranchSha(repo);
        if (!baseSha.ok) {
          return { text: `Draft PR failed: ${baseSha.error}`, oaa: audit };
        }
        const slug = randomUUID().replace(/-/g, '').slice(0, 10);
        const branchName = `cursor/slack-draft-${slug}`;
        const refOk = await createGithubBranchRef({ repo, branchName, fromSha: baseSha.sha });
        if (!refOk.ok) {
          return { text: `Draft PR failed (branch): ${refOk.error}`, oaa: audit };
        }
        const existing = await getRepoFileSha({ repo, path: relPath, branch: branchName });
        if (!existing.ok) {
          return { text: `Draft PR failed (read path): ${existing.error}`, oaa: audit };
        }
        const body = [
          `# ${title}`,
          '',
          `Opened from Mobius Slack Agent · cycle ${cycle} · actor ${actor}`,
          '',
          `Timestamp: ${new Date().toISOString()}`,
          '',
          '_Non-protected proposal file — not ledger truth._',
        ].join('\n');
        const put = await putRepoFileOnBranch({
          repo,
          path: relPath,
          branch: branchName,
          message: `chore(slack-agent): draft proposal — ${title.slice(0, 72)}`,
          contentUtf8: body,
          sha: existing.sha ?? undefined,
        });
        if (!put.ok) {
          return { text: `Draft PR failed (commit): ${put.error}`, oaa: audit };
        }
        const pr = await createGithubDraftPullRequest({
          repo,
          title: `[slack-agent] ${title}`,
          headBranch: branchName,
          baseBranch,
        });
        if (!pr.ok) {
          return {
            text: `Branch ${branchName} pushed with proposal file, but draft PR failed: ${pr.error}`,
            oaa: audit,
          };
        }
        const proof = await publishToOaaAndLedger({
          kind: 'slack_agent_command',
          key: `slack:agent:draft-pr:${randomUUID()}`,
          value: {
            type: 'SLACK_AGENT_DRAFT_PR_V1',
            source: 'slack-agent',
            actor,
            cycle,
            title,
            repo,
            branch: branchName,
            path: relPath,
            pr_number: pr.number,
            pr_url: pr.html_url,
            timestamp: new Date().toISOString(),
          },
          agent: 'SLACK_AGENT',
          intent: `slack_draft_pr:${title}`,
        });
        return {
          text: [
            `Opened **draft** PR #${pr.number}: ${pr.html_url}`,
            `Branch: \`${branchName}\` · file: \`${relPath}\``,
            `OAA: ${proof.oaa.ok ? 'ok' : proof.oaa.error ?? 'failed'}${proof.oaa.hash ? ` · hash=${proof.oaa.hash}` : ''}`,
            manifest.slack_agent.write_policy.ledger_logging_for_meaningful_actions
              ? `Ledger proof: ${proof.ledger.ok ? 'ok' : proof.ledger.skipped ? `skipped (${proof.ledger.reason ?? ''})` : 'failed'}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          oaa: audit,
          ledger: proof.ledger,
        };
      }
      case 'run': {
        const wf = parsed.args.trim().replace(/\s+/g, '-').toLowerCase();
        if (!wf) {
          return { text: 'Usage: `@Mobius run <workflow-id>`\nAllowed: ' + manifest.slack_agent.allowed_workflows.join(', '), oaa: audit };
        }
        if (!manifest.slack_agent.allowed_workflows.includes(wf)) {
          return { text: `Workflow \`${wf}\` is not in manifest allowlist.`, oaa: audit };
        }
        const declared = loadDeclaredWorkflowIdsFromMobiusYaml();
        if (declared.length > 0 && !declared.includes(wf)) {
          return {
            text: `Workflow \`${wf}\` is not declared in mobius.yaml \`jobs.workflows\`.\nDeclared ids: ${declared.join(', ') || '(none)'}\nUpdate mobius.yaml or manifest before dispatch.`,
            oaa: audit,
          };
        }
        const repo =
          manifest.slack_agent.github?.repo?.trim() ||
          resolveSlackAgentGithubRepo();
        if (!repo) {
          return {
            text: `Cannot dispatch \`${wf}\`: set \`slack_agent.github.repo\` or \`GITHUB_REPOSITORY\` / \`SLACK_AGENT_GITHUB_REPO\`, plus \`GITHUB_TOKEN\` with workflow scope.`,
            oaa: audit,
          };
        }
        const dispatch = await dispatchGithubWorkflow({ repo, workflowId: wf });
        if (!dispatch.ok) {
          return {
            text: `Dispatch failed for \`${wf}\` (${slackAgentWorkflowFilename(wf)}): ${dispatch.error}`,
            oaa: audit,
          };
        }
        const proof = await publishToOaaAndLedger({
          kind: 'slack_agent_command',
          key: `slack:agent:workflow:${randomUUID()}`,
          value: {
            type: 'SLACK_AGENT_WORKFLOW_DISPATCH_V1',
            source: 'slack-agent',
            actor,
            cycle,
            workflow_id: wf,
            workflow_file: slackAgentWorkflowFilename(wf),
            repo,
            timestamp: new Date().toISOString(),
          },
          agent: 'SLACK_AGENT',
          intent: `slack_workflow:${wf}`,
        });
        return {
          text: [
            `Triggered \`workflow_dispatch\` for **${wf}** (\`${slackAgentWorkflowFilename(wf)}\`) on \`${repo}\`.`,
            `OAA: ${proof.oaa.ok ? 'ok' : proof.oaa.error ?? 'failed'}${proof.oaa.hash ? ` · hash=${proof.oaa.hash}` : ''}`,
            manifest.slack_agent.write_policy.ledger_logging_for_meaningful_actions
              ? `Ledger proof: ${proof.ledger.ok ? 'ok' : proof.ledger.skipped ? `skipped (${proof.ledger.reason ?? ''})` : 'failed'}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          oaa: audit,
          ledger: proof.ledger,
        };
      }
      default: {
        return { text: 'Unknown command.', oaa: audit };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      text: `Command failed (operator truth): ${msg}`,
      oaa: audit,
    };
  }
}

export function channelAllowed(manifest: MobiusManifestV1, channelId: string | undefined): boolean {
  const allow = manifest.slack_agent.allowed_channel_ids;
  if (!allow || allow.length === 0) return true;
  if (!channelId) return false;
  return allow.includes(channelId);
}
