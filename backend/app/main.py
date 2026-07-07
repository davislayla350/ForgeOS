"""Application entry point and factory.

Builds the FastAPI app, configures logging and CORS, wires the object graph onto
``app.state`` during the lifespan, and mounts the API router.

Run locally:
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.tools import default_tool_registry
from app.api.routes import router
from app.config import configure_logging, get_logger, get_settings
from app.memory.store import RunMemory
from app.services.company_orchestrator import CompanyOrchestrator
from app.services.live_run_registry import LiveRunRegistry
from app.services.orchestrator import Orchestrator
from app.services.qwen_client import QwenClient

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Construct singletons at startup, store them on app.state."""
    settings = get_settings()

    llm = QwenClient(settings)
    memory = RunMemory()
    tools = default_tool_registry()
    orchestrator = Orchestrator(llm=llm, memory=memory, tools=tools)
    company_orchestrator = CompanyOrchestrator(llm=llm, memory=memory, tools=tools)
    # A single shared orchestrator is fine here: every ``run(project)`` builds
    # a fresh ``_RunSession`` internally, so concurrent runs don't collide.
    live_registry = LiveRunRegistry(orchestrator_factory=lambda: company_orchestrator)

    app.state.settings = settings
    app.state.llm = llm
    app.state.memory = memory
    app.state.tools = tools
    app.state.orchestrator = orchestrator
    app.state.company_orchestrator = company_orchestrator
    app.state.live_registry = live_registry

    logger.info(
        "ForgeOS backend started (env=%s, llm_enabled=%s, model=%s)",
        settings.app_env,
        llm.enabled,
        settings.qwen_model,
    )
    yield
    logger.info("ForgeOS backend shutting down.")
    await live_registry.shutdown()


def create_app() -> FastAPI:
    """Application factory."""
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        summary="Autonomous software company backend for ForgeOS.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)
    return app


app = create_app()
