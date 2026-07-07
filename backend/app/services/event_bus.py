"""EventBus -- ordered event log with async fan-out for streaming.

The orchestrator publishes every :class:`OrchestrationEvent` here. The bus keeps
an ordered log (for the non-streaming result) and also pushes each event to any
subscribers' queues. A websocket handler subscribes and forwards events as they
arrive:

    queue = bus.subscribe()
    while True:
        event = await queue.get()
        if event is None:        # sentinel: run finished
            break
        await websocket.send_json(event.model_dump(mode="json"))

Multiple subscribers are supported, so several websockets can watch one run.
"""

from __future__ import annotations

import asyncio

from app.models.company import OrchestrationEvent

# Sentinel pushed to every subscriber when the run completes.
STREAM_END: None = None


class EventBus:
    """An append-only event log that also fans out to async subscribers."""

    def __init__(self) -> None:
        self._log: list[OrchestrationEvent] = []
        self._subscribers: list[asyncio.Queue[OrchestrationEvent | None]] = []
        self._closed = False

    def subscribe(self) -> asyncio.Queue[OrchestrationEvent | None]:
        """Register a new subscriber and return its queue."""
        queue: asyncio.Queue[OrchestrationEvent | None] = asyncio.Queue()
        self._subscribers.append(queue)
        return queue

    async def publish(self, event: OrchestrationEvent) -> None:
        """Append to the log and deliver to all subscribers."""
        self._log.append(event)
        for queue in self._subscribers:
            await queue.put(event)

    async def close(self) -> None:
        """Signal end-of-stream to all subscribers."""
        if self._closed:
            return
        self._closed = True
        for queue in self._subscribers:
            await queue.put(STREAM_END)

    @property
    def log(self) -> list[OrchestrationEvent]:
        """The ordered event log so far."""
        return list(self._log)
