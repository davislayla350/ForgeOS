"""Domain models.

These describe the *business* objects ForgeOS reasons about, independent of any
transport or frontend concern. Centrepieces:
  * ``ProjectPlan``   -- the CEO's structured plan for a project.
  * ``AgentResponse`` -- the uniform result every agent returns from
                          ``generate_response``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["low", "medium", "high"]


class KeyResult(BaseModel):
    """A single measurable key result under an objective."""

    description: str
    target: str


class Objective(BaseModel):
    """An OKR-style objective with its key results."""

    objective: str
    key_results: list[KeyResult] = Field(default_factory=list)


class TeamMember(BaseModel):
    """An AI employee assigned to the project, mapped to a company role."""

    id: str
    name: str
    role: str
    responsibility: str


class Milestone(BaseModel):
    """A phase of execution owned by one role, optionally producing a deliverable."""

    phase: str
    label: str
    owner_role: str
    deliverable: str | None = None


class Deliverable(BaseModel):
    """A concrete artifact the company plans to produce (plan-level, no content)."""

    title: str
    type: str
    owner_role: str


class Risk(BaseModel):
    """An identified project risk with a mitigation."""

    risk: str
    severity: Severity = "medium"
    mitigation: str


class ProjectPlan(BaseModel):
    """The CEO agent's structured plan for a project."""

    project: str
    company_name: str
    mission: str
    vision: str
    objectives: list[Objective] = Field(default_factory=list)
    team: list[TeamMember] = Field(default_factory=list)
    milestones: list[Milestone] = Field(default_factory=list)
    deliverables: list[Deliverable] = Field(default_factory=list)
    risks: list[Risk] = Field(default_factory=list)
    success_metrics: list[str] = Field(default_factory=list)
    recommended_stack: list[str] = Field(default_factory=list)
    plan_source: Literal["llm", "deterministic"] = "deterministic"


# --- Agent I/O ---------------------------------------------------------------


class DeliverableSpec(BaseModel):
    """Declares a deliverable an agent produces (title + type, no content)."""

    title: str
    type: str


class Artifact(BaseModel):
    """A produced artifact with real content (output of a tool)."""

    title: str
    type: str
    owner_role: str
    content: str


class AgentResponse(BaseModel):
    """The uniform output every agent returns from ``generate_response``."""

    role: str
    name: str
    phase: str
    summary: str
    source: Literal["llm", "deterministic"]
    tool_calls: list[str] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
