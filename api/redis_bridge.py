import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, Optional

import redis.asyncio as redis
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI(title="Mobius Redis Bridge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

redis_client: Optional[redis.Redis] = None


KEY_PATTERNS = {
    "agent": "mobius:agent:{agent_id}",
    "agent_status": "mobius:agent:{agent_id}:status",
    "agent_heartbeat": "mobius:agent:{agent_id}:heartbeat",
    "epicon": "mobius:epicon:{event_id}",
    "epicon_timeline": "mobius:epicon:timeline",
    "signal_stream": "mobius:signal:stream",
    "gi_current": "mobius:gi:current",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso_timestamp(raw: Optional[str]) -> datetime:
    if not raw:
        return datetime.now(timezone.utc)

    try:
        normalized = raw.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return datetime.now(timezone.utc)


async def get_redis() -> redis.Redis:
    global redis_client
    if redis_client is None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        redis_client = redis.from_url(redis_url, decode_responses=True)
    return redis_client


@app.get("/api/v1/agents/status")
async def get_agents_status():
    r = await get_redis()

    agent_keys: list[str] = []
    async for key in r.scan_iter(match="mobius:agent:*:status"):
        agent_keys.append(key)

    agents = []
    for key in agent_keys:
        raw = await r.get(key)
        if not raw:
            continue
        try:
            agent = json.loads(raw)
        except json.JSONDecodeError:
            continue

        heartbeat_key = key.replace(":status", ":heartbeat")
        heartbeat = await r.get(heartbeat_key)
        if heartbeat:
            agent["last_seen"] = heartbeat
        agents.append(agent)

    timestamp = now_iso()
    return {
        "success": True,
        "source": "redis_kv",
        "count": len(agents),
        "data": agents,
        # Terminal compatibility fields
        "cycle": "live",
        "timestamp": timestamp,
        "agents": agents,
    }


@app.get("/api/v1/agents/{agent_id}")
async def get_agent_detail(agent_id: str):
    r = await get_redis()

    status_key = KEY_PATTERNS["agent_status"].format(agent_id=agent_id)
    heartbeat_key = KEY_PATTERNS["agent_heartbeat"].format(agent_id=agent_id)
    state_key = KEY_PATTERNS["agent"].format(agent_id=agent_id)

    status_data = await r.get(status_key)
    if not status_data:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    heartbeat = await r.get(heartbeat_key)
    state_data = await r.get(state_key)
    events_raw = await r.lrange(f"mobius:agent:{agent_id}:events", 0, 49)

    agent = json.loads(status_data)
    agent["heartbeat"] = heartbeat
    agent["state"] = json.loads(state_data) if state_data else {}
    agent["recent_events"] = [json.loads(item) for item in events_raw]

    return {"success": True, "data": agent}


@app.get("/api/v1/epicon/feed")
async def get_epicon_feed(limit: int = 50, agent: Optional[str] = None):
    r = await get_redis()

    rows = await r.zrevrange(KEY_PATTERNS["epicon_timeline"], 0, max(0, limit - 1), withscores=False)

    items = []
    for row in rows:
        try:
            event = json.loads(row)
        except json.JSONDecodeError:
            continue
        if agent and agent not in event.get("agent_trace", []):
            continue
        items.append(event)

    timestamp = now_iso()
    return {
        "success": True,
        "count": len(items),
        "data": items,
        # Terminal compatibility fields
        "cycle": "live",
        "timestamp": timestamp,
        "items": items,
    }


async def calculate_gi_from_signals() -> Dict[str, Any]:
    r = await get_redis()
    signals = await r.lrange(KEY_PATTERNS["signal_stream"], 0, 99)

    if not signals:
        return {
            "score": 0.5,
            "delta": 0,
            "institutional_trust": 0.5,
            "info_reliability": 0.5,
            "consensus_stability": 0.5,
            "weekly": [0.5] * 7,
            "factors": {
                "source_reliability": 0.5,
                "institutional_trust": 0.5,
                "consensus_stability": 0.5,
                "narrative_divergence": 0.5,
            },
            "calculated_at": now_iso(),
            "source": "fallback",
        }

    factors: Dict[str, list[float]] = {
        "source_reliability": [],
        "institutional_trust": [],
        "consensus_stability": [],
        "narrative_divergence": [],
    }

    for raw in signals:
        try:
            signal = json.loads(raw)
        except json.JSONDecodeError:
            continue

        for factor in factors:
            value = signal.get(factor)
            if isinstance(value, (int, float)):
                factors[factor].append(float(value))

    avg_factors = {
        name: (sum(values) / len(values) if values else 0.5)
        for name, values in factors.items()
    }

    score = sum(avg_factors.values()) / len(avg_factors)

    return {
        "score": round(score, 4),
        "delta": 0,
        "institutional_trust": round(avg_factors["institutional_trust"], 4),
        "info_reliability": round(avg_factors["source_reliability"], 4),
        "consensus_stability": round(avg_factors["consensus_stability"], 4),
        "weekly": [round(score, 4)] * 7,
        "factors": avg_factors,
        "calculated_at": now_iso(),
        "source": "redis_aggregated",
        "sample_size": len(signals),
    }


@app.get("/api/v1/integrity/current")
async def get_integrity_current():
    r = await get_redis()

    raw = await r.get(KEY_PATTERNS["gi_current"])
    if raw:
        gi = json.loads(raw)
    else:
        gi = await calculate_gi_from_signals()

    return {
        "success": True,
        "data": gi,
        # Terminal compatibility fields
        "cycle": "live",
        "timestamp": now_iso(),
        "gi": gi,
    }


@app.get("/api/v1/tripwires/active")
async def get_tripwires():
    r = await get_redis()

    keys: list[str] = []
    async for key in r.scan_iter(match="mobius:tripwire:active:*"):
        keys.append(key)

    tripwires = []
    for key in keys:
        raw = await r.get(key)
        if not raw:
            continue
        try:
            tripwires.append(json.loads(raw))
        except json.JSONDecodeError:
            continue

    return {
        "success": True,
        "data": tripwires,
        # Terminal compatibility fields
        "cycle": "live",
        "timestamp": now_iso(),
        "tripwires": tripwires,
    }


async def event_stream() -> AsyncGenerator[str, None]:
    r = await get_redis()
    pubsub = r.pubsub()

    await pubsub.subscribe(
        "mobius:events",
        "mobius:agent:updates",
        "mobius:epicon:new",
        "mobius:tripwire:triggered",
    )

    yield f"event: heartbeat\ndata: {json.dumps({'type': 'heartbeat', 'cycle': 'live', 'timestamp': now_iso(), 'message': 'connected'})}\n\n"

    channel_to_event = {
        "mobius:events": "integrity",
        "mobius:agent:updates": "agents",
        "mobius:epicon:new": "epicon",
        "mobius:tripwire:triggered": "tripwire",
    }

    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue

            channel = message.get("channel")
            data = message.get("data")

            try:
                payload = json.loads(data)
            except (TypeError, json.JSONDecodeError):
                continue

            event_name = channel_to_event.get(channel, "heartbeat")
            yield f"event: {event_name}\ndata: {json.dumps(payload)}\n\n"
    except asyncio.CancelledError:
        await pubsub.unsubscribe()
        await pubsub.close()
        raise


@app.get("/api/v1/stream/events")
async def stream_events():
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@app.post("/api/v1/agents/{agent_id}/heartbeat")
async def agent_heartbeat(agent_id: str, status: Dict[str, Any]):
    r = await get_redis()

    status_key = KEY_PATTERNS["agent_status"].format(agent_id=agent_id)
    heartbeat_key = KEY_PATTERNS["agent_heartbeat"].format(agent_id=agent_id)

    enriched = {
        **status,
        "id": agent_id,
        "last_updated": now_iso(),
    }

    await r.set(status_key, json.dumps(enriched))
    await r.set(heartbeat_key, now_iso())

    await r.publish(
        "mobius:agent:updates",
        json.dumps(
            {
                "type": "agents",
                "cycle": "live",
                "timestamp": now_iso(),
                "agents": [enriched],
            }
        ),
    )

    return {"success": True}


@app.post("/api/v1/epicon/publish")
async def publish_epicon(event: Dict[str, Any]):
    r = await get_redis()

    event_id = event.get("id", f"ep-{datetime.now(timezone.utc).timestamp()}")
    timestamp = parse_iso_timestamp(event.get("timestamp"))
    score = timestamp.timestamp()

    await r.zadd(KEY_PATTERNS["epicon_timeline"], {json.dumps(event): score})
    await r.zremrangebyrank(KEY_PATTERNS["epicon_timeline"], 0, -1001)

    for agent in event.get("agent_trace", []):
        await r.lpush(f"mobius:agent:{agent}:events", json.dumps(event))
        await r.ltrim(f"mobius:agent:{agent}:events", 0, 99)

    await r.publish(
        "mobius:epicon:new",
        json.dumps(
            {
                "type": "epicon",
                "cycle": "live",
                "timestamp": now_iso(),
                "item": event,
                "event_id": event_id,
            }
        ),
    )

    return {"success": True, "event_id": event_id}


@app.post("/api/v1/signals/publish")
async def publish_signal(signal: Dict[str, Any]):
    r = await get_redis()

    payload = {
        **signal,
        "received_at": now_iso(),
    }

    await r.lpush(KEY_PATTERNS["signal_stream"], json.dumps(payload))
    await r.ltrim(KEY_PATTERNS["signal_stream"], 0, 999)

    await r.publish(
        "mobius:events",
        json.dumps(
            {
                "type": "integrity",
                "cycle": "live",
                "timestamp": now_iso(),
                "gi": await calculate_gi_from_signals(),
            }
        ),
    )

    return {"success": True}


@app.post("/api/v1/tripwire/trigger")
async def trigger_tripwire(alert: Dict[str, Any]):
    r = await get_redis()

    tripwire_id = alert.get("id", f"tw-{datetime.now(timezone.utc).timestamp()}")
    key = f"mobius:tripwire:active:{tripwire_id}"

    tripwire = {
        **alert,
        "id": tripwire_id,
        "triggered_at": now_iso(),
        "status": "active",
    }

    await r.set(key, json.dumps(tripwire))
    await r.expire(key, 86400)

    current_tripwires = []
    async for tw_key in r.scan_iter(match="mobius:tripwire:active:*"):
        raw = await r.get(tw_key)
        if raw:
            current_tripwires.append(json.loads(raw))

    await r.publish(
        "mobius:tripwire:triggered",
        json.dumps(
            {
                "type": "tripwire",
                "cycle": "live",
                "timestamp": now_iso(),
                "tripwires": current_tripwires,
            }
        ),
    )

    return {"success": True, "tripwire_id": tripwire_id}


@app.get("/health")
async def health_check():
    try:
        r = await get_redis()
        await r.ping()
        return {
            "status": "healthy",
            "redis": "connected",
            "timestamp": now_iso(),
        }
    except Exception as exc:
        return {
            "status": "unhealthy",
            "redis": str(exc),
            "timestamp": now_iso(),
        }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
