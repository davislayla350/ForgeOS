"""API dependency providers.

Wires the object graph (settings -> LLM client -> CEO agent -> orchestrator)
and exposes it to routes via FastAPI's dependency injection. The singletons live
on ``app.state`` and are created once at startup in ``main.py``.
"""

from __future__ import annotations

from fastapi import Request

from app.memory.store import RunMemory
from app.services.company_orchestrator import CompanyOrchestrator
from app.services.live_run_registry import LiveRunRegistry
from app.services.orchestrator import Orchestrator
from app.services.qwen_client import QwenClient


def get_orchestrator(request: Request) -> Orchestrator:
    """Return the process-wide Orchestrator from app state."""
    return request.app.state.orchestrator


def get_company_orchestrator(request: Request) -> CompanyOrchestrator:
    """Return the process-wide CompanyOrchestrator from app state."""
    return request.app.state.company_orchestrator


def get_llm(request: Request) -> QwenClient:
    """Return the process-wide QwenClient from app state."""
    return request.app.state.llm


def get_memory(request: Request) -> RunMemory:
    """Return the process-wide RunMemory from app state."""
    return request.app.state.memory


def get_live_registry(request: Request) -> LiveRunRegistry:
    """Return the process-wide LiveRunRegistry from app state."""
    return request.app.state.live_registry
