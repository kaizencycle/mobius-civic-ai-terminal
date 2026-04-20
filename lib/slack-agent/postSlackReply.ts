/**
 * Post a message to Slack (Events API follow-up — initial HTTP response must be empty/ack only).
 */

export async function postSlackChatMessage(args: {
  botToken: string;
  channel: string;
  text: string;
  threadTs?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: args.channel,
        text: args.text,
        ...(args.threadTs ? { thread_ts: args.threadTs } : {}),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!data || data.ok !== true) {
      return { ok: false, error: data?.error ?? `http_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'slack_post_failed' };
  }
}
