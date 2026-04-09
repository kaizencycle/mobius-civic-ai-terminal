from datetime import datetime, timezone
from typing import Optional, AsyncGenerator
import asyncio
import json
import random

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.schemas import (
    AgentsStatusResponse,
    EpiconFeedResponse,
    IntegrityCurrentResponse,
    TripwireResponse,
    SystemHealthResponse,
)
from api.routes.heartbeat import router as heartbeat_router
from api.routes.epicon import router as epicon_router
from api.routes.stream import router as stream_router, start_journal_watcher

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for Mobius Civic AI Terminal",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(heartbeat_router, prefix="/api/v1/system")
app.include_router(epicon_router, prefix="/api/v1")
app.include_router(stream_router, prefix="/api/v1")


@app.on_event("startup")
async def on_startup() -> None:
    asyncio.create_task(start_journal_watcher())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def build_mock_agents():
    return [
        {
            "id": "atlas",
            "name": "ATLAS",
            "role": "Sentinel / Monitoring",
            "color": "bg-sky-500",
            "status": "analyzing",
            "heartbeat_ok": True,
            "last_action": "Scanning substrate integrity",
            "zone": "Sentinel",
            "updated_at": now_utc(),
        },
        {
            "id": "zeus",
            "name": "ZEUS",
            "role": "Verification Engine",
            "color": "bg-amber-500",
            "status": "verifying",
            "heartbeat_ok": True,
            "last_action": "Cross-checking source chain",
            "zone": "Sentinel",
            "updated_at": now_utc(),
        },
        {
            "id": "hermes",
            "name": "HERMES",
            "role": "Routing / Signal Flow",
            "color": "bg-rose-500",
            "status": "routing",
            "heartbeat_ok": True,
            "last_action": "Routing geopolitical signal",
            "zone": "Steward",
            "updated_at": now_utc(),
        },
        {
            "id": "echo",
            "name": "ECHO",
            "role": "Memory / Ledger Intake",
            "color": "bg-slate-400",
            "status": "listening",
            "heartbeat_ok": True,
            "last_action": "Recording EPICON snapshot",
            "zone": "Steward",
            "updated_at": now_utc(),
        },
        {
            "id": "aurea",
            "name": "AUREA",
            "role": "Architect / Strategy",
            "color": "bg-orange-500",
            "status": "analyzing",
            "heartbeat_ok": True,
            "last_action": "Drafting civic synthesis",
            "zone": "Architect",
            "updated_at": now_utc(),
        },
        {
            "id": "jade",
            "name": "JADE",
            "role": "Annotation / Morale",
            "color": "bg-emerald-500",
            "status": "idle",
            "heartbeat_ok": True,
            "last_action": "Awaiting next reflection input",
            "zone": "Architect",
            "updated_at": now_utc(),
        },
        {
            "id": "eve",
            "name": "EVE",
            "role": "Observer / Ethics",
            "color": "bg-fuchsia-500",
            "status": "idle",
            "heartbeat_ok": True,
            "last_action": "Observing cross-agent output",
            "zone": "Observer",
            "updated_at": now_utc(),
        },
        {
            "id": "daedalus",
            "name": "DAEDALUS",
            "role": "Builder / Research",
            "color": "bg-yellow-700",
            "status": "analyzing",
            "heartbeat_ok": True,
            "last_action": "Compiling terminal module sketch",
            "zone": "Architect",
            "updated_at": now_utc(),
        },
    ]


def build_mock_epicon():
    return [
        {
            "id": "EPICON-C249-004",
            "title": "Regional escalation signal updated",
            "category": "geopolitical",
            "status": "verified",
            "confidence_tier": 3,
            "owner_agent": "ZEUS",
            "sources": ["Reuters", "AP", "Official advisory"],
            "timestamp": "2026-03-13 07:41 ET",
            "summary": (
                "Signal upgraded after multi-source verification. "
                "Event remains active but below alliance-trigger threshold."
            ),
            "trace": [
                "ECHO captured initial signal",
                "HERMES routed for verification",
                "ZEUS confirmed with 3 source alignment",
                "ATLAS updated system integrity context",
            ],
        },
        {
            "id": "EPICON-C249-003",
            "title": "Mobius Terminal V1 layout drafted",
            "category": "governance",
            "status": "verified",
            "confidence_tier": 4,
            "owner_agent": "AUREA",
            "sources": ["Internal design memo"],
            "timestamp": "2026-03-13 07:28 ET",
            "summary": (
                "Initial civic terminal layout finalized for operator view with "
                "command canvas, right inspector, and agent cortex."
            ),
            "trace": [
                "AUREA created layout model",
                "DAEDALUS prepared implementation notes",
                "ECHO archived design record",
            ],
        },
        {
            "id": "EPICON-C249-002",
            "title": "Tripwire divergence on conflict narratives",
            "category": "infrastructure",
            "status": "pending",
            "confidence_tier": 2,
            "owner_agent": "ATLAS",
            "sources": ["Open web", "Regional reporting"],
            "timestamp": "2026-03-13 07:16 ET",
            "summary": (
                "Narrative velocity exceeded verification speed. "
                "System placed event into caution state pending source reconciliation."
            ),
            "trace": [
                "ATLAS flagged divergence",
                "ZEUS opened verification lane",
                "HERMES throttled propagation",
            ],
        },
        {
            "id": "EPICON-C249-001",
            "title": "Market sweep awaiting fresh inputs",
            "category": "market",
            "status": "contradicted",
            "confidence_tier": 1,
            "owner_agent": "HERMES",
            "sources": ["Secondary feed"],
            "timestamp": "2026-03-13 06:58 ET",
            "summary": (
                "Pre-open market interpretation was rejected after source inconsistency. "
                "Feed requires refresh before publication."
            ),
            "trace": [
                "HERMES routed market signal",
                "ZEUS found inconsistency",
                "ATLAS suppressed downstream amplification",
            ],
        },
    ]


def build_mock_integrity():
    return {
        "score": 0.94,
        "delta": 0.01,
        "institutional_trust": 0.88,
        "info_reliability": 0.91,
        "consensus_stability": 0.86,
        "weekly": [0.89, 0.90, 0.90, 0.92, 0.91, 0.93, 0.94],
    }


def build_mock_tripwires():
    return [
        {
            "id": "TW-114",
            "label": "Information Surge",
            "severity": "medium",
            "owner": "ATLAS",
            "opened_at": "07:16 ET",
            "action": "Throttled propagation pending ZEUS review",
        },
        {
            "id": "TW-115",
            "label": "Source Divergence",
            "severity": "high",
            "owner": "ZEUS",
            "opened_at": "07:21 ET",
            "action": "Awaiting primary-source confirmation",
        },
    ]


# ── REST endpoints ───────────────────────────────────────────


@app.get("/", tags=["meta"])
def root():
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
    }


@app.get(
    "/api/v1/agents/status",
    response_model=AgentsStatusResponse,
    tags=["agents"],
)
def get_agents_status():
    return {
        "cycle": settings.default_cycle,
        "timestamp": now_utc(),
        "agents": build_mock_agents(),
    }


@app.get(
    "/api/v1/integrity/current",
    response_model=IntegrityCurrentResponse,
    tags=["integrity"],
)
def get_integrity_current():
    return {
        "cycle": settings.default_cycle,
        "timestamp": now_utc(),
        "gi": build_mock_integrity(),
    }


@app.get(
    "/api/v1/tripwires/active",
    response_model=TripwireResponse,
    tags=["tripwires"],
)
def get_tripwires_active():
    return {
        "cycle": settings.default_cycle,
        "timestamp": now_utc(),
        "tripwires": build_mock_tripwires(),
    }


@app.get(
    "/api/v1/system/health",
    response_model=SystemHealthResponse,
    tags=["system"],
)
def get_system_health():
    return {
        "cycle": settings.default_cycle,
        "timestamp": now_utc(),
        "services": {
            "ledger": "ok",
            "lab4": "ok",
            "shield": "ok",
            "websocket": "ok",
        },
    }


# ── SSE stream ───────────────────────────────────────────────


def build_stream_event(event_type: str):
    if event_type == "heartbeat":
        return {
            "type": "heartbeat",
            "cycle": settings.default_cycle,
            "timestamp": now_utc().isoformat(),
            "message": "Mobius stream heartbeat",
        }

    if event_type == "agents":
        return {
            "type": "agents",
            "cycle": settings.default_cycle,
            "timestamp": now_utc().isoformat(),
            "agents": build_mock_agents(),
        }

    if event_type == "epicon":
        item = random.choice(build_mock_epicon())
        return {
            "type": "epicon",
            "cycle": settings.default_cycle,
            "timestamp": now_utc().isoformat(),
            "item": item,
        }

    if event_type == "integrity":
        gi = build_mock_integrity()
        gi["score"] = round(
            max(0.0, min(1.0, gi["score"] + random.choice([-0.01, 0.0, 0.01]))),
            2,
        )
        gi["delta"] = round(random.choice([-0.01, 0.0, 0.01]), 2)
        return {
            "type": "integrity",
            "cycle": settings.default_cycle,
            "timestamp": now_utc().isoformat(),
            "gi": gi,
        }

    if event_type == "tripwire":
        return {
            "type": "tripwire",
            "cycle": settings.default_cycle,
            "timestamp": now_utc().isoformat(),
            "tripwires": build_mock_tripwires(),
        }

    return {
        "type": "unknown",
        "cycle": settings.default_cycle,
        "timestamp": now_utc().isoformat(),
    }


@app.get("/api/v1/stream/events", tags=["stream"])
async def stream_events():
    async def event_generator() -> AsyncGenerator[dict, None]:
        event_types = ["heartbeat", "agents", "epicon", "integrity", "tripwire"]
        idx = 0

        while True:
            event_type = event_types[idx % len(event_types)]
            payload = build_stream_event(event_type)

            yield {
                "event": event_type,
                "data": json.dumps(payload, default=str),
            }

            idx += 1
            await asyncio.sleep(3)

    return EventSourceResponse(event_generator())
