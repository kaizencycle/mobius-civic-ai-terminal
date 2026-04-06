#!/usr/bin/env node
/**
 * thought-broker scheduler bridge
 *
 * Runs on Render as a long-lived worker and triggers Vercel orchestration
 * endpoints on interval using CRON-style expressions.
 */

import cron from 'node-cron';

const TERMINAL_URL = process.env.TERMINAL_URL;
const CRON_SECRET = process.env.CRON_SECRET || process.env.RENDER_SCHEDULER_SECRET;

if (!TERMINAL_URL || !CRON_SECRET) {
  console.error('Missing TERMINAL_URL or CRON_SECRET/RENDER_SCHEDULER_SECRET');
  process.exit(1);
}

async function hit(path) {
  const url = new URL(path, TERMINAL_URL).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${CRON_SECRET}`,
      'content-type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${path} failed: ${res.status} ${res.statusText} ${text.slice(0, 240)}`);
  }

  const payload = await res.json().catch(() => ({}));
  console.log(`[scheduler] ${path} ok`, payload?.timestamp ?? new Date().toISOString());
}

function safeRun(label, fn) {
  fn().catch((error) => {
    console.error(`[scheduler] ${label} failed`, error);
  });
}

// EVE cycle transition lane (daily close / cycle boundary)
cron.schedule('5 5 * * *', () => {
  safeRun('eve-cycle-advance', () => hit('/api/eve/cycle-advance'));
}, { timezone: 'UTC' });

// ATLAS watchdog/synthesis lane (every 30m)
cron.schedule('*/30 * * * *', () => {
  safeRun('atlas-watchdog', () => hit('/api/cron/watchdog'));
}, { timezone: 'UTC' });

console.log('[scheduler] thought-broker scheduler online');
