"""Agents package.

Importing this package registers every concrete agent (each module calls
``@register_agent`` at import time). Anything that needs the registry populated
only has to import from ``app.agents``.

To add an employee: create ONE new module here with a class that subclasses
``BaseAgent`` and is decorated with ``@register_agent``. Import it below so it
registers. Nothing else changes.
"""

from __future__ import annotations

from app.agents.base import BaseAgent
from app.agents.registry import (
    AGENT_REGISTRY,
    build_roster,
    employee_by_role,
    get_ordered_agent_classes,
    register_agent,
)

# Importing these modules triggers their @register_agent decorators.
from app.agents.ceo import CEOAgent
from app.agents.product_manager import ProductManagerAgent
from app.agents.engineer import EngineerAgent
from app.agents.security import SecurityAgent
from app.agents.qa import QAAgent
from app.agents.devops import DevOpsAgent

__all__ = [
    "BaseAgent",
    "AGENT_REGISTRY",
    "register_agent",
    "get_ordered_agent_classes",
    "build_roster",
    "employee_by_role",
    "CEOAgent",
    "ProductManagerAgent",
    "EngineerAgent",
    "SecurityAgent",
    "QAAgent",
    "DevOpsAgent",
]
