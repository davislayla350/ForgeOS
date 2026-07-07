"""Verification of live WebSocket streaming.

Uses starlette's TestClient which supports websocket_connect() so no external
server is needed.
"""

from __future__ import annotations

import asyncio
import json

from fastapi.testclient import TestClient

from app.agents.tools import default_tool_registry
from app.config import get_settings
from app.main import app
from app.memory.store import RunMemory
from app.services.company_orchestrator import CompanyOrchestrator
from app.services.live_run_registry import LiveRunRegistry
from app.services.qwen_client import QwenClient

passed = 0


def check(label: str, cond: bool) -> None:
    global passed
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    assert cond, f"FAILED: {label}"
    passed += 1


settings = get_settings()

# -------------------------------------------------------------------
# 1. Legacy REST endpoint still works (compat requirement).
# -------------------------------------------------------------------
with TestClient(app) as client:
    r = client.post("/company/launch", json={"project": "Build a budgeting app"})
    check("REST /company/launch still returns 200", r.status_code == 200)
    data = r.json()
    check("REST response still has all expected fields",
          all(k in data for k in ("plan", "tasks", "agents", "messages", "reviews", "events")))
    check("REST response includes ordered events",
          len(data["events"]) > 10)

# -------------------------------------------------------------------
# 2. /company/start returns a run_id + ws_url.
# -------------------------------------------------------------------
with TestClient(app) as client:
    r = client.post("/company/start", json={"project": "Build a budgeting app"})
    check("/company/start returns 200", r.status_code == 200)
    start_data = r.json()
    check("start response has run_id and ws_url",
          "run_id" in start_data and "ws_url" in start_data)
    check("ws_url matches expected pattern",
          start_data["ws_url"] == f"/company/stream/{start_data['run_id']}")

# -------------------------------------------------------------------
# 3. WebSocket stream delivers a hello then events in order.
# -------------------------------------------------------------------
with TestClient(app) as client:
    r = client.post("/company/start", json={"project": "Build a budgeting app"})
    run_id = r.json()["run_id"]
    events: list[dict] = []
    hello = None
    with client.websocket_connect(f"/company/stream/{run_id}") as ws:
        # First message is always "hello".
        first = ws.receive_json()
        hello = first
        # Drain the rest until the run finishes.
        while True:
            try:
                msg = ws.receive_json()
            except Exception:
                break
            events.append(msg)
            if msg.get("type") == "run_completed":
                # Server will close after this; break out.
                break

check("WebSocket first message is 'hello'", hello and hello.get("type") == "hello")
check("hello includes run_id", hello.get("run_id") == run_id)
check("hello includes resumed_from", "resumed_from" in hello)
check("WebSocket delivered a stream of events", len(events) > 5)
check("WebSocket stream ends with run_completed",
      events[-1]["type"] == "run_completed")
check("WebSocket seq numbers strictly increase",
      all(events[i]["seq"] < events[i+1]["seq"] for i in range(len(events)-1)))

# -------------------------------------------------------------------
# 4. Resume: reconnect with ?since=<seq> receives only events after that.
# -------------------------------------------------------------------
with TestClient(app) as client:
    r = client.post("/company/start", json={"project": "Build a budgeting app"})
    run_id = r.json()["run_id"]
    # Wait for the run to complete so the buffer is stable.
    all_events: list[dict] = []
    with client.websocket_connect(f"/company/stream/{run_id}") as ws:
        ws.receive_json()  # hello
        while True:
            try:
                msg = ws.receive_json()
            except Exception:
                break
            all_events.append(msg)
            if msg.get("type") == "run_completed":
                break

    total = len(all_events)
    # Now "reconnect" and ask for events since a midpoint.
    midpoint_seq = all_events[total // 2]["seq"]
    resumed_events: list[dict] = []
    with client.websocket_connect(f"/company/stream/{run_id}?since={midpoint_seq}") as ws:
        hello2 = ws.receive_json()
        check("resume hello reports the resumed_from seq",
              hello2.get("resumed_from") == midpoint_seq)
        while True:
            try:
                msg = ws.receive_json()
            except Exception:
                break
            resumed_events.append(msg)
            if msg.get("type") == "run_completed":
                break

    check("resume returns fewer events than the full stream",
          0 < len(resumed_events) < total)
    check("resume returns only events with seq > since",
          all(e["seq"] > midpoint_seq for e in resumed_events))
    check("resume still ends with run_completed",
          resumed_events[-1]["type"] == "run_completed")

# -------------------------------------------------------------------
# 5. Unknown run_id yields an error frame and closes cleanly.
# -------------------------------------------------------------------
with TestClient(app) as client:
    saw_error = False
    try:
        with client.websocket_connect("/company/stream/does-not-exist") as ws:
            msg = ws.receive_json()
            if msg.get("type") == "error":
                saw_error = True
    except Exception:
        # Server may close immediately; test client raises on next recv.
        pass
    check("unknown run_id yields an error message", saw_error)

# -------------------------------------------------------------------
# 6. Registry invariants: bounded queue prevents slow subscriber stalls.
# -------------------------------------------------------------------
async def registry_stress() -> None:
    llm = QwenClient(settings)
    memory = RunMemory()
    tools = default_tool_registry()
    orch = CompanyOrchestrator(llm=llm, memory=memory, tools=tools)
    reg = LiveRunRegistry(orchestrator_factory=lambda: orch)
    rid = await reg.start("stress test")

    # Multiple concurrent subscribers to the same run.
    async def collect():
        collected = []
        async for ev in reg.subscribe(rid):
            collected.append(ev)
        return collected

    results = await asyncio.gather(collect(), collect(), collect())
    lens = [len(r) for r in results]
    print(f"    concurrent subs collected: {lens}")
    check("all concurrent subscribers see the same event count",
          len(set(lens)) == 1)
    check("concurrent subscribers see run_completed",
          all(r[-1]["type"] == "run_completed" for r in results))
    await reg.shutdown()

asyncio.run(registry_stress())

# -------------------------------------------------------------------
# 7. Registry evicts completed runs older than ttl.
# -------------------------------------------------------------------
async def eviction_test() -> None:
    orch = CompanyOrchestrator(
        QwenClient(settings), RunMemory(), default_tool_registry()
    )
    # Very short TTL for the test.
    reg = LiveRunRegistry(orchestrator_factory=lambda: orch, ttl_seconds=0)
    rid = await reg.start("eviction test")
    # Drain the stream to completion.
    async for _ in reg.subscribe(rid):
        pass
    # Give the completion bookkeeping a tick.
    await asyncio.sleep(0.05)
    count_before = await reg.count()
    evicted = await reg.prune()
    count_after = await reg.count()
    print(f"    before={count_before} evicted={evicted} after={count_after}")
    check("eviction removes completed run",
          count_before == 1 and evicted == 1 and count_after == 0)

asyncio.run(eviction_test())

print(f"\nALL {passed} CHECKS PASSED")
