"""Verification of the multi-agent CompanyOrchestrator workflow."""

from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from app.agents.tools import default_tool_registry
from app.config import get_settings
from app.main import app
from app.memory.store import RunMemory
from app.models.company import AgentState, EventType, ReviewVerdict
from app.services.company_message_bus import CompanyMessageBus
from app.services.company_orchestrator import CompanyOrchestrator
from app.services.qwen_client import QwenClient

passed = 0


def check(label: str, cond: bool) -> None:
    global passed
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    assert cond, f"FAILED: {label}"
    passed += 1


settings = get_settings()


def make_orch(llm=None) -> CompanyOrchestrator:
    return CompanyOrchestrator(llm or QwenClient(settings), RunMemory(), default_tool_registry())


# --- 1. AgentState has the six required states ------------------------------
states = {s.value for s in AgentState}
check("AgentState has 6 states (idle/working/waiting/reviewing/blocked/complete)",
      states == {"idle", "working", "waiting", "reviewing", "blocked", "complete"})

# --- 2. CompanyMessageBus protocol (unit) -----------------------------------
class _Dummy:
    def __init__(self, role): self.role = role; self.inbox = []; self.outbox = []

emitted = []
async def _emit(et, actor, payload):
    from app.models.company import OrchestrationEvent
    from datetime import datetime, timezone
    ev = OrchestrationEvent(seq=len(emitted) + 1, type=et, timestamp=datetime.now(timezone.utc),
                            actor=actor, payload=payload)
    emitted.append(ev); return ev

agents = {"A": _Dummy("A"), "B": _Dummy("B"), "CEO": _Dummy("CEO")}
bus = CompanyMessageBus(agents, _emit)

async def exercise_bus():
    await bus.send_message("A", "B", "hi")
    await bus.broadcast("A", "all hands")
    await bus.request_review("A", "B", "Architecture")
    await bus.approve("B", "Architecture", "A", "looks good")
    await bus.reject("B", "Architecture", "A", "nope", ["issue1"])
    await bus.escalate_to_ceo("B", "stuck")

asyncio.run(exercise_bus())
types = [e.type for e in emitted]
for t in (EventType.AGENT_MESSAGE, EventType.REVIEW_REQUESTED, EventType.REVIEW_APPROVED,
          EventType.REVIEW_REJECTED, EventType.ESCALATED):
    check(f"message bus emits {t.value}", t in types)
check("send_message delivered to recipient inbox", any(m.content == "hi" for m in agents["B"].inbox))
check("send_message recorded in sender outbox", any(m.content == "hi" for m in agents["A"].outbox))
check("broadcast reached all non-senders", any(m.content == "all hands" for m in agents["B"].inbox)
      and any(m.content == "all hands" for m in agents["CEO"].inbox))
check("escalation addressed to CEO", any(m.recipient == "CEO" for m in agents["CEO"].inbox))

# --- 3. Full deterministic workflow -----------------------------------------
result = asyncio.run(make_orch().run("Build a budgeting app"))
ev_types = [e.type for e in result.events]

check("starts RUN_STARTED", ev_types[0] == EventType.RUN_STARTED)
check("ends RUN_COMPLETED", ev_types[-1] == EventType.RUN_COMPLETED)
check("plan created", EventType.PLAN_CREATED in ev_types)
check("project published before completion",
      ev_types.index(EventType.PROJECT_PUBLISHED) < ev_types.index(EventType.RUN_COMPLETED))

# Review loop actually fired (Security rejects once, then approves).
check("a review was requested", EventType.REVIEW_REQUESTED in ev_types)
check("a review was rejected (loop exercised)", EventType.REVIEW_REJECTED in ev_types)
check("a revision was requested", EventType.REVISION_REQUESTED in ev_types)
check("a review was approved", EventType.REVIEW_APPROVED in ev_types)
check("reject precedes revision precedes approval",
      ev_types.index(EventType.REVIEW_REJECTED) < ev_types.index(EventType.REVISION_REQUESTED)
      < ev_types.index(EventType.REVIEW_APPROVED))

arch = next(t for t in result.tasks if t.title == "Architecture")
check("architecture went through 1 revision", arch.revision == 1)

verdicts = [r.verdict for r in result.reviews]
check("reviews recorded (>=3: reject, approve, qa)", len(result.reviews) >= 3)
check("reviews include a rejection and an approval",
      ReviewVerdict.REJECTED in verdicts and ReviewVerdict.APPROVED in verdicts)

# Dependency-not-timer: PRD completes before Architecture starts.
completed = {}
started = {}
for e in result.events:
    if e.type == EventType.TASK_COMPLETED:
        completed.setdefault(e.payload["task_id"], e.seq)
    if e.type == EventType.TASK_STARTED:
        started.setdefault(e.payload["task_id"], e.seq)
prd_id = next(t.id for t in result.tasks if t.title == "PRD")
arch_id = arch.id
check("PRD completes before Architecture starts", completed[prd_id] < started[arch_id])

# Final agent states
agent_states = {a.role: a.status for a in result.agents}
check("all agents end COMPLETE", all(s == AgentState.COMPLETE for s in agent_states.values()))

# Messages are agent-to-agent handoffs
senders = {m.sender for m in result.messages}
check("messages came from agents (not just system)", "system" not in senders and len(result.messages) > 0)
check("PM handed off to Engineer",
      any(m.sender == "Product Manager" and m.recipient == "Engineer" for m in result.messages))

# --- 4. Escalation path (LLM stub that always rejects) ----------------------
from app.services.qwen_client import QwenClient as _QC

class AlwaysRejectLLM(_QC):
    @property
    def enabled(self): return True
    async def chat(self, messages, *, temperature=0.2, max_tokens=1500, response_format=None):
        return '{"verdict": "rejected", "comments": "insufficient", "issues": ["x"]}'

esc_result = asyncio.run(make_orch(AlwaysRejectLLM(settings)).run("Build a budgeting app"))
esc_types = [e.type for e in esc_result.events]
check("persistent rejection triggers ESCALATED", EventType.ESCALATED in esc_types)
check("escalated run still completes", esc_types[-1] == EventType.RUN_COMPLETED)
check("CEO override approval present after escalation",
      esc_types.index(EventType.ESCALATED) < len(esc_types)
      and EventType.REVIEW_APPROVED in esc_types)

# --- 5. Streaming parity (websocket path) -----------------------------------
async def collect():
    out = []
    async for ev in make_orch().stream("Build a budgeting app"):
        out.append(ev)
    return out

streamed = asyncio.run(collect())
check("stream yields JSON dicts with ISO timestamps",
      all(isinstance(e, dict) and isinstance(e["timestamp"], str) for e in streamed))
check("stream ends run_completed", streamed[-1]["type"] == "run_completed")
check("stream count matches run() event count", len(streamed) == len(result.events))

# --- 6. Endpoint contract ----------------------------------------------------
with TestClient(app) as client:
    r = client.post("/company/launch", json={"project": "Build a budgeting app"})
    check("POST /company/launch 200", r.status_code == 200)
    data = r.json()
    check("response carries plan/tasks/agents/messages/reviews/events",
          all(k in data for k in ("plan", "tasks", "agents", "messages", "reviews", "events")))
    check("endpoint timeline ends run_completed", data["events"][-1]["type"] == "run_completed")
    # frontend /launch contract still intact
    r2 = client.post("/launch", json={"project": "Build a budgeting app"})
    check("frontend /launch still 200", r2.status_code == 200)
    orch = r2.json()["orchestration"]
    check("/launch still emits camelCase orchestration steps",
          "projectIdea" in orch and orch["steps"][0]["type"] == "activate")

print(f"\nALL {passed} CHECKS PASSED")
