"""Orchestration schemas: the frontend-facing projection.

These models mirror ``orchestration-types.ts`` in the frontend **exactly**,
including the camelCase JSON keys (``employeeId``, ``docType``). The Pydantic
field names stay snake_case for clean Python, but every model serialises with
``by_alias=True`` so the JSON the UI receives matches its TypeScript union
without any transformation on the client.

The existing ``useOrchestration`` hook can be switched from its hardcoded
``ORCHESTRATION_STEPS`` to this payload with only an import change.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

# Shared config: allow population by Python name, emit camelCase via aliases.
_StepConfig = ConfigDict(populate_by_name=True)


class _BaseStep(BaseModel):
    model_config = _StepConfig
    at: int = Field(..., description="Milliseconds from launch when this step fires.")


class ActivateStep(_BaseStep):
    type: Literal["activate"] = "activate"
    employee_id: str = Field(..., alias="employeeId")


class DeactivateStep(_BaseStep):
    type: Literal["deactivate"] = "deactivate"
    employee_id: str = Field(..., alias="employeeId")


class ActivityStep(_BaseStep):
    type: Literal["activity"] = "activity"
    agent: str
    action: str


class TimelineStep(_BaseStep):
    type: Literal["timeline"] = "timeline"
    phase: str
    label: str


class DeliverableStep(_BaseStep):
    type: Literal["deliverable"] = "deliverable"
    title: str
    doc_type: str = Field(..., alias="docType")


class DeliverableProgressStep(_BaseStep):
    type: Literal["deliverable-progress"] = "deliverable-progress"
    title: str
    progress: int


class CompleteStep(_BaseStep):
    type: Literal["complete"] = "complete"


# Discriminated union keyed on the literal ``type`` field.
OrchestrationStep = Annotated[
    Union[
        ActivateStep,
        DeactivateStep,
        ActivityStep,
        TimelineStep,
        DeliverableStep,
        DeliverableProgressStep,
        CompleteStep,
    ],
    Field(discriminator="type"),
]


class EmployeeView(BaseModel):
    """Employee shape the UI expects (mirrors AIEmployee in constants.ts)."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    role: str
    initials: str
    status: Literal["active", "idle", "offline"] = "offline"


class OrchestrationPayload(BaseModel):
    """Everything the frontend needs to drive the live dashboard."""

    model_config = ConfigDict(populate_by_name=True)

    project_idea: str = Field(..., alias="projectIdea")
    duration_ms: int = Field(..., alias="durationMs")
    employees: list[EmployeeView]
    steps: list[OrchestrationStep]
