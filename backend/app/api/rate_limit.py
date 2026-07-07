"""In-memory request rate limiting for the public demo.

Protects the LLM-consuming endpoints (``/launch``, ``/company/launch``,
``/company/start``) from draining API credits. Two layers:

* **Per-client sliding window** -- each client IP may make at most
  ``RATE_LIMIT_PER_MINUTE`` orchestration requests per 60 seconds.
* **Global hourly budget** -- across all clients, at most
  ``RATE_LIMIT_GLOBAL_PER_HOUR`` orchestration requests per hour. This bounds
  worst-case spend even under a distributed spam attempt.

Design notes:

* No new dependencies. State is process-local dictionaries guarded by the
  single-threaded asyncio event loop (FastAPI dependencies for these routes
  run on the loop, so no locking is needed).
* Process-local means the limits reset on restart and are per-instance when
  horizontally scaled. That is the correct trade-off for a hackathon demo;
  swap in Redis if you ever scale out.
* By default the limiter keys on the direct socket address. When deployed
  behind a reverse proxy (Render, Railway, Fly, etc.) every request appears
  to come from the proxy, so set ``TRUST_PROXY=true`` to key on the first
  ``X-Forwarded-For`` hop instead. Only enable that behind a proxy you
  control; the header is client-spoofable when the app is directly exposed.
"""

from __future__ import annotations

import time
from collections import deque

from fastapi import HTTPException, Request, status

from app.config import get_logger, get_settings

logger = get_logger(__name__)

# Sliding-window state. Maps client key -> recent request timestamps.
_per_client: dict[str, deque[float]] = {}
# Global request timestamps for the hourly budget.
_global_window: deque[float] = deque()

_MINUTE = 60.0
_HOUR = 3600.0
# Cap tracked clients so a spray of unique IPs can't grow memory unbounded.
_MAX_TRACKED_CLIENTS = 10_000

FRIENDLY_CLIENT_LIMIT = (
    "You have reached the demo request limit. Please wait a minute and try again."
)
FRIENDLY_GLOBAL_LIMIT = (
    "The public demo is at capacity right now. Please try again in a little while."
)


def _client_key(request: Request) -> str:
    """Resolve the identity used for per-client limiting."""
    settings = get_settings()
    if settings.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # First hop is the original client when the proxy is trusted.
            return forwarded.split(",")[0].strip()
    if request.client is not None:
        return request.client.host
    return "unknown"


def _prune(window: deque[float], now: float, horizon: float) -> None:
    """Drop timestamps older than ``horizon`` seconds from the left."""
    cutoff = now - horizon
    while window and window[0] < cutoff:
        window.popleft()


def _prune_stale_clients(now: float) -> None:
    """Evict clients with no recent activity to bound memory."""
    if len(_per_client) <= _MAX_TRACKED_CLIENTS:
        return
    stale = [key for key, win in _per_client.items() if not win or win[-1] < now - _MINUTE]
    for key in stale:
        _per_client.pop(key, None)


async def enforce_rate_limit(request: Request) -> None:
    """FastAPI dependency: raise 429 when the caller exceeds demo limits."""
    settings = get_settings()
    if settings.rate_limit_per_minute <= 0:
        return  # Limiter disabled via configuration.

    now = time.monotonic()

    # Global hourly budget first: cheapest check, protects total spend.
    _prune(_global_window, now, _HOUR)
    if len(_global_window) >= settings.rate_limit_global_per_hour:
        logger.warning("Global hourly rate limit reached (%d requests).", len(_global_window))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=FRIENDLY_GLOBAL_LIMIT,
            headers={"Retry-After": "600"},
        )

    key = _client_key(request)
    window = _per_client.setdefault(key, deque())
    _prune(window, now, _MINUTE)
    if len(window) >= settings.rate_limit_per_minute:
        logger.info("Per-client rate limit hit for %s.", key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=FRIENDLY_CLIENT_LIMIT,
            headers={"Retry-After": "60"},
        )

    window.append(now)
    _global_window.append(now)
    _prune_stale_clients(now)
