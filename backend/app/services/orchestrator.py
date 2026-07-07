"""Orchestrator -- coordinates the agent crew and assembles the launch result.

Responsibilities (only these):
  1. Build a shared ``RunContext`` for the launch.
  2. Instantiate every registered agent (in order), each composed with its own
     ``ScopedMemory`` and ``ToolBelt``, and run them in sequence.
  3. Read the CEO's plan from shared memory.
  4. Project the agents' responses into the frontend orchestration format.
  5. Persist the run and return the API response.

Because the crew comes from the registry, adding an agent class changes the
pipeline with no edits here.
"""

from __future__ import annotations

import uuid

# Importing the agents package registers every concrete agent.
import app.agents  # noqa: F401
from app.agents.registry import (
    AGENT_REGISTRY,
    build_roster,
    employee_by_role,
    get_ordered_agent_classes,
)
from app.agents.tools import ToolBelt, ToolRegistry
from app.config import get_logger
from app.memory.store import RunContext, RunMemory, ScopedMemory
from app.models.domain import AgentResponse, ProjectPlan
from app.schemas.orchestration import (
    ActivateStep,
    ActivityStep,
    CompleteStep,
    DeactivateStep,
    DeliverableProgressStep,
    DeliverableStep,
    EmployeeView,
    OrchestrationPayload,
    OrchestrationStep,
    TimelineStep,
)
from app.schemas.responses import LaunchResponse
from app.services.qwen_client import QwenClient

logger = get_logger(__name__)

_DURATION_MS = 15_000  # mirrors the frontend ORCHESTRATION_DURATION_MS


class Orchestrator:
    """Runs the agent crew and builds the launch response."""

    def __init__(
        self, llm: QwenClient, memory: RunMemory, tools: ToolRegistry
    ) -> None:
        self._llm = llm
        self._memory = memory
        self._tools = tools
        # Spread the agents across the duration budget for step pacing.
        self._slot_ms = max(1, _DURATION_MS // max(1, len(AGENT_REGISTRY)))

    async def launch(self, project: str) -> LaunchResponse:
        """Run the crew end to end and return plan + orchestration."""
        run_id = uuid.uuid4().hex
        logger.info("Launch %s requested: %s", run_id, project)

        context = RunContext()
        responses: list[AgentResponse] = []

        for agent_cls in get_ordered_agent_classes():
            agent = agent_cls(
                self._llm,
                ScopedMemory(context, agent_cls.memory_scope),
                ToolBelt(self._tools, agent_cls.available_tools),
            )
            response = await agent.generate_response(project)
            responses.append(response)

        plan_dict = context.read("company", "plan")
        if plan_dict is None:
            raise RuntimeError("CEO agent did not produce a plan.")
        plan = ProjectPlan.model_validate(plan_dict)

        orchestration = self._project_to_orchestration(project, responses)

        await self._memory.save(
            run_id=run_id,
            project=project,
            plan=plan,
            llm_enabled=plan.plan_source == "llm",
        )

        logger.info(
            "Launch %s complete (source=%s, %d agents, %d steps)",
            run_id,
            plan.plan_source,
            len(responses),
            len(orchestration.steps),
        )
        return LaunchResponse(
            run_id=run_id,
            llm_enabled=plan.plan_source == "llm",
            plan=plan,
            orchestration=orchestration,
            agents=responses,
        )

    # ----------------------------------------------------- projection
    def _project_to_orchestration(
        self, project: str, responses: list[AgentResponse]
    ) -> OrchestrationPayload:
        """Turn the ordered agent responses into a timed frontend step script."""
        employees = [
            EmployeeView(
                id=p.id, name=p.name, role=p.role, initials=p.initials, status="offline"
            )
            for p in build_roster()
        ]

        steps: list[OrchestrationStep] = []
        clock = 0
        prev_id: str | None = None

        for response in responses:
            emp = employee_by_role(response.role)
            if emp is None:
                continue
            cls = AGENT_REGISTRY.get(response.role)
            timeline_label = cls.phase_label if cls else response.phase

            base = clock
            steps.append(ActivateStep(employee_id=emp.id, at=base))
            if prev_id is not None:
                steps.append(DeactivateStep(employee_id=prev_id, at=base + 200))
            steps.append(
                ActivityStep(agent=response.name, action=response.summary, at=base + 400)
            )
            steps.append(
                TimelineStep(phase=response.phase, label=timeline_label, at=base + 600)
            )

            # The CEO's charter is not a deliverable card; workers' artifacts are.
            if response.role != "CEO":
                offset = 800
                for art in response.artifacts:
                    steps.append(
                        DeliverableStep(title=art.title, doc_type=art.type, at=base + offset)
                    )
                    steps.append(
                        DeliverableProgressStep(
                            title=art.title, progress=100, at=base + offset + 600
                        )
                    )
                    offset += 900

            prev_id = emp.id
            clock = base + self._slot_ms

        final_at = min(max(clock, 0), _DURATION_MS)
        if prev_id is not None:
            steps.append(DeactivateStep(employee_id=prev_id, at=final_at - 200))
        steps.append(
            TimelineStep(
                phase="Complete", label="All deliverables generated", at=final_at - 100
            )
        )
        steps.append(CompleteStep(at=final_at))

        return OrchestrationPayload(
            project_idea=project,
            duration_ms=_DURATION_MS,
            employees=employees,
            steps=steps,
        )
