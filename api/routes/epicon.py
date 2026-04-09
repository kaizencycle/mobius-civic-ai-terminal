from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import APIRouter, Query, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter()

LEDGER_URL = os.getenv("CIVIC_LEDGER_API_URL", "")
LEDGER_KEY = os.getenv("CIVIC_LEDGER_API_KEY", "")


def _ledger_headers() -> dict[str, str]:
    h = {"Accept": "application/json"}
    if LEDGER_KEY:
        h["Authorization"] = f"Bearer {LEDGER_KEY}"
    return h


async def _ledger_get(path: str, params: dict | None = None) -> Any:
    if not LEDGER_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CIVIC_LEDGER_API_URL is not configured",
        )
    url = f"{LEDGER_URL.rstrip('/')}{path}"
    async with httpx.AsyncClient(timeout=8.0) as client:
        r = await client.get(url, headers=_ledger_headers(), params=params or {})
        if r.status_code == 404:
            raise HTTPException(status_code=404, detail="Entry not found in ledger")
        r.raise_for_status()
        return r.json()


class EPICONEntry(BaseModel):
    id: str
    cycle: str
    timestamp: str
    agent: str | None = None
    intent: str | None = None
    action: str | None = None
    outcome: str | None = None
    confidence: float | None = None
    integrity_delta: float | None = None
    status: str = "verified"
    source_refs: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    raw: dict | None = None


class EPICONFeedResponse(BaseModel):
    entries: list[EPICONEntry]
    total: int
    page: int
    per_page: int
    has_more: bool


class EPICONStats(BaseModel):
    total_entries: int
    verified: int
    pending: int
    contradicted: int
    agents_active: int
    latest_cycle: str


def _normalise(raw: dict) -> EPICONEntry:
    return EPICONEntry(
        id=str(raw.get("id") or raw.get("entry_id") or ""),
        cycle=str(raw.get("cycle") or raw.get("epicon_cycle") or "—"),
        timestamp=str(raw.get("created_at") or raw.get("timestamp") or ""),
        agent=raw.get("agent") or raw.get("sentinel_id"),
        intent=raw.get("intent") or raw.get("intent_statement"),
        action=raw.get("action") or raw.get("action_taken"),
        outcome=raw.get("outcome"),
        confidence=raw.get("confidence") or raw.get("confidence_score"),
        integrity_delta=raw.get("integrity_delta") or raw.get("gi_delta"),
        status=raw.get("status") or raw.get("verification_status") or "verified",
        source_refs=raw.get("source_refs") or raw.get("sources") or [],
        tags=raw.get("tags") or [],
        raw=raw,
    )


@router.get("/epicon/feed", response_model=EPICONFeedResponse)
async def get_epicon_feed(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    agent: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    cycle: str | None = Query(None),
) -> EPICONFeedResponse:
    params: dict[str, Any] = {"page": page, "per_page": per_page}
    if agent:
        params["agent"] = agent
    if status_filter:
        params["status"] = status_filter
    if cycle:
        params["cycle"] = cycle

    try:
        data = await _ledger_get("/api/v1/entries", params=params)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ledger upstream error: {exc}") from exc

    if isinstance(data, list):
        entries_raw = data
        total = len(data)
    else:
        entries_raw = data.get("entries") or data.get("results") or data.get("data") or []
        total = data.get("total") or data.get("count") or len(entries_raw)

    entries = [_normalise(e) for e in entries_raw]

    return EPICONFeedResponse(
        entries=entries,
        total=total,
        page=page,
        per_page=per_page,
        has_more=(page * per_page) < total,
    )


@router.get("/epicon/entry/{entry_id}", response_model=EPICONEntry)
async def get_epicon_entry(entry_id: str) -> EPICONEntry:
    data = await _ledger_get(f"/api/v1/entries/{entry_id}")
    return _normalise(data)


@router.get("/epicon/stats", response_model=EPICONStats)
async def get_epicon_stats() -> EPICONStats:
    try:
        data = await _ledger_get("/api/v1/entries/stats")
    except Exception:
        feed = await _ledger_get("/api/v1/entries", params={"per_page": 1})
        total = feed.get("total") or feed.get("count") or 0
        return EPICONStats(
            total_entries=total,
            verified=0,
            pending=0,
            contradicted=0,
            agents_active=0,
            latest_cycle="—",
        )

    return EPICONStats(
        total_entries=data.get("total") or 0,
        verified=data.get("verified") or 0,
        pending=data.get("pending") or 0,
        contradicted=data.get("contradicted") or 0,
        agents_active=data.get("agents_active") or 0,
        latest_cycle=data.get("latest_cycle") or "—",
    )
