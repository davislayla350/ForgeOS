"""LiveRunRegistry -- server-side buffer of in-flight and recently-completed runs.

Why this exists
===============

WebSocket streaming is easy in the happy path. What's hard is reconnect: when a
client drops mid-run, "reconnect and resume" has to actually resume. That means
the server needs to remember what events fired for each run (at least for a
while) and let a returning client ask "give me everything since seq N".

This module solves that. The registry:

  * spawns exactly one orchestration per (project, client-supplied token) so a
    reconnect doesn't accidentally start a second run;
  * buffers every event in an ordered per-run list so a late subscriber gets a
    complete history plus the ongoing tail;
  * fan-outs live events to any number of concurrent subscribers;
  * evicts finished runs after ``ttl_seconds`` so memory stays bounded.

None of this leaks into the orchestrator: it still exposes ``run(project)`` and
``stream(project)``. The registry composes on top.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any

from app.config import get_logger
from app.services.company_orchestrator import CompanyOrchestrator

logger = get_logger(__name__)


class _LiveRun:
    """In-memory record of one live-or-recent run.

    Holds the ordered event log for resume, plus a set of ``asyncio.Queue``
    instances (one per active subscriber) for live fan-out. The run task
    itself is stored so callers can await completion or cancel on shutdown.
    """

    __slots__ = (
        "run_id",
        "project",
        "events",
        "subscribers",
        "task",
        "completed",
        "completed_at",
        "_lock",
    )

    def __init__(self, run_id: str, project: str) -> None:
        self.run_id = run_id
        self.project = project
        self.events: list[dict[str, Any]] = []
        self.subscribers: set[asyncio.Queue] = set()
        self.task: asyncio.Task | None = None
        self.completed: bool = False
        self.completed_at: float | None = None
        self._lock = asyncio.Lock()

    async def record(self, event: dict[str, Any]) -> None:
        """Append an event and fan it out to every current subscriber."""
        async with self._lock:
            self.events.append(event)
            # Snapshot subscribers so we don't hold the lock during put().
            subscribers = tuple(self.subscribers)
        for queue in subscribers:
            # Never block the producer: subscribers get a bounded queue and if
            # they lag they get dropped. See ``subscribe`` for the queue size.
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(
                    "Dropping slow subscriber for run %s (queue full).",
                    self.run_id,
                )
                # Best-effort removal; we hold no lock so it's advisory only.
                self.subscribers.discard(queue)

    async def snapshot_since(self, since_seq: int) -> list[dict[str, Any]]:
        """Return the buffered events with ``seq > since_seq``."""
        async with self._lock:
            if since_seq <= 0:
                return list(self.events)
            return [e for e in self.events if int(e.get("seq", 0)) > since_seq]

    async def add_subscriber(self, queue: asyncio.Queue) -> None:
        async with self._lock:
            self.subscribers.add(queue)

    async def remove_subscriber(self, queue: asyncio.Queue) -> None:
        async with self._lock:
            self.subscribers.discard(queue)

    async def mark_completed(self) -> None:
        async with self._lock:
            self.completed = True
            self.completed_at = time.monotonic()


class LiveRunRegistry:
    """Owns every live-or-recent run keyed by ``run_id``.

    Public API:
      * ``start(project) -> run_id`` kicks off a run and returns its id.
      * ``subscribe(run_id, since_seq) -> AsyncIterator`` yields buffered +
        live events. Safe for multiple concurrent subscribers and reconnects.
      * ``get(run_id)`` looks up an existing run (returns ``None`` if unknown).
      * ``prune()`` evicts completed runs older than ``ttl_seconds``.
    """

    #: How long a completed run's buffer sticks around for late reconnects.
    DEFAULT_TTL_SECONDS = 5 * 60
    #: Bounded per-subscriber queue; slower clients get dropped, not stalled.
    SUBSCRIBER_QUEUE_SIZE = 512
    #: Sentinel to signal "no more events" to a subscriber iterator.
    _STREAM_END = object()

    def __init__(
        self,
        orchestrator_factory,
        *,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
    ) -> None:
        # A factory (not an instance) so tests can inject alternatives; in the
        # app this closes over the shared ``CompanyOrchestrator``.
        self._orch_factory = orchestrator_factory
        self._ttl = ttl_seconds
        self._runs: dict[str, _LiveRun] = {}
        self._lock = asyncio.Lock()

    # ---------------------------------------------------------- run lifecycle
    async def start(self, project: str) -> str:
        """Start a new run, return its ``run_id`` immediately."""
        run_id = uuid.uuid4().hex
        record = _LiveRun(run_id=run_id, project=project)
        async with self._lock:
            await self._prune_locked()
            self._runs[run_id] = record
        record.task = asyncio.create_task(self._drive(record))
        return run_id

    async def _drive(self, record: _LiveRun) -> None:
        """Consume the orchestrator's stream and buffer each event."""
        orchestrator: CompanyOrchestrator = self._orch_factory()
        try:
            async for event in orchestrator.stream(record.project):
                await record.record(event)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Live run %s failed: %s", record.run_id, exc)
            # Best effort: emit a synthetic error event so subscribers see it.
            await record.record(
                {
                    "seq": len(record.events) + 1,
                    "type": "run_failed",
                    "timestamp": _iso_now(),
                    "actor": "system",
                    "payload": {"error": str(exc)},
                }
            )
        finally:
            await record.mark_completed()
            # Wake every subscriber so they can shut down cleanly.
            async with record._lock:
                subscribers = tuple(record.subscribers)
            for queue in subscribers:
                try:
                    queue.put_nowait(self._STREAM_END)
                except asyncio.QueueFull:
                    pass

    # ---------------------------------------------------------- subscription
    async def subscribe(self, run_id: str, since_seq: int = 0):
        """Yield events for ``run_id``, starting after ``since_seq``.

        Behaviour:
          * unknown ``run_id`` raises ``KeyError``;
          * buffered events (seq > ``since_seq``) yield first, in order;
          * live events yield as they arrive;
          * generator returns cleanly when the run finishes.

        Safe for multiple concurrent subscribers per run and for reconnects.
        """
        record = await self.get(run_id)
        if record is None:
            raise KeyError(run_id)

        queue: asyncio.Queue = asyncio.Queue(maxsize=self.SUBSCRIBER_QUEUE_SIZE)
        await record.add_subscriber(queue)
        try:
            # Replay buffered events first. Taking the snapshot AFTER adding
            # ourselves as a subscriber means any concurrent live event goes
            # into the queue and gets delivered after the snapshot, in order.
            snapshot = await record.snapshot_since(since_seq)
            seen_seqs: set[int] = set()
            for event in snapshot:
                seq = int(event.get("seq", 0))
                seen_seqs.add(seq)
                yield event

            # If the run already finished before we finished the snapshot,
            # drain any remaining live events off the queue and return.
            if record.completed:
                while not queue.empty():
                    event = queue.get_nowait()
                    if event is self._STREAM_END:
                        return
                    seq = int(event.get("seq", 0))
                    if seq in seen_seqs:
                        continue
                    yield event
                return

            # Live tail: pull events off the queue until the sentinel arrives.
            while True:
                event = await queue.get()
                if event is self._STREAM_END:
                    return
                seq = int(event.get("seq", 0))
                if seq in seen_seqs:
                    # Snapshot + live overlap: skip duplicates.
                    continue
                yield event
        finally:
            await record.remove_subscriber(queue)

    async def get(self, run_id: str) -> _LiveRun | None:
        async with self._lock:
            return self._runs.get(run_id)

    async def count(self) -> int:
        async with self._lock:
            return len(self._runs)

    async def prune(self) -> int:
        async with self._lock:
            return await self._prune_locked()

    async def _prune_locked(self) -> int:
        """Assumes ``self._lock`` is held. Returns number of records evicted."""
        now = time.monotonic()
        evict: list[str] = []
        for run_id, record in self._runs.items():
            if (
                record.completed
                and record.completed_at is not None
                and now - record.completed_at > self._ttl
            ):
                evict.append(run_id)
        for run_id in evict:
            del self._runs[run_id]
        if evict:
            logger.info("Pruned %d completed run(s) from live registry.", len(evict))
        return len(evict)

    async def shutdown(self) -> None:
        """Cancel every in-flight run task. Called on app shutdown."""
        async with self._lock:
            records = list(self._runs.values())
        for record in records:
            if record.task and not record.task.done():
                record.task.cancel()
        for record in records:
            if record.task:
                try:
                    await record.task
                except (asyncio.CancelledError, Exception):  # noqa: BLE001
                    pass


def _iso_now() -> str:
    """UTC ISO 8601, matching the format the orchestrator emits."""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
