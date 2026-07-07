"""Agent tools (composition layer).

Agents do not hardcode how their artifacts are produced; they *compose* tools.
A ``ToolBelt`` is handed to each agent at construction time and only exposes the
tools that agent's ``available_tools`` whitelist allows. Calling a tool outside
the whitelist is rejected -- the belt enforces each agent's capability boundary.

Tools are deliberately deterministic content generators so the system produces
real, structured artifacts with no LLM and no placeholder text.
"""

from __future__ import annotations

from typing import Any, Callable

ToolFn = Callable[..., str]


def _project_title(project: str) -> str:
    return project.strip().rstrip(".")


def charter_writer(*, project: str, **_: Any) -> str:
    """Produce a short company charter."""
    p = _project_title(project)
    return (
        f"# Company Charter\n\n"
        f"Mission: deliver {p} to a production-ready state.\n"
        f"Operating model: autonomous agents collaborating in sequence "
        f"(Product -> Engineering -> Security -> QA -> DevOps).\n"
        f"Definition of done: all phase deliverables at 100%, security review "
        f"passed, deployment automated."
    )


def okr_planner(*, project: str, **_: Any) -> str:
    """Produce a compact OKR summary."""
    p = _project_title(project)
    return (
        f"# OKRs\n\n"
        f"O1: Ship a production-ready first release of {p}.\n"
        f"  KR1: 6/6 deliverables complete.\n"
        f"  KR2: 0 critical security findings.\n"
        f"O2: Establish engineering quality gates.\n"
        f"  KR1: core flows covered by tests.\n"
        f"  KR2: one-command repeatable deploy."
    )


def document_writer(*, project: str, plan: dict[str, Any] | None = None, **_: Any) -> str:
    """Produce a product requirements document (PRD)."""
    p = _project_title(project)
    return (
        f"# Product Requirements Document\n\n"
        f"## Overview\n{p}.\n\n"
        f"## Goals\n- Solve the core user problem with a focused first release.\n"
        f"- Keep scope tight; defer extras to a backlog.\n\n"
        f"## In scope\n- Core user flows for {p}.\n- Basic accounts and data persistence.\n\n"
        f"## Out of scope (v1)\n- Advanced analytics, integrations, theming.\n\n"
        f"## Acceptance\n- Each core flow is demoable end to end."
    )


def architecture_designer(*, project: str, plan: dict[str, Any] | None = None, **_: Any) -> str:
    """Produce a system architecture blueprint."""
    stack = ", ".join((plan or {}).get("recommended_stack", []) or ["FastAPI", "PostgreSQL", "Docker"])
    return (
        f"# System Architecture\n\n"
        f"## Style\nModular service with clear separation of concerns "
        f"(API, services, data).\n\n"
        f"## Components\n- API layer (HTTP, validation).\n"
        f"- Service layer (business logic).\n"
        f"- Data layer (persistence).\n\n"
        f"## Recommended stack\n{stack}.\n\n"
        f"## Non-functionals\nStateless services, horizontal scaling, "
        f"observability via structured logs."
    )


def api_spec_writer(*, project: str, plan: dict[str, Any] | None = None, **_: Any) -> str:
    """Produce an API specification outline."""
    return (
        f"# API Specification\n\n"
        f"## Conventions\nJSON over HTTPS, RESTful resources, problem+json errors.\n\n"
        f"## Endpoints (v1)\n"
        f"- POST /resources  -> create\n"
        f"- GET  /resources  -> list\n"
        f"- GET  /resources/{{id}} -> read\n"
        f"- PATCH /resources/{{id}} -> update\n"
        f"- DELETE /resources/{{id}} -> delete\n\n"
        f"## Auth\nBearer token; per-route scopes."
    )


def threat_modeler(*, project: str, **_: Any) -> str:
    """Produce a security review via a STRIDE-style pass."""
    return (
        f"# Security Review\n\n"
        f"## Method\nSTRIDE threat model over the system boundaries.\n\n"
        f"## Findings\n"
        f"- Spoofing: enforce authentication on all write routes.\n"
        f"- Tampering: validate and sanitize all input (Pydantic).\n"
        f"- Repudiation: structured audit logging.\n"
        f"- Information disclosure: least-privilege data access, TLS in transit.\n"
        f"- Denial of service: rate limiting at the edge.\n"
        f"- Elevation of privilege: per-route scopes, deny by default.\n\n"
        f"## Verdict\nNo critical findings; recommendations tracked."
    )


def test_planner(*, project: str, **_: Any) -> str:
    """Produce a QA test plan."""
    return (
        f"# Test Plan\n\n"
        f"## Levels\n- Unit: services and validators.\n"
        f"- Integration: API endpoints against a test datastore.\n"
        f"- E2E: core user flows.\n\n"
        f"## Gates\n- All tests green before deploy.\n"
        f"- Critical flows have explicit coverage.\n\n"
        f"## Exit criteria\nNo open critical or high defects."
    )


def pipeline_provisioner(*, project: str, **_: Any) -> str:
    """Produce a deployment plan."""
    return (
        f"# Deployment Plan\n\n"
        f"## Build\nContainerize with Docker; pin dependencies.\n\n"
        f"## Pipeline\nlint -> test -> build image -> push -> deploy.\n\n"
        f"## Runtime\nUvicorn behind a reverse proxy; health checks on /health.\n\n"
        f"## Rollback\nKeep the previous image tag; one-command revert."
    )


class ToolRegistry:
    """A registry mapping tool names to their callables."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolFn] = {}

    def register(self, name: str, fn: ToolFn) -> None:
        self._tools[name] = fn

    def get(self, name: str) -> ToolFn | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return sorted(self._tools)


class ToolBelt:
    """A per-agent view over the registry, limited to allowed tools.

    Composed into each agent. Records every tool call for transparency.
    """

    def __init__(self, registry: ToolRegistry, allowed: list[str]) -> None:
        self._registry = registry
        self._allowed = set(allowed)
        self._calls: list[str] = []

    def use(self, name: str, **kwargs: Any) -> str:
        """Invoke an allowed tool and return its content."""
        if name not in self._allowed:
            raise PermissionError(
                f"Tool '{name}' is not in this agent's available_tools."
            )
        fn = self._registry.get(name)
        if fn is None:
            raise KeyError(f"Tool '{name}' is not registered.")
        result = fn(**kwargs)
        self._calls.append(name)
        return result

    @property
    def calls(self) -> list[str]:
        return list(self._calls)


def default_tool_registry() -> ToolRegistry:
    """Build the registry with all built-in tools registered."""
    registry = ToolRegistry()
    registry.register("charter_writer", charter_writer)
    registry.register("okr_planner", okr_planner)
    registry.register("document_writer", document_writer)
    registry.register("architecture_designer", architecture_designer)
    registry.register("api_spec_writer", api_spec_writer)
    registry.register("threat_modeler", threat_modeler)
    registry.register("test_planner", test_planner)
    registry.register("pipeline_provisioner", pipeline_provisioner)
    return registry
