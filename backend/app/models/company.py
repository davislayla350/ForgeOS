"""Domain models for the CompanyOrchestrator engine.

These describe the runtime objects the orchestrator produces: tasks, the live
state of each agent, inter-agent messages, review outcomes, and the ordered
event log (the timeline). Everything is JSON-serialisable via
``model_dump(mode="json")`` so a websocket can stream events without extra
transformation.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.domain import Artifact, ProjectPlan


class TaskStatus(str, Enum):
    """Lifecycle of a single task."""

    PENDING = "pending"      # created, dependencies not yet satisfied
    RUNNING = "running"      # currently being executed by its agent
    COMPLETED = "completed"  # finished, artifact produced


class AgentState(str, Enum):
    """The lifecycle states an agent moves through during a run."""

    IDLE = "idle"            # not yet engaged
    WORKING = "working"      # producing a deliverable
    WAITING = "waiting"      # blocked on another agent (e.g. awaiting review)
    REVIEWING = "reviewing"  # reviewing a peer's artifact
    BLOCKED = "blocked"      # cannot proceed (e.g. rejected, awaiting revision)
    COMPLETE = "complete"    # finished all its work


class ReviewVerdict(str, Enum):
    """A reviewer's decision on an artifact."""

    APPROVED = "approved"
    REJECTED = "rejected"


class EventType(str, Enum):
    """Every kind of event the orchestrator emits onto the timeline.

    The first block is the original engine vocabulary (kept for compatibility);
    the second block adds the review/messaging protocol.
    """

    RUN_STARTED = "run_started"
    MEMORY_SEEDED = "memory_seeded"
    PLAN_CREATED = "plan_created"
    ARTIFACT_TOKEN = "artifact_token"
    TASK_CREATED = "task_created"
    TASK_ASSIGNED = "task_assigned"
    TASK_STARTED = "task_started"
    ARTIFACT_PRODUCED = "artifact_produced"
    TASK_COMPLETED = "task_completed"
    AGENT_STATE_CHANGED = "agent_state_changed"
    AGENT_MESSAGE = "agent_message"
    RUN_COMPLETED = "run_completed"
    CODE_BUNDLE_GENERATED = "code_bundle_generated"
    # --- review / collaboration protocol ---
    REVIEW_REQUESTED = "review_requested"
    REVIEW_APPROVED = "review_approved"
    REVIEW_REJECTED = "review_rejected"
    REVISION_REQUESTED = "revision_requested"
    ESCALATED = "escalated"
    PROJECT_PUBLISHED = "project_published"


class Task(BaseModel):
    """A unit of work derived from the plan and owned by one agent."""

    id: str
    title: str
    type: str
    owner_role: str
    phase: str
    depends_on: list[str] = Field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    revision: int = 0
    artifact: Artifact | None = None


class AgentRuntimeState(BaseModel):
    """The live state of one agent during a run."""

    role: str
    name: str
    status: AgentState = AgentState.IDLE
    current_task: str | None = None
    completed_tasks: list[str] = Field(default_factory=list)


class AgentMessage(BaseModel):
    """A message from one agent to another (or to all, when recipient='*')."""

    id: str
    sender: str
    recipient: str
    content: str
    timestamp: datetime


class ReviewOutcome(BaseModel):
    """The result of a reviewer evaluating an artifact."""

    reviewer: str
    target: str
    verdict: ReviewVerdict
    comments: str
    issues: list[str] = Field(default_factory=list)
    revision: int = 0
    source: Literal["llm", "deterministic"] = "deterministic"


class OrchestrationEvent(BaseModel):
    """A single timeline event. The full ordered list is the run timeline."""

    seq: int
    type: EventType
    timestamp: datetime
    actor: str | None = None  # role/name that caused it, or "system"
    payload: dict[str, Any] = Field(default_factory=dict)


class GeneratedCodeFile(BaseModel):
    """A single starter source file produced by the Engineer.

    Fields are the minimum a syntax-highlighted viewer needs: the file's
    path (relative to a hypothetical project root), a coarse language tag
    ('tsx' | 'ts' | 'sql' | 'markdown' | 'python' | ...), and the content
    itself. Content is not markdown-fenced -- the viewer wraps it based on
    the language tag.
    """

    path: str
    language: str
    content: str
    source: Literal["llm", "deterministic"] = "deterministic"


class CodeBundle(BaseModel):
    """A collection of generated starter files, plus a note on origin.

    ``source`` reports where the bundle came from:
      * 'llm'          -- every file was accepted from the model
      * 'deterministic'-- every file is templated (fallback path)
      * 'hybrid'       -- some files from model, some from templates
    """

    files: list[GeneratedCodeFile] = Field(default_factory=list)
    source: Literal["llm", "deterministic", "hybrid"] = "deterministic"


class CompanyRunResult(BaseModel):
    """The structured result of a full run (plan + final state + timeline)."""

    run_id: str
    project: str
    plan: ProjectPlan
    tasks: list[Task]
    agents: list[AgentRuntimeState]
    messages: list[AgentMessage]
    reviews: list[ReviewOutcome] = Field(default_factory=list)
    events: list[OrchestrationEvent]
    code_bundle: CodeBundle | None = None
