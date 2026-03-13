from datetime import datetime
from typing import List, Literal
from pydantic import BaseModel, Field


AgentStatus = Literal[
    "idle", "listening", "verifying", "routing", "analyzing", "alert"
]
EpiconStatus = Literal["verified", "pending", "contradicted"]
EpiconCategory = Literal["geopolitical", "market", "governance", "infrastructure"]
TripwireSeverity = Literal["low", "medium", "high"]
ServiceHealthStatus = Literal["ok", "warn", "down"]


class AgentStatusItem(BaseModel):
    id: str
    name: str
    role: str
    color: str
    status: AgentStatus
    heartbeat_ok: bool
    last_action: str
    zone: str
    updated_at: datetime


class AgentsStatusResponse(BaseModel):
    cycle: str
    timestamp: datetime
    agents: List[AgentStatusItem]


class EpiconItem(BaseModel):
    id: str
    title: str
    category: EpiconCategory
    status: EpiconStatus
    confidence_tier: int = Field(ge=0, le=4)
    owner_agent: str
    sources: List[str]
    timestamp: str
    summary: str
    trace: List[str]


class EpiconFeedResponse(BaseModel):
    cycle: str
    timestamp: datetime
    items: List[EpiconItem]


class GISnapshot(BaseModel):
    score: float = Field(ge=0, le=1)
    delta: float
    institutional_trust: float = Field(ge=0, le=1)
    info_reliability: float = Field(ge=0, le=1)
    consensus_stability: float = Field(ge=0, le=1)
    weekly: List[float]


class IntegrityCurrentResponse(BaseModel):
    cycle: str
    timestamp: datetime
    gi: GISnapshot


class TripwireItem(BaseModel):
    id: str
    label: str
    severity: TripwireSeverity
    owner: str
    opened_at: str
    action: str


class TripwireResponse(BaseModel):
    cycle: str
    timestamp: datetime
    tripwires: List[TripwireItem]


class SystemHealthServices(BaseModel):
    ledger: ServiceHealthStatus
    lab4: ServiceHealthStatus
    shield: ServiceHealthStatus
    websocket: ServiceHealthStatus


class SystemHealthResponse(BaseModel):
    cycle: str
    timestamp: datetime
    services: SystemHealthServices
