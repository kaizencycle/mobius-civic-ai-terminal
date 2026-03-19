# AUREA Overseer v0.1

## Purpose

AUREA acts as a scheduled oversight layer for Mobius external signal intake.

AUREA does not verify truth directly.
AUREA monitors system health and signal pressure.

## Responsibilities

- monitor adapter intake volume
- monitor pending EPICON candidate backlog
- identify low-reliability external sources
- summarize intake conditions for operators
- recommend ZEUS prioritization when needed

## Cron Role

AUREA may run on a scheduled basis using platform cron.

Suggested cadence:
- every 30 minutes for active development on plans that support sub-daily cron jobs
- hourly for standard oversight on plans that support sub-daily cron jobs
- daily on Vercel Hobby deployments that are limited to one cron execution per day

Current repository schedule:
- `35 5 * * *` for `/api/aurea/oversee`
- runs once daily at 05:35 UTC, shortly after the existing EVE and ECHO scheduled jobs

## Output

AUREA outputs an oversight report including:
- adapter health status
- pending candidate count
- counts by external source system
- reliability drift by source
- low reliability source list
- summary
- recommended actions

## Rule

AUREA is an overseer, not a truth authority.

ZEUS remains the verification authority.
EPICON remains the canonical event structure.
