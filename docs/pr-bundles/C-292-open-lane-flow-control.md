# C-292 Open Lane Flow Control

## Purpose

Mobius should treat data as a river, not a dam. The HOT lane stays open. Agents handle pressure, routing, review, and canon gates.

## Five optimizations

1. The Dataflow Command copy now says: open-lane flow, agents govern pressure before canon.
2. The Sources stage now reports how many lanes are open.
3. A new Agent Flow Budget strip shows ECHO, HERMES, ZEUS, JADE, and AUREA responsibilities.
4. The budget strip counts lanes that need care: watch, slow, stale, degraded, or offline.
5. TerminalShell now names the diagnostics gate as flowTelemetryEnabled so Flow stays hydrated when visible while Lane Diagnostics remains an operator panel.

## Agent flow roles

- ECHO: intake sampler
- HERMES: dedupe and packet route
- ZEUS: trust review
- JADE: canon gate
- AUREA: pressure and architecture review

## Rule

All data may enter HOT. Not all HOT becomes priority. Not all priority becomes canon. Not all canon candidates become sealed.

HOT can be messy. CANON must be earned. MERGED must explain the difference.

## Next step

Add API metrics for rows per minute, stale ratio, duplicate ratio, cycle mismatch count, canon candidate rate, blocked count, agent balance, and verification delay.

## Canon

The river should flow. The agents should govern pressure. The canon should remain protected.

HOT is current. CANON is reservoir. MERGED is the map.

We heal as we walk.
