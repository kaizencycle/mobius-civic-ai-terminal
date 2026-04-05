import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests


class MobiusAgent:
    """SDK for publishing agent data to Mobius Redis Bridge."""

    def __init__(self, agent_id: str, agent_name: str, api_base: Optional[str] = None):
        self.agent_id = agent_id
        self.agent_name = agent_name
        base = api_base or os.getenv("MOBIUS_API_BASE", "http://localhost:8000/api/v1")
        self.api_base = base.rstrip("/")

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def heartbeat(
        self,
        status: str = "active",
        confidence: float = 0.5,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        payload = {
            "name": self.agent_name,
            "status": status,
            "confidence": confidence,
            "metadata": metadata or {},
        }

        try:
            response = requests.post(
                f"{self.api_base}/agents/{self.agent_id}/heartbeat",
                json=payload,
                timeout=5,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            print(f"[{self.agent_name}] Heartbeat failed: {exc}")
            return None

    def publish_epicon(
        self,
        content: Dict[str, Any],
        source: str,
        confidence: float = 0.5,
    ) -> Optional[Dict[str, Any]]:
        event = {
            "id": f"ep-{self.agent_id}-{datetime.now(timezone.utc).timestamp()}",
            "timestamp": self._now_iso(),
            "source": source,
            "agent_trace": [self.agent_name],
            "confidence_score": confidence,
            "content": content,
            "status": "pending",
        }

        try:
            response = requests.post(
                f"{self.api_base}/epicon/publish",
                json=event,
                timeout=5,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            print(f"[{self.agent_name}] EPICON publish failed: {exc}")
            return None

    def publish_signal(self, signal_type: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        signal = {
            "type": signal_type,
            "agent": self.agent_name,
            "timestamp": self._now_iso(),
            **data,
        }

        try:
            response = requests.post(
                f"{self.api_base}/signals/publish",
                json=signal,
                timeout=5,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            print(f"[{self.agent_name}] Signal publish failed: {exc}")
            return None

    def trigger_tripwire(
        self,
        level: str,
        message: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        alert = {
            "level": level,
            "message": message,
            "source_agent": self.agent_name,
            "metadata": metadata or {},
        }

        try:
            response = requests.post(
                f"{self.api_base}/tripwire/trigger",
                json=alert,
                timeout=5,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            print(f"[{self.agent_name}] Tripwire trigger failed: {exc}")
            return None
