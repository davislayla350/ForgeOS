"""Outbound response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.domain import AgentResponse, ProjectPlan
from app.schemas.orchestration import OrchestrationPayload


class LaunchResponse(BaseModel):
    """Response body for ``POST /launch``.

    Carries two views of the same result:
      * ``plan``           -- the CEO's structured project plan (the spec ask).
      * ``orchestration``  -- a projection of that plan onto the frontend's
                              exact orchestration format, ready to render.
    """

    status: str = Field(default="ok")
    run_id: str = Field(..., description="Unique id for this launch, stored in memory.")
    llm_enabled: bool = Field(
        ...,
        description="True when a Qwen API key is configured and used; "
        "false when the deterministic planner produced the result.",
    )
    plan: ProjectPlan
    orchestration: OrchestrationPayload
    agents: list[AgentResponse] = Field(
        default_factory=list,
        description="Per-agent results in execution order (CEO first).",
    )


class HealthResponse(BaseModel):
    """Response body for ``GET /health``."""

    status: str = "ok"
    app_env: str
    llm_enabled: bool
