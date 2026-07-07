"""Inter-agent messaging.

``MessageBus`` records every message and maintains a per-recipient inbox.
``AgentChannel`` is the per-agent handle (composition) so an agent can send to a
peer without knowing about the bus internals. The orchestrator attaches a
channel to each agent and also drives dependency-based handoff messages through
these channels, so the sender of a handoff is the actual upstream agent.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timezone

from app.models.company import AgentMessage


class MessageBus:
    """Stores agent-to-agent messages and per-recipient inboxes."""

    def __init__(self) -> None:
        self._messages: list[AgentMessage] = []
        self._inboxes: dict[str, list[AgentMessage]] = defaultdict(list)

    def send(self, sender: str, recipient: str, content: str) -> AgentMessage:
        message = AgentMessage(
            id=uuid.uuid4().hex,
            sender=sender,
            recipient=recipient,
            content=content,
            timestamp=datetime.now(timezone.utc),
        )
        self._messages.append(message)
        self._inboxes[recipient].append(message)
        return message

    def inbox(self, recipient: str) -> list[AgentMessage]:
        return list(self._inboxes[recipient])

    @property
    def messages(self) -> list[AgentMessage]:
        return list(self._messages)


class AgentChannel:
    """A single agent's handle onto the message bus (composition)."""

    def __init__(self, bus: MessageBus, owner_role: str) -> None:
        self._bus = bus
        self._owner = owner_role

    def send(self, recipient: str, content: str) -> AgentMessage:
        """Send a message from this agent to a peer."""
        return self._bus.send(self._owner, recipient, content)

    def inbox(self) -> list[AgentMessage]:
        """Read this agent's inbox."""
        return self._bus.inbox(self._owner)
