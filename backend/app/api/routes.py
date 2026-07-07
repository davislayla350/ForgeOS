"""HTTP routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel

from app.api.dependencies import (
    get_company_orchestrator,
    get_live_registry,
    get_llm,
    get_orchestrator,
)
from app.api.rate_limit import enforce_rate_limit
from app.config import get_logger, get_settings
from app.models.company import CompanyRunResult
from app.schemas.requests import LaunchRequest
from app.schemas.responses import HealthResponse, LaunchResponse
from app.services.company_orchestrator import CompanyOrchestrator
from app.services.live_run_registry import LiveRunRegistry
from app.services.orchestrator import Orchestrator
from app.services.qwen_client import QwenClient

logger = get_logger(__name__)
router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["system"])
async def health(llm: QwenClient = Depends(get_llm)) -> HealthResponse:
    """Liveness check; also reports whether the LLM is configured."""
    settings = get_settings()
    return HealthResponse(app_env=settings.app_env, llm_enabled=llm.enabled)


@router.post(
    "/launch",
    response_model=LaunchResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
    tags=["orchestration"],
    dependencies=[Depends(enforce_rate_limit)],
)
async def launch(
    body: LaunchRequest,
    orchestrator: Orchestrator = Depends(get_orchestrator),
) -> LaunchResponse:
    """Launch a company run for a project idea.

    Returns the CEO's structured project plan plus a frontend-ready
    orchestration payload (employees + timed steps).
    """
    try:
        return await orchestrator.launch(body.project)
    except Exception as exc:  # noqa: BLE001 - surface a clean 500, log details.
        logger.exception("Launch failed for project: %s", body.project)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate project plan.",
        ) from exc


@router.post(
    "/company/launch",
    response_model=CompanyRunResult,
    status_code=status.HTTP_200_OK,
    tags=["orchestration"],
    dependencies=[Depends(enforce_rate_limit)],
)
async def company_launch(
    body: LaunchRequest,
    orchestrator: CompanyOrchestrator = Depends(get_company_orchestrator),
) -> CompanyRunResult:
    """Run the full company engine and return the structured event timeline.

    Preserved for backwards compatibility and as the fallback path when the
    WebSocket streaming endpoint is unavailable. Returns plan, tasks, agents,
    messages, reviews, and the ordered events, same shape as before.
    """
    try:
        return await orchestrator.run(body.project)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Company launch failed for project: %s", body.project)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to run the company orchestration.",
        ) from exc


# ---------------------------------------------------------------------------
# Live streaming
# ---------------------------------------------------------------------------


class CompanyStartResponse(BaseModel):
    """Payload for ``POST /company/start``."""

    run_id: str
    ws_url: str


@router.post(
    "/company/start",
    response_model=CompanyStartResponse,
    tags=["orchestration"],
    dependencies=[Depends(enforce_rate_limit)],
)
async def company_start(
    body: LaunchRequest,
    registry: LiveRunRegistry = Depends(get_live_registry),
) -> CompanyStartResponse:
    """Kick off a run and return the ``run_id`` to subscribe to.

    Clients POST here, then open a WebSocket at ``/company/stream/{run_id}``
    to receive events live. If the WebSocket disconnects, they reconnect to
    the same URL with ``?since=<last-seq>`` and receive any events they
    missed plus the live tail.
    """
    try:
        run_id = await registry.start(body.project)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to start live run: %s", body.project)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start the company orchestration.",
        ) from exc
    return CompanyStartResponse(run_id=run_id, ws_url=f"/company/stream/{run_id}")


@router.websocket("/company/stream/{run_id}")
async def company_stream(
    websocket: WebSocket,
    run_id: str,
    since: int = 0,
) -> None:
    """Stream orchestration events for ``run_id`` over a WebSocket.

    Protocol:
      * The server sends a JSON object per event, in the same shape returned
        by ``POST /company/launch``: ``{seq, type, timestamp, actor, payload}``.
      * The very first message is a small envelope
        ``{"type": "hello", "run_id": ..., "resumed_from": since}`` so the
        client can confirm the connection is live and know where the stream
        picked up.
      * On any error (unknown run, orchestration failure) the server sends
        ``{"type": "error", "message": ...}`` and closes.

    Reconnect: clients call this URL with ``?since=<last-seen-seq>`` to
    receive every buffered event they missed followed by the live tail. No
    duplicate events are emitted. The server-side buffer is retained for
    ``LiveRunRegistry.DEFAULT_TTL_SECONDS`` after the run completes.
    """
    await websocket.accept()
    registry: LiveRunRegistry = websocket.app.state.live_registry

    record = await registry.get(run_id)
    if record is None:
        await websocket.send_json({"type": "error", "message": "unknown run_id"})
        await websocket.close(code=4404)
        return

    await websocket.send_json(
        {"type": "hello", "run_id": run_id, "resumed_from": since}
    )

    try:
        async for event in registry.subscribe(run_id, since_seq=since):
            await websocket.send_json(event)
    except WebSocketDisconnect:
        logger.info("Client disconnected from run %s stream.", run_id)
    except KeyError:
        # Run evicted between get() and subscribe(); unlikely but possible.
        await websocket.send_json({"type": "error", "message": "run expired"})
    except Exception as exc:  # noqa: BLE001
        logger.exception("Stream failed for run %s: %s", run_id, exc)
        try:
            await websocket.send_json(
                {"type": "error", "message": "internal stream error"}
            )
        except Exception:  # noqa: BLE001
            pass
    finally:
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass
