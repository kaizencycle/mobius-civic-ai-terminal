from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import AsyncGenerator

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()

KV_URL = os.getenv("UPSTASH_REDIS_REST_URL", "")
KV_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")
JOURNAL_KEY = "mobius:agent_journal"
POLL_S = 5
MAX_QUEUE_SIZE = 256

_subscribers: list[asyncio.Queue[dict]] = []
_last_seen_id: str | None = None


def _register() -> asyncio.Queue[dict]:
    q: asyncio.Queue[dict] = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
    _subscribers.append(q)
    return q


def _unregister(q: asyncio.Queue[dict]) -> None:
    try:
        _subscribers.remove(q)
    except ValueError:
        pass


def _broadcast(event: dict) -> None:
    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


async def _kv_lrange(key: str, start: int, stop: int) -> list[str]:
    if not KV_URL or not KV_TOKEN:
        return []
    url = f"{KV_URL}/lrange/{key}/{start}/{stop}"
    async with httpx.AsyncClient(timeout=4.0) as client:
        r = await client.get(url, headers={"Authorization": f"Bearer {KV_TOKEN}"})
        if r.status_code == 200:
            return r.json().get("result") or []
    return []


async def start_journal_watcher() -> None:
    global _last_seen_id
    while True:
        try:
            raw_entries = await _kv_lrange(JOURNAL_KEY, 0, 19)
            for raw in reversed(raw_entries):
                try:
                    entry: dict = json.loads(raw) if isinstance(raw, str) else raw
                except json.JSONDecodeError:
                    continue

                entry_id = str(entry.get("id") or entry.get("ts") or "")
                if entry_id and entry_id == _last_seen_id:
                    break

                _broadcast(entry)

            if raw_entries:
                try:
                    first = json.loads(raw_entries[0]) if isinstance(raw_entries[0], str) else raw_entries[0]
                    _last_seen_id = str(first.get("id") or first.get("ts") or "")
                except Exception:
                    pass
        except Exception:
            pass

        await asyncio.sleep(POLL_S)


async def _event_generator(q: asyncio.Queue[dict]) -> AsyncGenerator[str, None]:
    yield ": keepalive\n\n"
    try:
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=25.0)
                payload = json.dumps(event, default=str)
                yield f"data: {payload}\n\n"
            except asyncio.TimeoutError:
                yield f": ping {datetime.now(timezone.utc).isoformat()}\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        _unregister(q)


@router.get("/stream/journal-events")
async def stream_journal_events() -> StreamingResponse:
    q = _register()
    return StreamingResponse(
        _event_generator(q),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
