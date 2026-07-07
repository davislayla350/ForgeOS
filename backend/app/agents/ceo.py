"""CEOAgent -- produces the structured project plan.

The CEO is the one agent that builds a ``ProjectPlan`` rather than a document.
It composes the plan from the *rest of the registered crew*: milestones and
deliverables are derived from each downstream agent's ``phase`` and ``produces``.
That means adding a new worker agent automatically extends the CEO's plan with
no edits here.

The plan is written into shared memory under ("company", "plan") so downstream
agents and the orchestrator can read it.
"""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from app.agents.base import BaseAgent
from app.services.qwen_client import LLMError, LLMParseError
from app.agents.registry import build_roster, get_ordered_agent_classes, register_agent
from app.models.domain import (
    AgentResponse,
    Deliverable,
    DeliverableSpec,
    KeyResult,
    Milestone,
    Objective,
    ProjectPlan,
    Risk,
    TeamMember,
)

_CEO_SYSTEM_PROMPT = (
    "You are Aria Chen, CEO of an autonomous software company.\n"
    "\n"
    "VOICE\n"
    "  Strategic, concise, executive. You talk in outcomes, not tactics. "
    "Every sentence earns its place. You care about the metric that decides "
    "whether the quarter was a good one. You do not fill space; when you "
    "have nothing to add, you say so.\n"
    "\n"
    "STYLE\n"
    "  Short declaratives. Frame decisions around scope, cost, and time to "
    "value. Avoid adjectives that don't move the plan. No hedging.\n"
    "\n"
    "TASK\n"
    "  Given a one-line project idea, return a SINGLE JSON object (no prose, "
    "no fences) with keys: company_name, mission, vision, objectives "
    "([{objective, key_results:[{description, target}]}]), risks "
    "([{risk, severity:'low'|'medium'|'high', mitigation}]), success_metrics "
    "([string]), recommended_stack ([string])."
)


@register_agent
class CEOAgent(BaseAgent):
    """Owns the company charter and the top-level project plan."""

    role = "CEO"
    name = "Aria Chen"
    initials = "AC"
    employee_id = "1"
    order = 1
    phase = "Kickoff"
    phase_label = "Company launch initiated"
    responsibility = "Sets mission, scope, and OKRs; approves the company charter."
    system_prompt = _CEO_SYSTEM_PROMPT
    available_tools = ["charter_writer", "okr_planner"]
    memory_scope = "company"
    produces: list[DeliverableSpec] = []  # the CEO produces the plan, not a card

    # ------------------------------------------------------- deterministic
    def _respond_deterministically(self, project: str) -> AgentResponse:
        plan = self._build_plan(project, source="deterministic")
        return self._finalise(project, plan)

    # --------------------------------------------------------------- LLM
    def _llm_schema_hint(self) -> str:
        """CEO's planning schema. Names each field ``_plan_from_payload`` uses."""
        return (
            "{\n"
            '  "company_name": "<short brand name>",\n'
            '  "mission": "<one sentence mission>",\n'
            '  "vision": "<one sentence vision>",\n'
            '  "success_metrics": ["<metric>", "..."],\n'
            '  "recommended_stack": ["<technology>", "..."],\n'
            '  "objectives": [\n'
            '    {"title": "<objective>", "key_results": ['
            '{"description": "<KR>", "target": "<value>"}]}\n'
            "  ],\n"
            '  "risks": [{"title": "<risk>", "mitigation": "<plan>"}]\n'
            "}"
        )

    def _on_llm_payload(self, payload: dict[str, Any], project: str) -> AgentResponse:
        plan = self._plan_from_payload(payload, project)
        return self._finalise(project, plan)

    # --------------------------------------------------------- internals
    def _finalise(self, project: str, plan: ProjectPlan) -> AgentResponse:
        """Persist the plan to shared memory and emit the charter artifact."""
        self.memory.remember("plan", plan.model_dump())
        charter = self.tools.use("charter_writer", project=project)
        self.tools.use("okr_planner", project=project)
        artifact = self._artifact(
            DeliverableSpec(title="Company Charter", type="Charter"), charter
        )
        summary = f"Chartered {plan.company_name} and set OKRs for: {project}"
        return self._response(summary, [artifact], plan.plan_source)

    async def summarize(
        self, project: str, plan: ProjectPlan, deliverables: list[str]
    ) -> tuple[str, str]:
        """Publish a final project summary. Returns (text, source).

        Uses the LLM when available; otherwise composes a deterministic summary
        from the plan and the list of completed deliverables.
        """
        if self.llm.enabled:
            try:
                payload = await self._llm_json(
                    self.system_prompt,
                    (
                        f"Project: {project}\n"
                        f"Company: {plan.company_name}\n"
                        f"Completed deliverables: {', '.join(deliverables)}\n"
                        "Write a short executive summary announcing the release."
                    ),
                    schema_hint=(
                        '{"summary": "<two to four sentence release announcement>"}'
                    ),
                    max_tokens=600,
                )
                text = payload.get("summary")
                if isinstance(text, str) and text.strip():
                    return text, "llm"
                self.logger.warning(
                    "LLM summary: 'summary' missing or empty; using deterministic."
                )
            except LLMParseError as exc:
                self.logger.warning(
                    "LLM summary content unparseable (%s); using deterministic.", exc
                )
            except (LLMError, ValueError) as exc:
                self.logger.warning("LLM summary failed (%s); using deterministic.", exc)

        text = (
            f"{plan.company_name} has completed {project}. All {len(deliverables)} "
            f"deliverables are done ({', '.join(deliverables)}), the security review "
            "passed, and the deployment plan is approved. The release is ready to ship."
        )
        return text, "deterministic"

    def _crew(self) -> list[type[BaseAgent]]:
        """All registered agents except the CEO, in execution order."""
        return [c for c in get_ordered_agent_classes() if c.role != self.role]

    def _build_plan(self, project: str, *, source: str) -> ProjectPlan:
        """Compose a plan from the registered crew (single source of truth)."""
        crew = self._crew()

        milestones = [
            Milestone(
                phase=self.phase,
                label=self.phase_label,
                owner_role=self.role,
                deliverable=None,
            )
        ]
        deliverables: list[Deliverable] = []
        for cls in crew:
            first_title = cls.produces[0].title if cls.produces else None
            milestones.append(
                Milestone(
                    phase=cls.phase,
                    label=cls.phase_label,
                    owner_role=cls.role,
                    deliverable=first_title,
                )
            )
            for spec in cls.produces:
                deliverables.append(
                    Deliverable(title=spec.title, type=spec.type, owner_role=cls.role)
                )

        team = [
            TeamMember(id=p.id, name=p.name, role=p.role, responsibility=p.responsibility)
            for p in build_roster()
        ]

        return ProjectPlan(
            project=project,
            company_name=self._derive_company_name(project),
            mission=f"Design, build, and ship {project} to a production-ready state.",
            vision=(
                f"Become the most reliable team delivering {project}, with quality "
                "and security built in from day one."
            ),
            objectives=[
                Objective(
                    objective="Ship a production-ready first release",
                    key_results=[
                        KeyResult(
                            description="Complete all phase deliverables",
                            target=f"{len(deliverables)}/{len(deliverables)} at 100%",
                        ),
                        KeyResult(
                            description="Pass the security review",
                            target="0 critical findings",
                        ),
                    ],
                ),
                Objective(
                    objective="Establish engineering quality gates",
                    key_results=[
                        KeyResult(
                            description="Author and execute a test plan",
                            target="Core flows covered by tests",
                        ),
                        KeyResult(
                            description="Automate deployment",
                            target="One-command, repeatable deploy",
                        ),
                    ],
                ),
            ],
            team=team,
            milestones=milestones,
            deliverables=deliverables,
            risks=[
                Risk(
                    risk="Scope creep beyond the first release",
                    severity="medium",
                    mitigation="Lock the PRD and defer extras to a backlog.",
                ),
                Risk(
                    risk="Security gaps found late",
                    severity="high",
                    mitigation="Run the threat model before build sign-off.",
                ),
                Risk(
                    risk="Manual, error-prone deploys",
                    severity="medium",
                    mitigation="Automate the pipeline in the Deploy phase.",
                ),
            ],
            success_metrics=[
                "All deliverables reach 100%",
                "Security review passes with no critical findings",
                "Deployment pipeline runs end to end",
            ],
            recommended_stack=self._recommend_stack(project),
            plan_source=source,  # type: ignore[arg-type]
        )

    def _plan_from_payload(self, payload: dict[str, Any], project: str) -> ProjectPlan:
        """Start from the crew-derived plan, overlay valid LLM creative fields."""
        plan = self._build_plan(project, source="llm")

        if isinstance(payload.get("company_name"), str):
            plan.company_name = payload["company_name"]
        if isinstance(payload.get("mission"), str):
            plan.mission = payload["mission"]
        if isinstance(payload.get("vision"), str):
            plan.vision = payload["vision"]
        if isinstance(payload.get("success_metrics"), list):
            plan.success_metrics = [str(m) for m in payload["success_metrics"]]
        if isinstance(payload.get("recommended_stack"), list):
            plan.recommended_stack = [str(s) for s in payload["recommended_stack"]]

        # Optional structured fields; keep deterministic values on any error.
        try:
            if isinstance(payload.get("objectives"), list):
                plan.objectives = [
                    Objective.model_validate(o) for o in payload["objectives"]
                ]
            if isinstance(payload.get("risks"), list):
                plan.risks = [Risk.model_validate(r) for r in payload["risks"]]
        except ValidationError as exc:
            self.logger.warning("Ignoring malformed LLM plan fields: %s", exc)

        return plan

    # ----------------------------------------------------------- helpers
    @staticmethod
    def _derive_company_name(project: str) -> str:
        words = [w for w in project.replace("-", " ").split() if w.isalpha()]
        stop = {"a", "an", "the", "build", "create", "make", "app", "for", "to", "of"}
        keywords = [w.capitalize() for w in words if w.lower() not in stop]
        core = keywords[0] if keywords else "Forge"
        return f"{core} Labs"

    @staticmethod
    def _recommend_stack(project: str) -> list[str]:
        lowered = project.lower()
        stack = ["Python 3.12", "FastAPI", "PostgreSQL", "Docker"]
        if any(k in lowered for k in ("web", "app", "dashboard", "budget", "site")):
            stack.append("Next.js")
        if any(k in lowered for k in ("ai", "agent", "ml", "model", "chat")):
            stack.append("OpenAI-compatible LLM API")
        return stack
