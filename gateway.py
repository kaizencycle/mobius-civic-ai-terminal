import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Mobius Terminal Gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://mobius-civic-ai-terminal.vercel.app", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SERVICES = {
    "thought_broker": os.getenv("THOUGHT_BROKER_URL", "http://localhost:4005"),
    "civic_ledger": os.getenv("CIVIC_LEDGER_URL", "http://localhost:3000"),
    "gic_indexer": os.getenv("GIC_INDEXER_URL", "http://localhost:4002"),
    "mic_wallet": os.getenv("MIC_WALLET_URL", "http://localhost:3002"),
    "identity": os.getenv("IDENTITY_URL", "http://localhost:3003"),
    "oaa_api": os.getenv("OAA_API_URL", "http://localhost:3004"),
    "lab4": os.getenv("LAB4_URL", "http://localhost:3005"),
    "lab6": os.getenv("LAB6_URL", "http://localhost:3006"),
    "lab7": os.getenv("LAB7_URL", "http://localhost:3007"),
}

http_client = httpx.AsyncClient(timeout=10.0)


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await http_client.aclose()


@app.get("/api/v1/agents/status")
async def get_all_agents() -> dict[str, Any]:
    try:
        broker_resp = await http_client.get(f"{SERVICES['thought_broker']}/sentinels/status")
        broker_data = broker_resp.json() if broker_resp.status_code == 200 else {}

        ledger_resp = await http_client.get(f"{SERVICES['civic_ledger']}/agents/activity")
        ledger_data = ledger_resp.json() if ledger_resp.status_code == 200 else {}

        agents = []
        for agent in broker_data.get("sentinels", []):
            agent_id = agent.get("id")
            ledger_activity = ledger_data.get("agents", {}).get(agent_id, {})

            agents.append(
                {
                    "id": agent_id,
                    "name": agent.get("name"),
                    "status": agent.get("status", "unknown"),
                    "confidence": agent.get("confidence", 0.5),
                    "last_seen": agent.get("last_seen"),
                    "consensus_participation": agent.get("vote_participation", 0),
                    "recent_epicons": ledger_activity.get("recent_events", 0),
                    "provider": agent.get("provider"),
                }
            )

        return {"success": True, "data": agents, "source": "aggregated"}

    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Service aggregation failed: {exc}") from exc


@app.get("/api/v1/agents/{agent_id}")
async def get_agent_detail(agent_id: str) -> dict[str, Any]:
    try:
        responses = await asyncio.gather(
            http_client.get(f"{SERVICES['thought_broker']}/sentinels/{agent_id}"),
            http_client.get(f"{SERVICES['civic_ledger']}/agents/{agent_id}/history"),
            http_client.get(f"{SERVICES['gic_indexer']}/agents/{agent_id}/contributions"),
            return_exceptions=True,
        )

        broker_data = (
            responses[0].json()
            if isinstance(responses[0], httpx.Response) and responses[0].status_code == 200
            else {}
        )
        ledger_data = (
            responses[1].json()
            if isinstance(responses[1], httpx.Response) and responses[1].status_code == 200
            else {}
        )
        gic_data = (
            responses[2].json()
            if isinstance(responses[2], httpx.Response) and responses[2].status_code == 200
            else {}
        )

        return {
            "success": True,
            "data": {
                "profile": broker_data,
                "activity": ledger_data,
                "contributions": gic_data,
            },
        }

    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/v1/epicon/feed")
async def get_epicon_feed(limit: int = 50, agent: Optional[str] = None) -> dict[str, Any]:
    try:
        params: dict[str, Any] = {"limit": limit}
        if agent:
            params["agent"] = agent

        resp = await http_client.get(f"{SERVICES['civic_ledger']}/epicon/feed", params=params)
        return resp.json()

    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/v1/integrity/current")
async def get_integrity() -> dict[str, Any]:
    try:
        resp = await http_client.get(f"{SERVICES['gic_indexer']}/gi/current")
        return resp.json()

    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/v1/mic/wallet/{user_id}")
async def get_wallet(user_id: str) -> dict[str, Any]:
    try:
        resp = await http_client.get(f"{SERVICES['mic_wallet']}/wallet/{user_id}")
        return resp.json()

    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/v1/labs/{lab_id}/status")
async def get_lab_status(lab_id: str) -> dict[str, Any]:
    lab_urls = {
        "oaa": SERVICES["lab7"],
        "reflections": SERVICES["lab4"],
        "shield": SERVICES["lab6"],
    }

    if lab_id not in lab_urls:
        raise HTTPException(status_code=404, detail=f"Lab {lab_id} not found")

    try:
        resp = await http_client.get(f"{lab_urls[lab_id]}/health")
        return {
            "success": True,
            "lab": lab_id,
            "status": "healthy" if resp.status_code == 200 else "degraded",
            "details": resp.json() if resp.status_code == 200 else {},
        }

    except Exception as exc:  # noqa: BLE001
        return {
            "success": False,
            "lab": lab_id,
            "status": "offline",
            "error": str(exc),
        }


async def aggregated_event_stream() -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "GET",
            f"{SERVICES['thought_broker']}/stream/events",
            timeout=None,
        ) as broker_stream:
            yield (
                "data: "
                + json.dumps({"type": "connected", "services": list(SERVICES.keys())})
                + "\n\n"
            )

            async for line in broker_stream.aiter_lines():
                if line.startswith("data: "):
                    try:
                        event = json.loads(line[6:])
                        yield f"data: {json.dumps(event)}\\n\\n"
                    except json.JSONDecodeError:
                        yield f"{line}\\n\\n"


@app.get("/api/v1/stream/events")
async def stream_events() -> StreamingResponse:
    return StreamingResponse(
        aggregated_event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


class IntentRequest(BaseModel):
    agent_id: str
    intent: str
    spec: str
    expected_outcome: str
    divergence_tolerance: float = 0.1


@app.post("/api/v1/intent/submit")
async def submit_intent(request: IntentRequest) -> dict[str, Any]:
    try:
        resp = await http_client.post(
            f"{SERVICES['oaa_api']}/intent",
            json=request.model_dump(),
        )
        return resp.json()

    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/health")
async def health_check() -> dict[str, Any]:
    health: dict[str, str] = {}

    for name, url in SERVICES.items():
        try:
            resp = await http_client.get(f"{url}/health", timeout=2.0)
            health[name] = "healthy" if resp.status_code == 200 else "degraded"
        except Exception:  # noqa: BLE001
            health[name] = "unreachable"

    return {
        "status": "healthy" if any(v == "healthy" for v in health.values()) else "degraded",
        "services": health,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/system/discovery")
async def discover_services() -> dict[str, Any]:
    return {
        "services": {
            name: {
                "url": url,
                "endpoints": [
                    "/health",
                    "/api/v1/agents/status",
                    "/api/v1/epicon/feed",
                    "/api/v1/integrity/current",
                    "/api/v1/stream/events",
                ]
                if name == "thought_broker"
                else ["/health"],
            }
            for name, url in SERVICES.items()
        }
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
