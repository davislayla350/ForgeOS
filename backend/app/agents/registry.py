"""Agent registry.

This is what makes "add an employee = one new class" true. A concrete agent
decorates itself with ``@register_agent`` and the rest of the system (the
roster, the CEO's plan, the orchestration sequence) is derived from the registry
sorted by each agent's ``order``. No central list to edit.

The registry intentionally imports no concrete agents, avoiding import cycles.
Registration happens as each agent module is imported (see ``app/agents/__init__``).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.models.roster import EmployeeProfile

if TYPE_CHECKING:  # avoid a runtime import cycle with base.py
    from app.agents.base import BaseAgent

# Required class attributes every registered agent must define.
_REQUIRED_ATTRS: tuple[str, ...] = (
    "role",
    "name",
    "initials",
    "employee_id",
    "order",
    "phase",
    "phase_label",
    "responsibility",
    "system_prompt",
    "available_tools",
    "memory_scope",
)

# role -> agent class
AGENT_REGISTRY: dict[str, type["BaseAgent"]] = {}


def register_agent(cls: type["BaseAgent"]) -> type["BaseAgent"]:
    """Class decorator that validates and registers an agent.

    Raises:
        TypeError: if a required class attribute is missing.
        ValueError: if the role or employee_id is already registered.
    """
    missing = [a for a in _REQUIRED_ATTRS if getattr(cls, a, None) in (None, "")]
    if missing:
        raise TypeError(
            f"{cls.__name__} is missing required attributes: {', '.join(missing)}"
        )
    if cls.role in AGENT_REGISTRY:
        raise ValueError(f"An agent for role '{cls.role}' is already registered.")
    existing_ids = {c.employee_id for c in AGENT_REGISTRY.values()}
    if cls.employee_id in existing_ids:
        raise ValueError(f"employee_id '{cls.employee_id}' is already in use.")
    AGENT_REGISTRY[cls.role] = cls
    return cls


def get_ordered_agent_classes() -> list[type["BaseAgent"]]:
    """Return all registered agent classes sorted by ``order``."""
    return sorted(AGENT_REGISTRY.values(), key=lambda c: c.order)


def agent_class_for_role(role: str) -> type["BaseAgent"] | None:
    """Look up a registered agent class by role (case-insensitive)."""
    if role in AGENT_REGISTRY:
        return AGENT_REGISTRY[role]
    target = role.strip().lower()
    for cls in AGENT_REGISTRY.values():
        if cls.role.lower() == target:
            return cls
    return None


def employee_by_role(role: str) -> EmployeeProfile | None:
    """Return the employee profile for a role, derived from its agent class."""
    cls = agent_class_for_role(role)
    if cls is None:
        return None
    return EmployeeProfile(
        id=cls.employee_id,
        name=cls.name,
        role=cls.role,
        initials=cls.initials,
        responsibility=cls.responsibility,
    )


def build_roster() -> list[EmployeeProfile]:
    """Build the full employee roster from the registered agents (by order)."""
    return [
        EmployeeProfile(
            id=cls.employee_id,
            name=cls.name,
            role=cls.role,
            initials=cls.initials,
            responsibility=cls.responsibility,
        )
        for cls in get_ordered_agent_classes()
    ]
