"""Persistent company memory: the repository interface and the in-memory store.

Design intent
=============

The point of this module is to make "swap the store" cheap. Every persistent
piece of a run (its plan, its artifacts, the reviews it triggered, the
technologies it used, the mistakes flagged during it) is captured in a single
:class:`CompanyMemoryRecord`. Access to those records happens through the
:class:`MemoryRepository` protocol, which describes exactly the shape a Redis
or vector-database backend would need to implement.

Today the default backend is :class:`InMemoryRepository`. Tomorrow it can be
:class:`RedisRepository` (see the stub) or a vector store. Callers never
change; only ``main.py`` picks a different repository at startup.

Similarity
----------

For persistent memory to be useful an agent needs to find *similar past
projects*, not just the exact same project. The interface exposes
``find_similar_projects(query, limit)`` and the in-memory backend implements
it with a tokenised Jaccard score. That is deliberately modest: a proper
implementation belongs in a vector store, and the interface has been shaped so
swapping in ``embed(text) -> vector`` + top-k cosine is a straight swap. The
Jaccard version is honest about what it is: fast, deterministic, and enough
to demonstrate the flow.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field

from app.models.company import AgentMessage, ReviewOutcome, Task
from app.models.domain import Artifact, ProjectPlan


# ---------------------------------------------------------------------------
# Record types
# ---------------------------------------------------------------------------


class ArchitectureNote(BaseModel):
    """A distilled architecture decision reused across projects."""

    project: str
    summary: str
    stack: list[str] = Field(default_factory=list)
    approved: bool = False


class SecurityIssue(BaseModel):
    """A security issue flagged in a past review."""

    project: str
    target: str
    issue: str


class Mistake(BaseModel):
    """A mistake (rejection reason, escalation, revision) worth remembering."""

    project: str
    target: str
    reason: str
    revision: int


class CompanyMemoryRecord(BaseModel):
    """One completed run, in the form the crew can query later.

    A single record captures the information across all the categories the
    prompt calls out: past project, mistakes, security issues, preferred
    technologies, and successful architectures.
    """

    run_id: str
    project: str
    llm_enabled: bool
    created_at: datetime
    plan: ProjectPlan
    artifacts: list[Artifact] = Field(default_factory=list)
    reviews: list[ReviewOutcome] = Field(default_factory=list)
    #: Distilled architecture notes: title, stack, approval status.
    architectures: list[ArchitectureNote] = Field(default_factory=list)
    #: Rejection reasons and escalations captured as mistakes.
    mistakes: list[Mistake] = Field(default_factory=list)
    #: Security issues flagged during any review of this run.
    security_issues: list[SecurityIssue] = Field(default_factory=list)
    #: The union of technologies mentioned in ``plan.recommended_stack`` and
    #: any artifact-detected tech words. Frequency is captured elsewhere.
    technologies: list[str] = Field(default_factory=list)


class SimilarProject(BaseModel):
    """A hit from :meth:`MemoryRepository.find_similar_projects`."""

    record: CompanyMemoryRecord
    score: float


# ---------------------------------------------------------------------------
# Repository protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class MemoryRepository(Protocol):
    """The persistence contract, shaped so a Redis or vector store can slot in.

    All methods are async so a network-backed implementation is drop-in. The
    in-memory backend is trivially async (it just wraps a lock).
    """

    async def save(self, record: CompanyMemoryRecord) -> None: ...

    async def get(self, run_id: str) -> CompanyMemoryRecord | None: ...

    async def list_recent(self, limit: int = 20) -> list[CompanyMemoryRecord]: ...

    async def find_similar_projects(
        self, project: str, *, limit: int = 3
    ) -> list[SimilarProject]:
        """Return past projects most similar to ``project``, most similar first.

        The score is store-defined but MUST be in ``[0, 1]`` where higher is
        more similar. A backend that can't score similarity should return the
        most recent records with score ``0``.
        """
        ...

    async def preferred_technologies(self, limit: int = 10) -> list[tuple[str, int]]:
        """The most-used technologies across all stored runs.

        Returns ``[(name, uses), ...]`` sorted by descending ``uses``.
        """
        ...

    async def security_issues(
        self, limit: int = 20
    ) -> list[SecurityIssue]:
        """Every recorded security issue across all runs, newest first."""
        ...

    async def mistakes(self, limit: int = 20) -> list[Mistake]:
        """Every recorded mistake across all runs, newest first."""
        ...

    async def count(self) -> int: ...


# ---------------------------------------------------------------------------
# In-memory implementation
# ---------------------------------------------------------------------------

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOPWORDS = frozenset(
    {
        "a", "an", "the", "and", "or", "for", "of", "to", "in", "on", "at",
        "by", "with", "from", "as", "is", "it", "be", "build", "make", "create",
        "app", "application", "platform", "system", "tool", "service",
    }
)


def _tokenize(text: str) -> set[str]:
    """Lowercase tokenizer that drops stopwords.

    Not clever. Deliberately not clever: the point is to have SOMETHING for the
    similarity path so the flow can be demonstrated, and to have a natural swap
    point for a real embedding-based implementation. Vector-store backends
    should ignore this helper entirely.
    """
    return {t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    intersection = a & b
    union = a | b
    return len(intersection) / len(union)


class InMemoryRepository:
    """Process-local repository. Default backend, safe for demos and tests.

    Data is lost when the process exits, which is fine because the whole point
    of the protocol above is that a real backend replaces this without touching
    the caller.
    """

    def __init__(self) -> None:
        self._records: dict[str, CompanyMemoryRecord] = {}
        self._lock = asyncio.Lock()
        # Precomputed on save so similarity lookup is O(N) tokens over the
        # store, not O(N * tokenize). Reset when a record is written.
        self._tokens: dict[str, set[str]] = {}

    async def save(self, record: CompanyMemoryRecord) -> None:
        async with self._lock:
            self._records[record.run_id] = record
            self._tokens[record.run_id] = _tokenize(record.project)

    async def get(self, run_id: str) -> CompanyMemoryRecord | None:
        async with self._lock:
            return self._records.get(run_id)

    async def list_recent(self, limit: int = 20) -> list[CompanyMemoryRecord]:
        async with self._lock:
            ordered = sorted(
                self._records.values(), key=lambda r: r.created_at, reverse=True
            )
            return ordered[:limit]

    async def find_similar_projects(
        self, project: str, *, limit: int = 3
    ) -> list[SimilarProject]:
        query = _tokenize(project)
        async with self._lock:
            scored: list[SimilarProject] = []
            for run_id, record in self._records.items():
                tokens = self._tokens.get(run_id) or _tokenize(record.project)
                score = _jaccard(query, tokens)
                if score > 0:
                    scored.append(SimilarProject(record=record, score=score))
        scored.sort(key=lambda s: s.score, reverse=True)
        return scored[:limit]

    async def preferred_technologies(
        self, limit: int = 10
    ) -> list[tuple[str, int]]:
        counts: dict[str, int] = {}
        async with self._lock:
            for record in self._records.values():
                for tech in record.technologies:
                    key = tech.strip()
                    if not key:
                        continue
                    counts[key] = counts.get(key, 0) + 1
        return sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]

    async def security_issues(self, limit: int = 20) -> list[SecurityIssue]:
        async with self._lock:
            all_issues: list[tuple[datetime, SecurityIssue]] = []
            for record in self._records.values():
                for issue in record.security_issues:
                    all_issues.append((record.created_at, issue))
        all_issues.sort(key=lambda kv: kv[0], reverse=True)
        return [issue for _, issue in all_issues[:limit]]

    async def mistakes(self, limit: int = 20) -> list[Mistake]:
        async with self._lock:
            all_mistakes: list[tuple[datetime, Mistake]] = []
            for record in self._records.values():
                for mistake in record.mistakes:
                    all_mistakes.append((record.created_at, mistake))
        all_mistakes.sort(key=lambda kv: kv[0], reverse=True)
        return [mistake for _, mistake in all_mistakes[:limit]]

    async def count(self) -> int:
        async with self._lock:
            return len(self._records)


# ---------------------------------------------------------------------------
# Redis stub (documented, not implemented)
# ---------------------------------------------------------------------------


class RedisRepository:
    """Placeholder for a Redis-backed implementation.

    Not implemented in this build; the class exists so the *shape* of a real
    backend is on record. Wiring it up is:

        1. Add ``redis[hiredis]`` to requirements.
        2. Serialize each ``CompanyMemoryRecord`` with ``model_dump_json``
           and store under ``forgeos:run:<run_id>``.
        3. Maintain sorted sets:
             ``forgeos:runs:by_created`` (score = unix time)
             ``forgeos:tech:<name>`` (uses count)
        4. For similarity, either (a) mirror the tokeniser above and use Redis
           set intersection, or (b) push project embeddings into a vector
           index (RedisSearch, Qdrant, Weaviate).

    Until then it satisfies the protocol only for typing purposes.
    """

    def __init__(self, url: str) -> None:  # pragma: no cover - documentation stub
        raise NotImplementedError(
            "RedisRepository is a placeholder; see docstring for the wiring plan."
        )


# ---------------------------------------------------------------------------
# Record builder
# ---------------------------------------------------------------------------


# Small allowlist of technology tokens we can detect in artifact prose without
# a full NLP pipeline. Kept short because false positives are worse than false
# negatives here: an agent that claims to prefer a tech it never used damages
# the memory value. A real system would ingest a curated vocabulary or use
# entity linking.
_TECH_VOCABULARY: tuple[str, ...] = (
    "postgres", "postgresql", "mysql", "sqlite", "redis", "mongodb",
    "python", "typescript", "javascript", "go", "rust", "java", "kotlin",
    "fastapi", "django", "flask", "express", "nextjs", "react", "vue",
    "svelte", "kubernetes", "docker", "terraform", "aws", "gcp", "azure",
    "vercel", "cloudflare", "grpc", "graphql", "rest", "openapi",
    "kafka", "rabbitmq", "elasticsearch", "prometheus", "grafana",
)


def _detect_technologies(plan: ProjectPlan, artifacts: list[Artifact]) -> list[str]:
    """Extract a de-duplicated technology list from the plan + artifact text."""
    found: set[str] = set()
    for tech in plan.recommended_stack:
        for token in _tokenize(tech):
            if token in _TECH_VOCABULARY:
                found.add(token)
    for artifact in artifacts:
        for token in _tokenize(artifact.content):
            if token in _TECH_VOCABULARY:
                found.add(token)
    return sorted(found)


def build_memory_record(
    *,
    run_id: str,
    project: str,
    plan: ProjectPlan,
    tasks: list[Task],
    reviews: list[ReviewOutcome],
    messages: list[AgentMessage],
    llm_enabled: bool,
) -> CompanyMemoryRecord:
    """Compose a :class:`CompanyMemoryRecord` from the ingredients of a run.

    Pure. All the interesting derivations (technologies, mistakes, security
    issues, architecture summaries) live here so the orchestrator doesn't
    have to know how memory works.
    """
    artifacts = [t.artifact for t in tasks if t.artifact is not None]
    technologies = _detect_technologies(plan, artifacts)

    architectures: list[ArchitectureNote] = []
    for task in tasks:
        if task.title.lower() not in ("architecture", "api spec"):
            continue
        if task.artifact is None:
            continue
        # Approval derived from reviews list: latest verdict against this task.
        approved = False
        for review in reviews:
            target = review.target
            # QA's reviews target "Implementation" but gate the API Spec.
            if target == "Implementation" and task.title == "API Spec":
                approved = review.verdict.value == "approved"
            elif target == task.title:
                approved = review.verdict.value == "approved"
        first_line = task.artifact.content.strip().splitlines()[0] if task.artifact.content else task.title
        architectures.append(
            ArchitectureNote(
                project=project,
                summary=first_line.lstrip("# ").strip() or task.title,
                stack=list(plan.recommended_stack),
                approved=approved,
            )
        )

    mistakes: list[Mistake] = []
    for review in reviews:
        if review.verdict.value == "rejected":
            mistakes.append(
                Mistake(
                    project=project,
                    target=review.target,
                    reason=review.comments,
                    revision=review.revision,
                )
            )

    security_issues: list[SecurityIssue] = []
    for review in reviews:
        if review.reviewer != "Security":
            continue
        for issue in review.issues:
            security_issues.append(
                SecurityIssue(project=project, target=review.target, issue=issue)
            )

    return CompanyMemoryRecord(
        run_id=run_id,
        project=project,
        llm_enabled=llm_enabled,
        created_at=datetime.now(timezone.utc),
        plan=plan,
        artifacts=artifacts,
        reviews=reviews,
        architectures=architectures,
        mistakes=mistakes,
        security_issues=security_issues,
        technologies=technologies,
    )
