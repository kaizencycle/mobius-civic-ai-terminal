import type { NextRequest } from 'next/server';
import { after, NextResponse } from 'next/server';
import { executeSlackCommand, channelAllowed } from '@/lib/slack-agent/router';
import { loadMobiusManifest } from '@/lib/slack-agent/loadManifest';
import { parseSlackCommandText } from '@/lib/slack-agent/parseCommand';
import { postSlackChatMessage } from '@/lib/slack-agent/postSlackReply';
import { verifySlackRequest } from '@/lib/slack-agent/verifySlackSignature';

export const dynamic = 'force-dynamic';

type SlackEnvelope = {
  type?: string;
  challenge?: string;
  event_id?: string;
  event?: {
    type?: string;
    text?: string;
    user?: string;
    channel?: string;
    thread_ts?: string;
    subtype?: string;
    bot_id?: string;
  };
  team_id?: string;
};

const seenEventIds = new Set<string>();
const SEEN_MAX = 500;

function rememberEventId(id: string): boolean {
  if (seenEventIds.has(id)) return false;
  seenEventIds.add(id);
  if (seenEventIds.size > SEEN_MAX) {
    const first = seenEventIds.values().next().value as string | undefined;
    if (first) seenEventIds.delete(first);
  }
  return true;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: NextRequest) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!signingSecret) {
    return json({ ok: false, error: 'SLACK_SIGNING_SECRET not configured' }, 503);
  }

  const rawBody = await req.text();
  const sig = verifySlackRequest({
    signingSecret,
    rawBody,
    timestampHeader: req.headers.get('x-slack-request-timestamp'),
    signatureHeader: req.headers.get('x-slack-signature'),
  });
  if (!sig.ok) {
    return json({ ok: false, error: sig.reason }, 401);
  }

  let body: SlackEnvelope;
  try {
    body = JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  if (body.type === 'url_verification' && typeof body.challenge === 'string') {
    return new NextResponse(body.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (body.type !== 'event_callback' || !body.event || typeof body.event !== 'object') {
    return json({ ok: true });
  }

  const ev = body.event;
  if (ev.type !== 'app_mention') {
    return json({ ok: true });
  }
  if (ev.subtype === 'message_changed' || ev.bot_id) {
    return json({ ok: true });
  }

  const eventId = typeof body.event_id === 'string' ? body.event_id : '';
  if (eventId && !rememberEventId(eventId)) {
    return json({ ok: true });
  }

  const text = typeof ev.text === 'string' ? ev.text : '';
  const user = typeof ev.user === 'string' ? ev.user : 'unknown';
  const channel = typeof ev.channel === 'string' ? ev.channel : undefined;
  const threadTs = typeof ev.thread_ts === 'string' ? ev.thread_ts : undefined;

  let manifest;
  try {
    manifest = loadMobiusManifest();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'manifest_error';
    return json({ ok: false, error: msg }, 500);
  }

  if (!channelAllowed(manifest, channel)) {
    return json({ ok: true });
  }

  const botToken = process.env.SLACK_BOT_TOKEN?.trim();
  if (!botToken) {
    return json({ ok: false, error: 'SLACK_BOT_TOKEN not configured (required to post replies)' }, 503);
  }

  if (!channel) {
    return json({ ok: true });
  }

  const parsed = parseSlackCommandText(text);
  if ('error' in parsed) {
    const hint =
      parsed.error === 'empty_command'
        ? 'Say `@Mobius status` (or vault, cycle, pulse, propose …).'
        : `Parse error: ${parsed.error}`;
    try {
      after(() => {
        void postSlackChatMessage({ botToken, channel, text: hint, threadTs });
      });
    } catch {
      void postSlackChatMessage({ botToken, channel, text: hint, threadTs });
    }
    return json({ ok: true });
  }

  try {
    after(() => {
      void (async () => {
        const result = await executeSlackCommand({
          manifest,
          parsed,
          actorUserId: user,
        });
        await postSlackChatMessage({ botToken, channel, text: result.text, threadTs });
      })();
    });
  } catch {
    void (async () => {
      const result = await executeSlackCommand({
        manifest,
        parsed,
        actorUserId: user,
      });
      await postSlackChatMessage({ botToken, channel, text: result.text, threadTs });
    })();
  }

  return json({ ok: true });
}
