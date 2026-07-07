"""Standalone verification of the refactored multi-agent backend."""

from __future__ import annotations

import asyncio
import json

from fastapi.testclient import TestClient

import app.agents  # registers all agents
from app.agents import (
    BaseAgent,
    CEOAgent,
    DevOpsAgent,
    EngineerAgent,
    ProductManagerAgent,
    QAAgent,
    SecurityAgent,
)
from app.agents.registry import (
    AGENT_REGISTRY,
    build_roster,
    get_ordered_agent_classes,
    register_agent,
)
from app.agents.tools import ToolBelt, default_tool_registry
from app.config import get_settings
from app.main import app
from app.memory.store import RunContext, ScopedMemory
from app.models.domain import AgentResponse, DeliverableSpec
from app.services.orchestrator import Orchestrator
from app.services.qwen_client import QwenClient

passed = 0


def check(label: str, cond: bool) -> None:
    global passed
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    assert cond, f"FAILED: {label}"
    passed += 1


# --- 1. Inheritance + registry ----------------------------------------------
all_agents = [CEOAgent, ProductManagerAgent, EngineerAgent, SecurityAgent, QAAgent, DevOpsAgent]
check("all six agents subclass BaseAgent", all(issubclass(a, BaseAgent) for a in all_agents))
check("six agents registered", len(AGENT_REGISTRY) == 6)
order = [c.role for c in get_ordered_agent_classes()]
check("registry order is CEO->PM->Eng->Sec->QA->DevOps",
      order == ["CEO", "Product Manager", "Engineer", "Security", "QA", "DevOps"])
check("each agent defines the required attrs",
      all(all(getattr(a, attr, None) not in (None, "") for attr in
              ("role", "system_prompt", "available_tools", "memory_scope")) for a in all_agents))
check("generate_response defined once on BaseAgent",
      all("generate_response" not in a.__dict__ for a in all_agents)
      and "generate_response" in BaseAgent.__dict__)
check("memory_scopes are distinct",
      len({a.memory_scope for a in all_agents}) == 6)

# --- 2. Endpoint smoke test (deterministic, no key) -------------------------
with TestClient(app) as client:
    r = client.post("/launch", json={"project": "Build a budgeting app"})
    check("POST /launch 200", r.status_code == 200)
    data = r.json()
    check("plan source deterministic", data["plan"]["plan_source"] == "deterministic")
    check("plan has 6 deliverables", len(data["plan"]["deliverables"]) == 6)
    check("plan has 6 team members", len(data["plan"]["team"]) == 6)
    check("response includes 6 agent runs", len(data["agents"]) == 6)
    check("CEO ran first", data["agents"][0]["role"] == "CEO")
    check("agents produced artifacts with content",
          all("content" in art and art["content"]
              for a in data["agents"] for art in a["artifacts"]))
    orch = data["orchestration"]
    check("orchestration camelCase aliases", "projectIdea" in orch and "durationMs" in orch)
    check("6 employees in payload", len(orch["employees"]) == 6)
    steps = orch["steps"]
    check("first step activates CEO id=1", steps[0]["type"] == "activate" and steps[0]["employeeId"] == "1")
    check("last step complete", steps[-1]["type"] == "complete")
    deliverable_titles = {s["title"] for s in steps if s["type"] == "deliverable"}
    check("orchestration deliverables match the 6 produced",
          deliverable_titles == {"PRD", "Architecture", "API Spec", "Security Review", "Test Plan", "Deployment Plan"})

settings = get_settings()
registry = default_tool_registry()

# --- 3. ToolBelt enforces the capability boundary ---------------------------
pm_belt = ToolBelt(registry, ProductManagerAgent.available_tools)
try:
    pm_belt.use("threat_modeler", project="x")  # not in PM's whitelist
    check("ToolBelt blocks non-whitelisted tool", False)
except PermissionError:
    check("ToolBelt blocks non-whitelisted tool", True)
check("ToolBelt allows whitelisted tool", bool(pm_belt.use("document_writer", project="x")))

# --- 4. Scoped memory: CEO plan readable by a worker ------------------------
ctx = RunContext()
ceo = CEOAgent(QwenClient(settings), ScopedMemory(ctx, "company"), ToolBelt(registry, CEOAgent.available_tools))
ceo_resp = asyncio.run(ceo.generate_response("Build a budgeting app"))
check("CEO returns AgentResponse", isinstance(ceo_resp, AgentResponse))
check("CEO wrote plan into company scope", ctx.read("company", "plan") is not None)
pm = ProductManagerAgent(QwenClient(settings), ScopedMemory(ctx, "product"), ToolBelt(registry, ProductManagerAgent.available_tools))
check("worker can recall_global the company plan",
      pm.memory.recall_global("company", "plan") is not None)
pm_resp = asyncio.run(pm.generate_response("Build a budgeting app"))
check("PM produced a PRD artifact", pm_resp.artifacts[0].title == "PRD")

# --- 5. LLM fallback in the shared template ---------------------------------
from app.services.qwen_client import LLMError  # noqa: E402

class FailingLLM(QwenClient):
    @property
    def enabled(self): return True
    async def chat(self, messages, *, temperature=0.2, max_tokens=1500, response_format=None):
        raise LLMError("simulated outage")

ctx2 = RunContext()
ceo_fb = CEOAgent(FailingLLM(settings), ScopedMemory(ctx2, "company"), ToolBelt(registry, CEOAgent.available_tools))
fb = asyncio.run(ceo_fb.generate_response("Build a budgeting app"))
check("CEO falls back to deterministic on LLM error", fb.source == "deterministic")

# --- 6. THE ONE-CLASS CLAIM: add a 7th agent at runtime, nothing else edited -
@register_agent
class DataScientistAgent(BaseAgent):
    role = "Data Scientist"
    name = "Nova Reed"
    initials = "NR"
    employee_id = "7"
    order = 7
    phase = "Insights"
    phase_label = "Analytics plan drafted"
    responsibility = "Designs metrics and the analytics plan."
    system_prompt = "You are Nova Reed, Data Scientist. Return JSON {summary, content}."
    available_tools = ["okr_planner"]
    memory_scope = "analytics"
    produces = [DeliverableSpec(title="Analytics Plan", type="Analytics")]

    def _respond_deterministically(self, project: str) -> AgentResponse:
        return self._produce_via_tools(project, [(self.produces[0], "okr_planner")],
                                       "Drafted the analytics plan.")

try:
    check("7 agents now registered", len(AGENT_REGISTRY) == 7)
    check("roster auto-includes the new agent",
          any(p.role == "Data Scientist" for p in build_roster()))
    orch2 = Orchestrator(QwenClient(settings), __import__("app.memory.store", fromlist=["RunMemory"]).RunMemory(), registry)
    resp = asyncio.run(orch2.launch("Build a budgeting app"))
    check("new agent ran in the pipeline", any(a.role == "Data Scientist" for a in resp.agents))
    check("plan auto-grew to 7 deliverables", len(resp.plan.deliverables) == 7)
    check("orchestration auto-includes Analytics Plan card",
          any(s.title == "Analytics Plan" for s in resp.orchestration.steps if s.type == "deliverable"))
finally:
    # Clean up so the live app keeps exactly six employees.
    AGENT_REGISTRY.pop("Data Scientist", None)
check("registry restored to 6", len(AGENT_REGISTRY) == 6)

print(f"\nALL {passed} CHECKS PASSED")
