"""BaseAgent -- the single base class every AI employee inherits from.

Design goals:
  * No duplicated control flow. ``generate_response`` is implemented **once**
    here as a template method: try the LLM, fall back to deterministic on any
    failure, assemble a uniform ``AgentResponse``.
  * Per-agent behaviour is supplied by class attributes (role, system_prompt,
    available_tools, memory_scope, produces, ...) plus one small hook,
    ``_respond_deterministically``. The LLM hook ``_on_llm_payload`` has a
    sensible default that subclasses rarely need to override.
  * Composition: each agent is constructed with an LLM client, a ``ScopedMemory``
    (its slice of the shared run context), and a ``ToolBelt`` (its allowed
    tools). Agents reason; they don't own storage or transport.

Subclasses set the class attributes and implement ``_respond_deterministically``.
That is the entire contract for adding an employee.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from typing import Any, ClassVar

from pydantic import ValidationError

from app.agents.tools import ToolBelt
from app.config import get_logger
from app.memory.store import ScopedMemory
from app.models.company import AgentMessage, AgentState, Task
from app.models.domain import AgentResponse, Artifact, DeliverableSpec
from app.services.qwen_client import LLMError, LLMParseError, QwenClient


class BaseAgent(ABC):
    """Abstract base for every ForgeOS agent."""

    # --- identity / config (subclasses MUST set these) -------------------
    role: ClassVar[str]
    name: ClassVar[str]
    initials: ClassVar[str]
    employee_id: ClassVar[str]
    order: ClassVar[int]
    phase: ClassVar[str]
    phase_label: ClassVar[str]
    responsibility: ClassVar[str]
    system_prompt: ClassVar[str]
    available_tools: ClassVar[list[str]]
    memory_scope: ClassVar[str]
    #: Deliverables this agent produces (drives plan + orchestration cards).
    produces: ClassVar[list[DeliverableSpec]] = []

    def __init__(
        self, llm: QwenClient, memory: ScopedMemory, toolbelt: ToolBelt
    ) -> None:
        self.llm = llm
        self.memory = memory
        self.tools = toolbelt
        self.channel: Any | None = None  # optional AgentChannel (composition)
        # --- collaboration state (used by the CompanyOrchestrator) -------
        self.state: AgentState = AgentState.IDLE
        self.inbox: list[AgentMessage] = []   # messages received from peers
        self.outbox: list[AgentMessage] = []  # messages this agent has sent
        self.task_queue: list[Task] = []      # work assigned to this agent
        self.logger: logging.Logger = get_logger(f"agent.{self.role.lower()}")

    def set_state(self, state: AgentState) -> AgentState:
        """Transition this agent's state, logging the change."""
        if state is not self.state:
            self.logger.info("%s state: %s -> %s", self.role, self.state.value, state.value)
        self.state = state
        return state

    def attach_channel(self, channel: Any) -> None:
        """Give this agent a messaging channel so it can message peers."""
        self.channel = channel

    def send_message(self, recipient_role: str, content: str) -> Any | None:
        """Send a message to a peer if a channel is attached."""
        if self.channel is None:
            return None
        return self.channel.send(recipient_role, content)

    # ================================================================
    # Public entry point -- implemented ONCE, inherited by all agents.
    # ================================================================
    async def generate_response(self, project: str) -> AgentResponse:
        """Produce this agent's response for the given project.

        Tries the LLM when configured; otherwise (or on any LLM failure) uses
        the agent's deterministic builder. Always returns a valid response.
        """
        project = project.strip()
        if self.llm.enabled:
            try:
                return await self._respond_with_llm(project)
            except LLMParseError as exc:
                self.logger.warning(
                    "LLM content unparseable (%s); using deterministic fallback.", exc
                )
            except (LLMError, ValueError, ValidationError) as exc:
                self.logger.warning(
                    "LLM path failed (%s); using deterministic fallback.", exc
                )
        return self._respond_deterministically(project)

    # ================================================================
    # LLM path (shared). Subclasses customise via ``_on_llm_payload``.
    # ================================================================
    async def _respond_with_llm(self, project: str) -> AgentResponse:
        plan = self.memory.recall_global("company", "plan")
        context_blob = json.dumps(plan, ensure_ascii=False) if plan else "none"
        payload = await self._llm_json(
            self.system_prompt,
            (
                f"Project: {project}\n"
                f"Company plan context: {context_blob}\n"
                "Produce your deliverable(s) as a JSON object."
            ),
            schema_hint=self._llm_schema_hint(),
        )
        return self._on_llm_payload(payload, project)

    def _llm_schema_hint(self) -> str:
        """Return a schema hint describing this agent's expected JSON output.

        Default: one field per declared deliverable, keyed by lower_snake title,
        plus an optional ``summary``. Subclasses can override to describe
        different shapes (see ``CEOAgent._llm_schema_hint``).
        """
        lines = ["{"]
        for i, spec in enumerate(self.produces):
            key = spec.title.lower().replace(" ", "_")
            comma = "," if i < len(self.produces) else ","
            lines.append(f'  "{key}": "<full text of the {spec.title}>"{comma}')
        lines.append('  "summary": "<one-sentence summary, optional>"')
        lines.append("}")
        return "\n".join(lines)

    def _on_llm_payload(self, payload: dict[str, Any], project: str) -> AgentResponse:
        """Default: build artifacts from the LLM payload, one per declared spec.

        Looks for content under the deliverable title, then ``content``, then
        falls back to the raw payload. Subclasses (e.g. CEO) override this.
        """
        summary = str(payload.get("summary") or f"{self.role} completed {self.phase}")
        artifacts: list[Artifact] = []
        for spec in self.produces:
            content = (
                payload.get(spec.title)
                or payload.get("content")
                or json.dumps(payload, ensure_ascii=False, indent=2)
            )
            artifacts.append(self._artifact(spec, str(content)))
        return self._response(summary, artifacts, "llm")

    # ================================================================
    # Voice: short, personality-flavored inter-agent lines.
    # ================================================================
    async def voice(
        self,
        intent: str,
        *,
        deliverable: str | None = None,
        recipient_role: str | None = None,
        context: str | None = None,
        fallback: str,
    ) -> str:
        """Generate a short line for a routine inter-agent handoff.

        Used by the orchestrator to voice canned messages ("PRD is ready...")
        in the sending agent's personality. Contract:
          * ONE line, under 30 words. Professional.
          * The agent's own ``system_prompt`` shapes tone; ``intent`` shapes
            content ("handoff", "ack_review", "escalation", "release_ready").
          * Falls back to ``fallback`` on any LLM error, unparseable content,
            over-length reply, or empty response. Never raises.
          * The returned string, whether LLM or fallback, is what the message
            bus records; both paths therefore land in structured events.
        """
        if not self.llm.enabled:
            return fallback

        user_bits = [f"Intent: {intent}"]
        if recipient_role:
            user_bits.append(f"Recipient: {recipient_role}")
        if deliverable:
            user_bits.append(f"Deliverable: {deliverable}")
        if context:
            user_bits.append(f"Context: {context}")
        user_bits.append(
            "Write ONE short professional line (under 30 words) in your own "
            "voice for this handoff. No preamble, no greetings, no signoff. "
            "Return a JSON object: {\"line\": \"<your one-line message>\"}."
        )
        user_prompt = "\n".join(user_bits)

        try:
            payload = await self._llm_json(
                self.system_prompt,
                user_prompt,
                schema_hint='{"line": "<one short professional line>"}',
                max_tokens=200,
            )
        except (LLMError, LLMParseError, ValueError, ValidationError) as exc:
            self.logger.warning(
                "voice() LLM path failed (%s); using deterministic fallback.", exc
            )
            return fallback

        raw = payload.get("line")
        if not isinstance(raw, str):
            return fallback
        line = raw.strip()
        if not line:
            return fallback
        # Guardrail: cap length even if the model ignored the constraint.
        # This preserves the "concise professional" contract.
        MAX_WORDS = 40
        words = line.split()
        if len(words) > MAX_WORDS:
            line = " ".join(words[:MAX_WORDS]).rstrip(",.;:") + "..."
        return line

    # ================================================================
    # Deterministic path -- the ONLY required hook for a new agent.
    # ================================================================
    @abstractmethod
    def _respond_deterministically(self, project: str) -> AgentResponse:
        """Build this agent's response without an LLM."""
        raise NotImplementedError

    # ================================================================
    # Shared helpers (so subclasses stay tiny, no duplication)
    # ================================================================
    def _produce_via_tools(
        self,
        project: str,
        mapping: list[tuple[DeliverableSpec, str]],
        summary: str,
    ) -> AgentResponse:
        """Run (spec, tool) pairs, store each result in memory, build a response.

        This is the common shape for every "worker" agent: call its tool(s),
        remember the output, emit artifacts. Keeps each agent down to one line.
        """
        plan = self.memory.recall_global("company", "plan")
        artifacts: list[Artifact] = []
        for spec, tool_name in mapping:
            content = self.tools.use(tool_name, project=project, plan=plan)
            self.memory.remember(spec.title.lower().replace(" ", "_"), content)
            artifacts.append(self._artifact(spec, content))
        return self._response(summary, artifacts, "deterministic")

    def _artifact(self, spec: DeliverableSpec, content: str) -> Artifact:
        return Artifact(
            title=spec.title,
            type=spec.type,
            owner_role=self.role,
            content=content,
        )

    def _response(
        self,
        summary: str,
        artifacts: list[Artifact],
        source: str,
    ) -> AgentResponse:
        return AgentResponse(
            role=self.role,
            name=self.name,
            phase=self.phase,
            summary=summary,
            source=source,  # type: ignore[arg-type]
            tool_calls=self.tools.calls,
            artifacts=artifacts,
        )

    @staticmethod
    def extract_json(text: str) -> dict[str, Any]:
        """Best-effort extraction of a JSON object from an LLM response."""
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1]
            if cleaned.rstrip().endswith("```"):
                cleaned = cleaned.rstrip()[: -len("```")]
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end < start:
            raise ValueError("No JSON object found in LLM response.")
        try:
            parsed = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise ValueError(f"Failed to parse JSON from LLM response: {exc}") from exc
        if not isinstance(parsed, dict):
            raise ValueError("Parsed LLM JSON is not an object.")
        return parsed

    async def _llm_json(
        self,
        system: str,
        user: str,
        *,
        max_tokens: int = 1200,
        schema_hint: str | None = None,
    ) -> dict[str, Any]:
        """Call the LLM and return a parsed JSON object from its reply.

        This routes through :meth:`QwenClient.structured_chat`, which:
          * strengthens the system prompt with a strict JSON format footer,
          * requests OpenAI-style JSON mode (``response_format``),
          * appends an optional ``schema_hint`` to the user turn, and
          * retries ONCE with a repair prompt before giving up.

        Shared by every LLM code path (planning, reviewing, revising,
        summarising) so the request/parse discipline lives in exactly one
        place. Raises ``LLMError`` (transport failure) or ``LLMParseError``
        (unparseable content after one retry); both are caught by callers
        and converted into a deterministic fallback.
        """
        return await self.llm.structured_chat(
            system,
            user,
            schema_hint=schema_hint,
            max_tokens=max_tokens,
        )


class WorkerAgent(BaseAgent):
    """Base for "worker" employees that produce deliverables via tools.

    A worker only declares ``produces`` and a ``tools_for`` map (deliverable
    title -> tool name). Both the full deterministic response and single-task
    execution are derived from that map, so worker subclasses contain no method
    bodies -- just configuration. Adding a worker is one class of attributes.
    """

    #: Maps each produced deliverable's title to the tool that builds it.
    tools_for: ClassVar[dict[str, str]] = {}
    #: Activity line used when the worker runs its full deterministic response.
    deterministic_summary: ClassVar[str] = ""

    def _respond_deterministically(self, project: str) -> AgentResponse:
        mapping = [(spec, self.tools_for[spec.title]) for spec in self.produces]
        summary = self.deterministic_summary or f"{self.role} completed {self.phase}"
        return self._produce_via_tools(project, mapping, summary)

    def perform_task(self, deliverable_title: str, project: str) -> Artifact:
        """Execute a single deliverable (one node of the task graph).

        Used by the CompanyOrchestrator to run tasks individually so that task
        dependencies are honoured.
        """
        if deliverable_title not in self.tools_for:
            raise KeyError(
                f"{self.role} cannot perform unknown task '{deliverable_title}'."
            )
        plan = self.memory.recall_global("company", "plan")
        content = self.tools.use(
            self.tools_for[deliverable_title], project=project, plan=plan
        )
        spec = next(s for s in self.produces if s.title == deliverable_title)
        self.memory.remember(deliverable_title.lower().replace(" ", "_"), content)
        return self._artifact(spec, content)

    async def revise(
        self, deliverable_title: str, feedback: str, project: str, revision: int
    ) -> Artifact:
        """Revise a previously produced deliverable to address review feedback.

        Uses the LLM when available; on any failure falls back to a
        deterministic revision that appends an explicit "addressed feedback"
        section to the prior content. Either way the whole workflow proceeds.
        """
        spec = next(s for s in self.produces if s.title == deliverable_title)
        key = deliverable_title.lower().replace(" ", "_")
        prior = self.memory.recall(key) or ""

        content: str | None = None
        if self.llm.enabled:
            try:
                payload = await self._llm_json(
                    self.system_prompt,
                    (
                        f"Project: {project}\n"
                        f"Revise the '{deliverable_title}' to address this review "
                        f"feedback:\n{feedback}\n\n"
                        f"Prior version:\n{prior}"
                    ),
                    schema_hint='{"content": "<full text of the revised document>"}',
                    max_tokens=1500,
                )
                revised = payload.get("content")
                if isinstance(revised, str) and revised.strip():
                    content = revised
                else:
                    self.logger.warning(
                        "LLM revise: 'content' missing or empty in payload; "
                        "using deterministic."
                    )
            except LLMParseError as exc:
                self.logger.warning(
                    "LLM revise content unparseable (%s); using deterministic.", exc
                )
            except (LLMError, ValueError) as exc:
                self.logger.warning("LLM revise failed (%s); using deterministic.", exc)

        if content is None:
            content = (
                f"{prior}\n\n## Revision {revision} -- addressing review feedback\n"
                f"Reviewer feedback: {feedback}\n"
                f"Changes: updated the {deliverable_title.lower()} to resolve the "
                f"issues raised above."
            )

        self.memory.remember(key, content)
        artifact = self._artifact(spec, content)
        self.logger.info("%s revised '%s' (revision %d).", self.role, deliverable_title, revision)
        return artifact
