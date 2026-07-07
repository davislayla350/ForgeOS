"""Memory layer.

Two concerns, kept separate:
  * ``RunContext`` + ``ScopedMemory`` -- the per-launch shared "blackboard".
    Each agent receives a ``ScopedMemory`` bound to its ``memory_scope``; it can
    freely read/write inside its own scope and read other scopes' shared state
    (e.g. the CEO's plan). This is the composition each agent depends on.
  * ``RunMemory`` -- cross-launch history of completed runs (process-local).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel

from app.models.domain import ProjectPlan


class RunContext:
    """A per-launch, scope-partitioned key/value blackboard shared by agents."""

    def __init__(self) -> None:
        self._scopes: dict[str, dict[str, Any]] = {}

    def write(self, scope: str, key: str, value: Any) -> None:
        self._scopes.setdefault(scope, {})[key] = value

    def read(self, scope: str, key: str, default: Any = None) -> Any:
        return self._scopes.get(scope, {}).get(key, default)

    def read_scope(self, scope: str) -> dict[str, Any]:
        return dict(self._scopes.get(scope, {}))

    def snapshot(self) -> dict[str, dict[str, Any]]:
        return {scope: dict(data) for scope, data in self._scopes.items()}


class ScopedMemory:
    """An agent's view of the shared context, anchored to one scope.

    Composed into each agent so behaviour stays decoupled from storage.
    """

    def __init__(self, context: RunContext, scope: str) -> None:
        self._context = context
        self._scope = scope

    @property
    def scope(self) -> str:
        return self._scope

    def remember(self, key: str, value: Any) -> None:
        """Write into this agent's own scope."""
        self._context.write(self._scope, key, value)

    def recall(self, key: str, default: Any = None) -> Any:
        """Read from this agent's own scope."""
        return self._context.read(self._scope, key, default)

    def recall_scope(self) -> dict[str, Any]:
        """Read everything in this agent's own scope."""
        return self._context.read_scope(self._scope)

    def recall_global(self, scope: str, key: str, default: Any = None) -> Any:
        """Read shared state from another scope (e.g. the company plan)."""
        return self._context.read(scope, key, default)


class RunRecord(BaseModel):
    """A stored record of one orchestration run.

    Preserved for backwards compatibility with the old ``RunMemory.save`` API.
    Rich cross-run persistence now lives in
    :class:`app.memory.repository.CompanyMemoryRecord`.
    """

    run_id: str
    project: str
    plan: ProjectPlan
    llm_enabled: bool
    created_at: datetime


class RunMemory:
    """Cross-launch history of completed runs.

    This class is now a thin facade over a
    :class:`~app.memory.repository.MemoryRepository`. The old ``save`` /
    ``get`` / ``count`` API is preserved (callers were passing ``run_id``,
    ``project``, ``plan``, ``llm_enabled``) so nothing existing has to change.
    The richer ``save_record`` accepts a full
    :class:`~app.memory.repository.CompanyMemoryRecord` and is what the
    orchestrator uses now that we capture artifacts, reviews, and derived
    architecture/security/mistakes data per run.
    """

    def __init__(self, repository: Any = None) -> None:
        # Import lazily so ``store`` doesn't hard-depend on ``repository`` for
        # anything but ``RunMemory`` (there are ScopedMemory-only callers).
        from app.memory.repository import (
            CompanyMemoryRecord,
            InMemoryRepository,
            MemoryRepository,
        )

        self._CompanyMemoryRecord = CompanyMemoryRecord
        self._repo: MemoryRepository = repository or InMemoryRepository()

    @property
    def repository(self) -> Any:
        """Expose the repository for advanced callers (e.g. similarity lookup)."""
        return self._repo

    async def save(
        self, run_id: str, project: str, plan: ProjectPlan, llm_enabled: bool
    ) -> RunRecord:
        """Legacy save: persist plan metadata only.

        Preserved so existing callers (e.g. tests, older orchestrator paths)
        keep working. Under the hood it writes a lean record to the
        repository.
        """
        created_at = datetime.now(timezone.utc)
        record = self._CompanyMemoryRecord(
            run_id=run_id,
            project=project,
            plan=plan,
            llm_enabled=llm_enabled,
            created_at=created_at,
        )
        await self._repo.save(record)
        return RunRecord(
            run_id=run_id,
            project=project,
            plan=plan,
            llm_enabled=llm_enabled,
            created_at=created_at,
        )

    async def save_record(self, record: Any) -> None:
        """Save a fully-populated :class:`CompanyMemoryRecord`."""
        await self._repo.save(record)

    async def get(self, run_id: str) -> RunRecord | None:
        record = await self._repo.get(run_id)
        if record is None:
            return None
        return RunRecord(
            run_id=record.run_id,
            project=record.project,
            plan=record.plan,
            llm_enabled=record.llm_enabled,
            created_at=record.created_at,
        )

    async def count(self) -> int:
        return await self._repo.count()
