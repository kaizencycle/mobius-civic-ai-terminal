from __future__ import annotations

import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

router = APIRouter()

KV_URL = os.getenv("UPSTASH_REDIS_REST_URL", "")
KV_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")
HB_SECRET = os.getenv("MOBIUS_HEARTBEAT_SECRET", "")

HB_KEY = "mobius:heartbeat_at"
HB_CYCLE_KEY = "mobius:heartbeat_cycle"
HB_TTL_S = 3600


async def kv_set(key: str, value: str, ex: int | None = None) -> None:
    if not KV_URL or not KV_TOKEN:
        return
    cmd = ["SET", key, value]
    if ex:
        cmd += ["EX", str(ex)]
    async with httpx.AsyncClient() as client:
        r = await client.post(
            KV_URL,
            headers={"Authorization": f"Bearer {KV_TOKEN}"},
            json=cmd,
            timeout=4.0,
        )
        r.raise_for_status()


async def kv_get(key: str) -> str | None:
    if not KV_URL or not KV_TOKEN:
        return None
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{KV_URL}/get/{key}",
            headers={"Authorization": f"Bearer {KV_TOKEN}"},
            timeout=4.0,
        )
        if r.status_code == 200:
            data = r.json()
            return data.get("result")
    return None


class HeartbeatPayload(BaseModel):
    cycle: str | None = None
    source: str | None = "render-broker"


class HeartbeatResponse(BaseModel):
    heartbeat_at: str
    cycle: str | None
    kv_written: bool


@router.post("/heartbeat", response_model=HeartbeatResponse, status_code=status.HTTP_200_OK)
async def post_heartbeat(
    payload: HeartbeatPayload,
    x_heartbeat_secret: str | None = Header(default=None),
) -> HeartbeatResponse:
    if HB_SECRET and x_heartbeat_secret != HB_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid heartbeat secret")

    now = datetime.now(timezone.utc).isoformat()
    kv_written = True

    try:
        await kv_set(HB_KEY, now, ex=HB_TTL_S)
        if payload.cycle:
            await kv_set(HB_CYCLE_KEY, payload.cycle, ex=HB_TTL_S)
    except Exception:
        kv_written = False

    return HeartbeatResponse(heartbeat_at=now, cycle=payload.cycle, kv_written=kv_written)


@router.get("/heartbeat", response_model=HeartbeatResponse)
async def get_heartbeat() -> HeartbeatResponse:
    hb_at = await kv_get(HB_KEY)
    hb_cycle = await kv_get(HB_CYCLE_KEY)
    return HeartbeatResponse(
        heartbeat_at=hb_at or "",
        cycle=hb_cycle,
        kv_written=hb_at is not None,
    )
