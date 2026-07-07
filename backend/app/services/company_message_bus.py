"""CompanyMessageBus -- the collaboration protocol between agents.

Every protocol action (a message, a review request, an approval, a rejection, an
escalation) does two things:
  1. records an :class:`AgentMessage` and delivers it to the recipient's inbox
     (and the sender's outbox), and
  2. emits a structured :class:`OrchestrationEvent` onto the timeline.

Because each action becomes an event, the entire collaboration is already in the
exact shape a websocket will stream later -- no separate serialisation step.

Dependency injection: the bus is constructed with the per-run agent directory
(role -> agent, so it can reach inboxes/outboxes) and an ``emit`` coroutine
(supplied by the orchestrator) that publishes events. The bus knows nothing about
how events are stored or streamed.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from app.agents.base import BaseAgent
from app.config import get_logger
from app.models.company import AgentMessage, EventType, OrchestrationEvent

logger = get_logger(__name__)

EmitFn = Callable[[EventType, str | None, dict], Awaitable[OrchestrationEvent]]

BROADCAST = "*"
CEO_ROLE = "CEO"


class CompanyMessageBus:
    """Routes messages between agents and turns each into a timeline event."""

    def __init__(self, agents: dict[str, BaseAgent], emit: EmitFn) -> None:
        self._agents = agents
        self._emit = emit
        self._messages: list[AgentMessage] = []

    @property
    def messages(self) -> list[AgentMessage]:
        return list(self._messages)

    # ------------------------------------------------------------ core
    def _record(self, sender: str, recipient: str, content: str) -> AgentMessage:
        message = AgentMessage(
            id=uuid.uuid4().hex,
            sender=sender,
            recipient=recipient,
            content=content,
            timestamp=datetime.now(timezone.utc),
        )
        self._messages.append(message)
        if sender in self._agents:
            self._agents[sender].outbox.append(message)
        if recipient in self._agents:
            self._agents[recipient].inbox.append(message)
        logger.info("msg %s -> %s: %s", sender, recipient, content)
        return message

    # ------------------------------------------------------------ protocol
    async def send_message(
        self, sender: str, receiver: str, message: str
    ) -> AgentMessage:
        """Direct message from one agent to another."""
        msg = self._record(sender, receiver, message)
        await self._emit(
            EventType.AGENT_MESSAGE,
            sender,
            {"from": sender, "to": receiver, "content": message},
        )
        return msg

    async def broadcast(self, sender: str, message: str) -> None:
        """Send a message to every other agent."""
        for role in self._agents:
            if role != sender:
                self._record(sender, role, message)
        await self._emit(
            EventType.AGENT_MESSAGE,
            sender,
            {"from": sender, "to": BROADCAST, "content": message, "broadcast": True},
        )

    async def request_review(
        self, requester: str, reviewer: str, target: str
    ) -> None:
        """Ask a reviewer to review a target artifact."""
        self._record(requester, reviewer, f"Please review '{target}'.")
        await self._emit(
            EventType.REVIEW_REQUESTED,
            requester,
            {"requester": requester, "reviewer": reviewer, "target": target},
        )

    async def approve(
        self, reviewer: str, target: str, owner: str, comments: str = ""
    ) -> None:
        """Reviewer approves the target; notifies its owner."""
        self._record(reviewer, owner, f"Approved '{target}'. {comments}".strip())
        await self._emit(
            EventType.REVIEW_APPROVED,
            reviewer,
            {"reviewer": reviewer, "target": target, "owner": owner, "comments": comments},
        )

    async def reject(
        self,
        reviewer: str,
        target: str,
        owner: str,
        comments: str,
        issues: list[str],
    ) -> None:
        """Reviewer rejects the target; notifies its owner with issues."""
        self._record(reviewer, owner, f"Rejected '{target}': {comments}")
        await self._emit(
            EventType.REVIEW_REJECTED,
            reviewer,
            {
                "reviewer": reviewer,
                "target": target,
                "owner": owner,
                "comments": comments,
                "issues": issues,
            },
        )

    async def escalate_to_ceo(self, escalator: str, reason: str) -> None:
        """Escalate a blocked decision to the CEO."""
        self._record(escalator, CEO_ROLE, f"Escalation: {reason}")
        await self._emit(
            EventType.ESCALATED,
            escalator,
            {"by": escalator, "reason": reason},
        )
