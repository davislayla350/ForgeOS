"""CompanyOrchestrator -- coordinates the multi-agent software company.

This evolves the earlier single-pass engine into a realistic, message-driven
software-delivery workflow. Execution is NOT timer-based: each stage advances
only when the previous work is done and the right messages/reviews have flowed.

    CEO        -> project vision + plan
    PM         -> PRD / requirements        (message: PM -> Engineer)
    Engineer   -> architecture + impl plan  (request review: Engineer -> Security)
    Security   -> reviews architecture
                  approve  -> proceed
                  reject   -> Engineer revises -> Security re-reviews (bounded)
                  exceeded -> escalate to CEO, who overrides to unblock
    QA         -> test strategy + reviews the implementation (same loop)
    DevOps     -> deployment plan + approves the release
    CEO        -> publishes the final project summary

Every step is emitted as an OrchestrationEvent, so the timeline is identical
whether returned by ``run`` or streamed live by ``stream`` (the websocket path).

Qwen is used by each agent when available (planning, reviewing, revising,
summarising). On a missing key, a failed request, or invalid model output, each
agent falls back to a deterministic path, preserving the entire workflow.

SOLID / DI notes:
  * Single responsibility: messaging lives in CompanyMessageBus, the DAG/record
    in TaskGraph, event fan-out in EventBus, agent reasoning in the agents.
  * Dependency injection: the orchestrator receives the LLM client, run memory,
    and tool registry; per run it injects a scoped memory, a tool belt, and a
    bound ``emit`` into the message bus.
  * Open/closed: adding an agent/stage does not require touching the others.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

# Importing the agents package registers every concrete agent.
import app.agents  # noqa: F401
from app.agents.base import BaseAgent, WorkerAgent
from app.agents.ceo import CEOAgent
from app.agents.engineer import EngineerAgent
from app.agents.registry import agent_class_for_role, get_ordered_agent_classes
from app.agents.reviewer import ReviewerAgent
from app.agents.tools import ToolBelt, ToolRegistry
from app.config import get_logger
from app.memory.repository import build_memory_record
from app.memory.store import RunContext, RunMemory, ScopedMemory
from app.models.company import (
    AgentRuntimeState,
    AgentState,
    CodeBundle,
    CompanyRunResult,
    EventType,
    OrchestrationEvent,
    ReviewOutcome,
    ReviewVerdict,
    Task,
    TaskStatus,
)
from app.models.domain import Artifact, ProjectPlan
from app.services.company_message_bus import CompanyMessageBus
from app.services.event_bus import EventBus
from app.services.qwen_client import LLMError, QwenClient
from app.services.task_graph import TaskGraph

logger = get_logger(__name__)

CEO_ROLE = "CEO"
PM_ROLE = "Product Manager"
ENGINEER_ROLE = "Engineer"
SECURITY_ROLE = "Security"
QA_ROLE = "QA"
DEVOPS_ROLE = "DevOps"

#: How many revisions a reviewer will request before escalating to the CEO.
MAX_REVISIONS = 2

EmitFn = Callable[[EventType, str | None, dict], Awaitable[OrchestrationEvent]]


class _RunSession:
    """All mutable state for a single run. Keeps the orchestrator re-entrant."""

    def __init__(
        self, run_id: str, project: str, llm: QwenClient, tools: ToolRegistry
    ) -> None:
        self.run_id = run_id
        self.project = project
        self.context = RunContext()
        self.bus = EventBus()
        self.graph = TaskGraph()
        self.plan: ProjectPlan | None = None
        self.agents: dict[str, BaseAgent] = {}
        self.agent_states: dict[str, AgentRuntimeState] = {}
        self.reviews: list[ReviewOutcome] = []
        self.artifacts: dict[str, str] = {}        # latest content by title
        self.task_by_title: dict[str, Task] = {}
        self.messages: CompanyMessageBus | None = None
        self.code_bundle: CodeBundle | None = None
        self._llm = llm
        self._tools = tools
        self._seq = 0

    def next_seq(self) -> int:
        self._seq += 1
        return self._seq

    def build_agent(self, role: str) -> BaseAgent:
        cls = agent_class_for_role(role)
        if cls is None:
            raise RuntimeError(f"No registered agent for role '{role}'.")
        agent = cls(
            self._llm,
            ScopedMemory(self.context, cls.memory_scope),
            ToolBelt(self._tools, cls.available_tools),
        )
        self.agents[role] = agent
        self.agent_states[role] = AgentRuntimeState(role=role, name=cls.name)
        return agent

    def result(self) -> CompanyRunResult:
        assert self.plan is not None
        assert self.messages is not None
        return CompanyRunResult(
            run_id=self.run_id,
            project=self.project,
            plan=self.plan,
            tasks=self.graph.tasks(),
            agents=list(self.agent_states.values()),
            messages=self.messages.messages,
            reviews=self.reviews,
            events=self.bus.log,
            code_bundle=self.code_bundle,
        )


class CompanyOrchestrator:
    """Coordinates the agent crew through a realistic delivery workflow."""

    def __init__(
        self, llm: QwenClient, memory: RunMemory, tools: ToolRegistry
    ) -> None:
        self._llm = llm
        self._memory = memory
        self._tools = tools

    # ----------------------------------------------------------- public API
    async def run(self, project: str) -> CompanyRunResult:
        """Run the whole workflow and return the structured result."""
        session = _RunSession(uuid.uuid4().hex, project.strip(), self._llm, self._tools)
        await self._drive(session)
        result = session.result()
        # Persist a full record: plan + artifacts + reviews + derived
        # architectures / mistakes / security issues / technologies.
        record = build_memory_record(
            run_id=session.run_id,
            project=session.project,
            plan=result.plan,
            tasks=result.tasks,
            reviews=result.reviews,
            messages=result.messages,
            llm_enabled=self._llm.enabled,
        )
        await self._memory.save_record(record)
        return result

    async def stream(self, project: str):
        """Yield each event as JSON the moment it happens (websocket path)."""
        session = _RunSession(uuid.uuid4().hex, project.strip(), self._llm, self._tools)
        queue = session.bus.subscribe()
        driver = asyncio.create_task(self._drive(session))
        try:
            while True:
                event = await queue.get()
                if event is None:  # STREAM_END sentinel
                    break
                yield event.model_dump(mode="json")
        finally:
            await driver
            result = session.result()
            record = build_memory_record(
                run_id=session.run_id,
                project=session.project,
                plan=result.plan,
                tasks=result.tasks,
                reviews=result.reviews,
                messages=result.messages,
                llm_enabled=self._llm.enabled,
            )
            await self._memory.save_record(record)

    # ----------------------------------------------------------- memory
    async def _seed_memory(self, session: _RunSession) -> None:
        """Query persistent memory and seed the shared blackboard.

        Every agent's ``recall_global("company", "past_projects")`` will pick
        this up. This is the "before beginning a new project, every agent
        should query memory" requirement, satisfied in one place so it can't
        drift across the six agents.

        The seed is a light JSON-friendly dict; agents that want richer data
        can also read individual scopes (e.g. ``past_mistakes``,
        ``preferred_technologies``, ``past_security_issues``,
        ``similar_architectures``).
        """
        similar = await self._memory.repository.find_similar_projects(
            session.project, limit=3
        )
        preferred_tech = await self._memory.repository.preferred_technologies(limit=5)
        past_mistakes = await self._memory.repository.mistakes(limit=10)
        past_security = await self._memory.repository.security_issues(limit=10)

        # Assemble a compact summary; agents can drill down via other scopes.
        past_projects_summary = [
            {
                "project": s.record.project,
                "score": round(s.score, 3),
                "company_name": s.record.plan.company_name,
                "technologies": s.record.technologies,
                "had_rejections": len(s.record.mistakes) > 0,
                "successful_architectures": [
                    {"summary": a.summary, "stack": a.stack}
                    for a in s.record.architectures
                    if a.approved
                ],
            }
            for s in similar
        ]

        # Seed the shared blackboard. All agents can `recall_global` these.
        session.context.write(
            "company", "past_projects", past_projects_summary
        )
        session.context.write(
            "company",
            "preferred_technologies",
            [{"name": name, "uses": uses} for name, uses in preferred_tech],
        )
        session.context.write(
            "company",
            "past_mistakes",
            [m.model_dump() for m in past_mistakes],
        )
        session.context.write(
            "company",
            "past_security_issues",
            [i.model_dump() for i in past_security],
        )
        # Architectures worth reusing: those that were approved on a prior run.
        successful_arch = [
            a.model_dump()
            for s in similar
            for a in s.record.architectures
            if a.approved
        ]
        session.context.write(
            "company", "successful_architectures", successful_arch
        )
        # For observability: how much prior memory this run pulled from.
        session.context.write(
            "company",
            "memory_context",
            {
                "similar_projects": len(past_projects_summary),
                "top_similarity": (
                    round(similar[0].score, 3) if similar else 0.0
                ),
                "preferred_technologies": len(preferred_tech),
                "past_mistakes": len(past_mistakes),
                "past_security_issues": len(past_security),
            },
        )
        logger.info(
            "Seeded memory: %d similar projects, %d preferred tech, "
            "%d past mistakes, %d past security issues.",
            len(past_projects_summary),
            len(preferred_tech),
            len(past_mistakes),
            len(past_security),
        )
        await self._emit(
            session,
            EventType.MEMORY_SEEDED,
            "system",
            {
                "similar_projects": past_projects_summary,
                "preferred_technologies": [
                    {"name": name, "uses": uses} for name, uses in preferred_tech
                ],
                "past_mistakes_count": len(past_mistakes),
                "past_security_issues_count": len(past_security),
            },
        )

    # ----------------------------------------------------------- driver
    async def _drive(self, session: _RunSession) -> None:
        try:
            await self._emit(
                session, EventType.RUN_STARTED, "system",
                {"project": session.project},
            )

            # Seed persistent memory BEFORE the crew starts working, so every
            # agent can `recall_global("company", "past_projects")` and see
            # what the company has learned from past runs.
            await self._seed_memory(session)

            # Build the full crew up front so the message bus can reach inboxes.
            for cls in get_ordered_agent_classes():
                session.build_agent(cls.role)
            session.messages = CompanyMessageBus(session.agents, self._emitter(session))

            await self._stage_plan(session)
            await self._stage_pm(session)
            await self._stage_engineer(session)
            await self._stage_code_bundle(session)
            await self._stage_review(
                session, SECURITY_ROLE, ENGINEER_ROLE, "Architecture", "Architecture"
            )
            await self._produce(session, SECURITY_ROLE, "Security Review")
            await self._set_state(session, SECURITY_ROLE, AgentState.COMPLETE)
            security = session.agents[SECURITY_ROLE]
            handoff = await security.voice(
                "handoff",
                recipient_role=QA_ROLE,
                deliverable="Test Plan and Implementation review",
                context="Architecture approved after review",
                fallback="Architecture approved. Please create the test strategy and review the implementation.",
            )
            await session.messages.send_message(SECURITY_ROLE, QA_ROLE, handoff)

            await self._stage_qa(session)
            await self._stage_devops(session)
            await self._stage_publish(session)

            await self._emit(
                session, EventType.RUN_COMPLETED, "system",
                {
                    "tasks": len(session.graph.tasks()),
                    "messages": len(session.messages.messages),
                    "reviews": len(session.reviews),
                },
            )
        finally:
            await session.bus.close()

    # ----------------------------------------------------------- stages
    async def _stage_plan(self, session: _RunSession) -> None:
        """CEO creates the project vision + plan."""
        ceo = session.agents[CEO_ROLE]
        await self._set_state(session, CEO_ROLE, AgentState.WORKING)
        response = await ceo.generate_response(session.project)

        plan_dict = session.context.read("company", "plan")
        if plan_dict is None:
            raise RuntimeError("CEO did not produce a plan.")
        session.plan = ProjectPlan.model_validate(plan_dict)

        self._build_tasks(session)
        await self._set_state(session, CEO_ROLE, AgentState.COMPLETE)
        await self._emit(
            session, EventType.PLAN_CREATED, ceo.name,
            {
                "company_name": session.plan.company_name,
                "vision": session.plan.vision,
                "summary": response.summary,
                "plan": session.plan.model_dump(),
            },
        )
        handoff = await ceo.voice(
            "handoff",
            recipient_role=PM_ROLE,
            deliverable="PRD",
            context=f"Kickoff for project: {session.project}",
            fallback="Vision set. Please turn it into a PRD and requirements.",
        )
        await session.messages.send_message(CEO_ROLE, PM_ROLE, handoff)

    async def _stage_pm(self, session: _RunSession) -> None:
        await self._produce(session, PM_ROLE, "PRD")
        await self._set_state(session, PM_ROLE, AgentState.COMPLETE)
        pm = session.agents[PM_ROLE]
        handoff = await pm.voice(
            "handoff",
            recipient_role=ENGINEER_ROLE,
            deliverable="Architecture and API Spec",
            context="PRD complete",
            fallback="PRD is ready. Please design the architecture and implementation plan.",
        )
        await session.messages.send_message(PM_ROLE, ENGINEER_ROLE, handoff)

    async def _stage_engineer(self, session: _RunSession) -> None:
        await self._produce(session, ENGINEER_ROLE, "Architecture")
        await self._produce(session, ENGINEER_ROLE, "API Spec")
        await self._set_state(session, ENGINEER_ROLE, AgentState.WAITING)
        await session.messages.request_review(ENGINEER_ROLE, SECURITY_ROLE, "Architecture")

    async def _stage_qa(self, session: _RunSession) -> None:
        await self._produce(session, QA_ROLE, "Test Plan")
        # QA reviews the implementation (the API Spec is the implementation plan).
        await session.messages.request_review(QA_ROLE, QA_ROLE, "Implementation")
        await self._stage_review(session, QA_ROLE, ENGINEER_ROLE, "API Spec", "Implementation")
        await self._set_state(session, QA_ROLE, AgentState.COMPLETE)
        await self._set_state(session, ENGINEER_ROLE, AgentState.COMPLETE)
        qa = session.agents[QA_ROLE]
        handoff = await qa.voice(
            "handoff",
            recipient_role=DEVOPS_ROLE,
            deliverable="Deployment Plan",
            context="Implementation review passed",
            fallback="QA passed. Please prepare the deployment plan and release.",
        )
        await session.messages.send_message(QA_ROLE, DEVOPS_ROLE, handoff)

    async def _stage_devops(self, session: _RunSession) -> None:
        await self._produce(session, DEVOPS_ROLE, "Deployment Plan")
        devops = session.agents[DEVOPS_ROLE]
        approval_note = await devops.voice(
            "approval",
            recipient_role=CEO_ROLE,
            deliverable="Release",
            context="Deployment plan validated",
            fallback="Deployment validated; approving the release.",
        )
        await session.messages.approve(
            DEVOPS_ROLE, "Release", CEO_ROLE, approval_note
        )
        await self._set_state(session, DEVOPS_ROLE, AgentState.COMPLETE)
        release_note = await devops.voice(
            "release_ready",
            recipient_role=CEO_ROLE,
            deliverable="Release",
            context="Deployment approved",
            fallback="Release approved and ready to ship.",
        )
        await session.messages.send_message(DEVOPS_ROLE, CEO_ROLE, release_note)

    async def _stage_code_bundle(self, session: _RunSession) -> None:
        """Ask the Engineer to produce a starter code bundle.

        Fires immediately after Architecture and API Spec are complete so the
        frontend can display generated application files early in the run.
        Always emits a bundle: Qwen when available, deterministic templates
        otherwise.
        """
        from app.agents.code_bundle_templates import build_deterministic_bundle

        engineer = session.agents[ENGINEER_ROLE]
        assert isinstance(engineer, EngineerAgent)
        await self._set_state(session, ENGINEER_ROLE, AgentState.WORKING)
        try:
            bundle = await engineer.generate_code_bundle(
                session.project, session.plan
            )
        except Exception as exc:  # noqa: BLE001 -- must never fail the run
            logger.warning("Code bundle generation raised: %s", exc)
            bundle = build_deterministic_bundle(session.project, session.plan)

        if not bundle.files:
            bundle = build_deterministic_bundle(session.project, session.plan)

        session.code_bundle = bundle
        await self._emit(
            session,
            EventType.CODE_BUNDLE_GENERATED,
            engineer.name,
            {
                "files": [
                    {"path": f.path, "language": f.language, "content": f.content}
                    for f in bundle.files
                ],
                "source": bundle.source,
                "file_count": len(bundle.files),
            },
        )
        await self._set_state(session, ENGINEER_ROLE, AgentState.WAITING)

    async def _stage_publish(self, session: _RunSession) -> None:
        ceo = session.agents[CEO_ROLE]
        assert isinstance(ceo, CEOAgent) and session.plan is not None
        await self._set_state(session, CEO_ROLE, AgentState.WORKING)
        deliverables = [t.title for t in session.graph.tasks()]
        text, source = await ceo.summarize(session.project, session.plan, deliverables)
        await self._emit(
            session, EventType.PROJECT_PUBLISHED, ceo.name,
            {"summary": text, "source": source},
        )
        await self._set_state(session, CEO_ROLE, AgentState.COMPLETE)

    # ----------------------------------------------------------- review loop
    async def _stage_review(
        self,
        session: _RunSession,
        reviewer_role: str,
        producer_role: str,
        deliverable_title: str,
        review_label: str,
    ) -> None:
        """Run a bounded review loop on one deliverable.

        Generic over (reviewer, producer, deliverable) so Security/Architecture
        and QA/Implementation share exactly the same logic (no duplication).
        """
        reviewer = session.agents[reviewer_role]
        assert isinstance(reviewer, ReviewerAgent)
        task = session.task_by_title[deliverable_title]
        revision = task.revision

        while True:
            await self._set_state(session, reviewer_role, AgentState.REVIEWING)
            content = session.artifacts[deliverable_title]
            outcome = await reviewer.review(review_label, content, session.project, revision)
            session.reviews.append(outcome)

            if outcome.verdict is ReviewVerdict.APPROVED:
                await session.messages.approve(
                    reviewer_role, review_label, producer_role, outcome.comments
                )
                break

            await session.messages.reject(
                reviewer_role, review_label, producer_role, outcome.comments, outcome.issues
            )
            revision += 1
            if revision > MAX_REVISIONS:
                await session.messages.escalate_to_ceo(
                    reviewer_role,
                    f"'{review_label}' still failing after {MAX_REVISIONS} revisions.",
                )
                await self._set_state(session, CEO_ROLE, AgentState.REVIEWING)
                await session.messages.approve(
                    CEO_ROLE, review_label, producer_role,
                    "CEO override to unblock delivery; residual risk accepted with follow-up.",
                )
                await self._set_state(session, CEO_ROLE, AgentState.COMPLETE)
                break

            await self._revise(session, producer_role, deliverable_title,
                               reviewer_role, outcome, revision)

        task.revision = revision

    async def _revise(
        self,
        session: _RunSession,
        producer_role: str,
        deliverable_title: str,
        reviewer_role: str,
        outcome: ReviewOutcome,
        revision: int,
    ) -> None:
        producer = session.agents[producer_role]
        assert isinstance(producer, WorkerAgent)
        task = session.task_by_title[deliverable_title]
        reviewer_name = session.agents[reviewer_role].name

        await self._set_state(session, producer_role, AgentState.WORKING, task.id)
        await self._emit(
            session, EventType.REVISION_REQUESTED, reviewer_name,
            {"target": deliverable_title, "revision": revision, "issues": outcome.issues},
        )
        feedback = outcome.comments
        if outcome.issues:
            feedback += " Issues: " + "; ".join(outcome.issues)
        artifact = await producer.revise(deliverable_title, feedback, session.project, revision)
        session.artifacts[deliverable_title] = artifact.content
        task.artifact = artifact
        await self._emit(
            session, EventType.ARTIFACT_PRODUCED, producer.name,
            {
                "task_id": task.id,
                "title": deliverable_title,
                "type": artifact.type,
                "revision": revision,
                "content_preview": artifact.content[:160],
                "content": artifact.content,
                "owner_role": producer.role,
            },
        )
        await self._set_state(session, producer_role, AgentState.WAITING)
        await session.messages.request_review(producer_role, reviewer_role, deliverable_title)

    # ----------------------------------------------------------- helpers
    def _build_tasks(self, session: _RunSession) -> None:
        """Convert the plan's deliverables into tasks (record + dependency chain)."""
        assert session.plan is not None
        prev_id: str | None = None
        for deliverable in session.plan.deliverables:
            task = Task(
                id=f"task-{deliverable.title.lower().replace(' ', '_')}",
                title=deliverable.title,
                type=deliverable.type,
                owner_role=deliverable.owner_role,
                phase=deliverable.title,
                depends_on=[prev_id] if prev_id else [],
            )
            session.graph.add_task(task)
            session.task_by_title[task.title] = task
            prev_id = task.id
        session.graph.validate()

    async def _produce(self, session: _RunSession, role: str, title: str) -> Artifact:
        """Produce a deliverable via its agent and record the task + events."""
        agent = session.agents[role]
        assert isinstance(agent, WorkerAgent)
        task = session.task_by_title[title]

        session.graph.mark_running(task.id)
        await self._set_state(session, role, AgentState.WORKING, task.id)
        await self._emit(session, EventType.TASK_STARTED, agent.name,
                         {"task_id": task.id, "title": title})

        artifact = agent.perform_task(title, session.project)
        session.artifacts[title] = artifact.content
        task.artifact = artifact
        session.graph.mark_completed(task.id)
        session.agent_states[role].completed_tasks.append(task.id)

        await self._emit(
            session, EventType.ARTIFACT_PRODUCED, agent.name,
            {"task_id": task.id, "title": artifact.title, "type": artifact.type,
             "content_preview": artifact.content[:160],
             "content": artifact.content,
             "owner_role": agent.role},
        )
        # Stream a short reasoning trace as tokens for demo visibility.
        # No-op when LLM disabled or streaming fails; never blocks the run.
        await self._stream_reasoning_trace(session, agent, artifact.title)
        await self._emit(session, EventType.TASK_COMPLETED, agent.name, {"task_id": task.id})
        return artifact

    async def _stream_reasoning_trace(
        self,
        session: "_RunSession",
        agent: "WorkerAgent",
        deliverable_title: str,
    ) -> None:
        """Stream a short reasoning trace token-by-token as ARTIFACT_TOKEN events.

        Additive to the run: if the LLM is disabled or the SSE stream fails,
        this is a silent no-op. The purpose is a "watch it think" demo moment
        where tokens land visibly in the UI immediately after an artifact
        completes. Traces are capped at 200 tokens so they never dominate.
        """
        if not self._llm.enabled:
            return
        system = (
            f"{agent.system_prompt}\n\n"
            "You have just finished the deliverable above. In 2 or 3 short "
            "sentences (under 60 words TOTAL), share your reasoning about the "
            "biggest decision you made and why. First person. No preamble."
        )
        user = (
            f"You just shipped: {deliverable_title}\n"
            "Explain the biggest decision behind it and why you made it."
        )
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        try:
            trace_seq = 0
            async for piece in self._llm.stream_chat(
                messages, temperature=0.5, max_tokens=200
            ):
                trace_seq += 1
                await self._emit(
                    session,
                    EventType.ARTIFACT_TOKEN,
                    agent.name,
                    {
                        "title": deliverable_title,
                        "owner_role": agent.role,
                        "delta": piece,
                        "seq_in_artifact": trace_seq,
                    },
                )
                if trace_seq >= 200:
                    # Safety guard against runaway streams.
                    break
        except LLMError as exc:
            # Non-fatal: streaming is a demo enhancement, not a requirement.
            logger.info(
                "Reasoning trace stream failed for %s (%s); skipping trace.",
                deliverable_title,
                exc,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Unexpected error in reasoning trace stream for %s: %s",
                deliverable_title,
                exc,
            )

    async def _set_state(
        self,
        session: _RunSession,
        role: str,
        state: AgentState,
        current_task: str | None = None,
    ) -> None:
        agent = session.agents[role]
        agent.set_state(state)
        rt = session.agent_states[role]
        rt.status = state
        rt.current_task = current_task
        await self._emit(
            session, EventType.AGENT_STATE_CHANGED, agent.name,
            {"role": role, "status": state.value, "current_task": current_task},
        )

    def _emitter(self, session: _RunSession) -> EmitFn:
        async def emit(event_type: EventType, actor: str | None, payload: dict) -> OrchestrationEvent:
            return await self._emit(session, event_type, actor, payload)
        return emit

    async def _emit(
        self,
        session: _RunSession,
        event_type: EventType,
        actor: str | None,
        payload: dict,
    ) -> OrchestrationEvent:
        event = OrchestrationEvent(
            seq=session.next_seq(),
            type=event_type,
            timestamp=datetime.now(timezone.utc),
            actor=actor,
            payload=payload,
        )
        await session.bus.publish(event)
        return event
