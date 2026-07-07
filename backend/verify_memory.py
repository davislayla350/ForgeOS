"""Verification of persistent company memory."""

from __future__ import annotations

import asyncio

from app.agents.tools import default_tool_registry
from app.config import get_settings
from app.memory.repository import (
    ArchitectureNote,
    CompanyMemoryRecord,
    InMemoryRepository,
    MemoryRepository,
    Mistake,
    SecurityIssue,
    build_memory_record,
)
from app.memory.store import RunMemory
from app.models.company import ReviewOutcome, ReviewVerdict, Task, TaskStatus
from app.models.domain import Artifact, ProjectPlan
from app.services.company_orchestrator import CompanyOrchestrator
from app.services.qwen_client import QwenClient

passed = 0


def check(label: str, cond: bool) -> None:
    global passed
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    assert cond, f"FAILED: {label}"
    passed += 1


settings = get_settings()


def make_orch(memory: RunMemory | None = None) -> CompanyOrchestrator:
    memory = memory or RunMemory()
    return CompanyOrchestrator(QwenClient(settings), memory, default_tool_registry())


# -------------------------------------------------------------------
# 1. Repository is a Protocol; InMemory satisfies it.
# -------------------------------------------------------------------
repo = InMemoryRepository()
check("InMemoryRepository is a MemoryRepository", isinstance(repo, MemoryRepository))

# -------------------------------------------------------------------
# 2. build_memory_record extracts everything from a completed run.
# -------------------------------------------------------------------
memory = RunMemory()
orch = make_orch(memory)
result = asyncio.run(orch.run("Build a budgeting app for freelancers"))

count = asyncio.run(memory.count())
check("Run is persisted (count == 1)", count == 1)

record = asyncio.run(memory.repository.list_recent(limit=10))[0]
check("Persisted record contains full artifacts",
      len(record.artifacts) >= 5)
check("Persisted record contains reviews",
      len(record.reviews) >= 2)
check("Persisted record extracted mistakes from rejections",
      len(record.mistakes) >= 1)
check("Persisted record extracted architecture notes",
      len(record.architectures) >= 1)
approved_arch = [a for a in record.architectures if a.approved]
check("At least one approved architecture recorded", len(approved_arch) >= 1)

# -------------------------------------------------------------------
# 3. Public old-style API still works (backwards compat).
# -------------------------------------------------------------------
legacy_record = asyncio.run(memory.get(result.run_id))
check("Legacy RunMemory.get still returns RunRecord",
      legacy_record is not None and legacy_record.project == result.project)
check("Legacy RunRecord preserves plan",
      legacy_record.plan.company_name == result.plan.company_name)

# -------------------------------------------------------------------
# 4. Similarity: a second, related project finds the first.
# -------------------------------------------------------------------
result2 = asyncio.run(orch.run("Build a budgeting tool for small businesses"))
check("Two runs persisted", asyncio.run(memory.count()) == 2)

repo_direct = memory.repository
similar = asyncio.run(repo_direct.find_similar_projects("budgeting", limit=3))
check("Similarity finds past budgeting projects", len(similar) >= 1)
check("Similarity scores in [0, 1]",
      all(0 <= s.score <= 1 for s in similar))
check("Similarity results sorted by score desc",
      all(similar[i].score >= similar[i+1].score for i in range(len(similar)-1)))

# Unrelated query should score lower than a related one.
similar_unrelated = asyncio.run(
    repo_direct.find_similar_projects("distributed streaming ETL platform", limit=3)
)
top_related_score = similar[0].score if similar else 0.0
top_unrelated_score = similar_unrelated[0].score if similar_unrelated else 0.0
check("Related query scores higher than unrelated",
      top_related_score > top_unrelated_score or top_unrelated_score == 0.0)

# -------------------------------------------------------------------
# 5. Third run: agents can see prior context via the seeded blackboard.
# -------------------------------------------------------------------
result3 = asyncio.run(orch.run("Build a budgeting dashboard"))
memory_events = [e for e in result3.events if e.type.value == "memory_seeded"]
check("Third run emits a memory_seeded event", len(memory_events) == 1)
seeded = memory_events[0].payload
check("memory_seeded event lists similar past projects",
      len(seeded["similar_projects"]) >= 1)
similar_names = [p["project"] for p in seeded["similar_projects"]]
check("Similar projects include a prior budgeting run",
      any("budgeting" in p.lower() for p in similar_names))
check("memory_seeded event lists preferred technologies",
      "preferred_technologies" in seeded)

# -------------------------------------------------------------------
# 6. preferred_technologies aggregates across runs.
# -------------------------------------------------------------------
pref = asyncio.run(repo_direct.preferred_technologies(limit=5))
check("preferred_technologies returns (name, uses) tuples",
      all(isinstance(t, tuple) and len(t) == 2 for t in pref))
if pref:
    check("preferred_technologies sorted by uses desc",
          all(pref[i][1] >= pref[i+1][1] for i in range(len(pref)-1)))

# -------------------------------------------------------------------
# 7. Malformed / totally different backend can drop in.
# -------------------------------------------------------------------
class DummyRepo:
    """A backend that returns nothing; verifies the protocol allows this."""
    async def save(self, record): pass
    async def get(self, run_id): return None
    async def list_recent(self, limit=20): return []
    async def find_similar_projects(self, project, *, limit=3): return []
    async def preferred_technologies(self, limit=10): return []
    async def security_issues(self, limit=20): return []
    async def mistakes(self, limit=20): return []
    async def count(self): return 0

dummy_memory = RunMemory(repository=DummyRepo())
dummy_orch = CompanyOrchestrator(
    QwenClient(settings), dummy_memory, default_tool_registry()
)
res4 = asyncio.run(dummy_orch.run("Build a note-taking app"))
check("Alternative repository can be injected",
      res4.events[-1].type.value == "run_completed")

# -------------------------------------------------------------------
# 8. Existing agents can query memory via recall_global (the requirement).
# -------------------------------------------------------------------
# The memory_seeded blackboard entries should be visible to every agent's
# ScopedMemory via recall_global. Simulate a scoped read from an agent's
# perspective by peeking at the run's shared context after the run.
# We already ran result3; verify the blackboard was populated at seed time.
# Do this by running a fresh session and checking the context right after seed.
from app.memory.store import RunContext, ScopedMemory
from app.services.company_orchestrator import _RunSession as _RS  # test-only

session = _RS("test-run", "Build a budgeting app for teams", QwenClient(settings), default_tool_registry())
async def just_seed():
    o = CompanyOrchestrator(QwenClient(settings), memory, default_tool_registry())
    await o._seed_memory(session)
asyncio.run(just_seed())

# An agent in scope "product" would recall_global("company", "past_projects").
pm_view = ScopedMemory(session.context, "product")
past = pm_view.recall_global("company", "past_projects")
check("Agent can see past_projects via recall_global",
      isinstance(past, list) and len(past) >= 1)
pref = pm_view.recall_global("company", "preferred_technologies")
check("Agent can see preferred_technologies via recall_global",
      isinstance(pref, list))
mist = pm_view.recall_global("company", "past_mistakes")
check("Agent can see past_mistakes via recall_global",
      isinstance(mist, list))
sec = pm_view.recall_global("company", "past_security_issues")
check("Agent can see past_security_issues via recall_global",
      isinstance(sec, list))
arch = pm_view.recall_global("company", "successful_architectures")
check("Agent can see successful_architectures via recall_global",
      isinstance(arch, list))

print(f"\nALL {passed} CHECKS PASSED")


# Helper functions --------------------------------------------------
async def _first_record(mem: RunMemory) -> CompanyMemoryRecord:
    """Fetch the first (only) record in the repository, richly-typed."""
    all_records = await mem.repository.list_recent(limit=10)
    return all_records[0]
