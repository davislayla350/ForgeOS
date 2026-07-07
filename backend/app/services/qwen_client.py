"""QwenClient -- an OpenAI-compatible chat client with structured-output support.

Qwen is served behind an OpenAI-compatible API (the DashScope "compatible-mode"
endpoint, or any other OpenAI-shaped gateway). This client speaks that protocol
directly with httpx, so swapping providers is a configuration change, not a code
change.

The client draws a hard line between two failure modes so diagnostics stay
clean:

* :class:`LLMError` -- the *transport* failed. Missing key, HTTP failure,
  bad response envelope, empty content. Nothing the model said is at fault.
* :class:`LLMParseError` -- the *content* failed. We got a response but
  couldn't turn it into the JSON the caller needed, even after a repair pass.

Both are caught by the agents' fallback path (deterministic output), but they
are logged separately so operators can tell "the API is down" from "the model
is confused" at a glance.

No API key yet? The client reports ``enabled == False`` and never makes a
network call. Agents detect this and fall back to deterministic planning, so the
service is fully functional for a demo today and becomes LLM-backed the moment a
key is added to ``.env``.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.config import Settings, get_logger

logger = get_logger(__name__)
# Separate loggers so operators can filter "the network broke" from "the model
# hallucinated JSON" without eyeballing every stack trace.
transport_logger = get_logger("qwen.transport")
parse_logger = get_logger("qwen.parse")


class LLMError(RuntimeError):
    """The LLM endpoint could not be reached, or returned an unusable envelope.

    Callers translate this into a deterministic fallback. It never propagates
    to the API layer.
    """


class LLMParseError(RuntimeError):
    """The LLM returned content, but it could not be parsed as the expected JSON.

    Distinct from :class:`LLMError` so logs and metrics can distinguish content
    quality problems from transport problems. Callers translate this into a
    deterministic fallback the same way they handle ``LLMError``.
    """


# The strict system-prompt footer we append whenever we want JSON. It is
# short, specific, and negatively phrased on the failure modes we've actually
# seen (prose preamble, trailing commentary, markdown code fences).
_JSON_FOOTER = (
    "\n\nRESPONSE FORMAT (STRICT):\n"
    "Return ONE JSON object and nothing else. No preamble, no closing remarks, "
    "no markdown fences, no explanation. The response MUST parse with "
    "json.loads on the first attempt. Use double-quoted keys and strings. Do "
    "not include trailing commas."
)

# A one-shot repair prompt used when parsing the first response fails.
_JSON_REPAIR_INSTRUCTION = (
    "Your previous reply could not be parsed as JSON. Return the SAME "
    "information as a single valid JSON object with double-quoted keys and "
    "strings, no code fences, no commentary. Preserve all fields; only fix "
    "the syntax."
)


class QwenClient:
    """Thin async client for an OpenAI-compatible chat completions endpoint."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._api_key = settings.qwen_api_key
        self._base_url = settings.qwen_base_url.rstrip("/")
        self._model = settings.qwen_model
        self._timeout = settings.qwen_timeout_seconds

    @property
    def enabled(self) -> bool:
        """True only when an API key is configured."""
        return bool(self._api_key and self._api_key.strip())

    @property
    def model(self) -> str:
        return self._model

    # ------------------------------------------------------------------ chat
    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        max_tokens: int = 1500,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        """Send a chat completion and return the assistant's message content.

        Args:
            messages: OpenAI-style list of ``{"role": ..., "content": ...}``.
            temperature: Sampling temperature.
            max_tokens: Upper bound on generated tokens.
            response_format: Optional OpenAI-compatible response_format
                object, e.g. ``{"type": "json_object"}`` to ask a supporting
                provider for JSON mode. Silently ignored by providers that
                don't accept it.

        Raises:
            LLMError: If the client is disabled, or the request/response fails.
        """
        if not self.enabled:
            raise LLMError("QwenClient is disabled: no API key configured.")

        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format is not None:
            payload["response_format"] = response_format

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPError as exc:
            transport_logger.error("Qwen request failed: %s", exc)
            raise LLMError(f"Qwen request failed: {exc}") from exc

        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            transport_logger.error("Unexpected Qwen response shape: %s", data)
            raise LLMError("Unexpected response shape from Qwen.") from exc

        if not isinstance(content, str) or not content.strip():
            transport_logger.error("Qwen returned empty content.")
            raise LLMError("Qwen returned empty content.")
        return content

    # --------------------------------------------------- structured_chat
    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.4,
        max_tokens: int = 1500,
    ):
        """Yield content deltas as the model generates them, via SSE.

        Contract:
          * Yields ``str`` chunks; caller appends to build the full response.
          * Raises :class:`LLMError` on transport failure or malformed stream.
          * The final assembled string is guaranteed non-empty on success;
            we don't yield empty tail chunks.

        Note: not every use case wants a stream. This is complementary to
        :meth:`chat`. Callers that need JSON should keep using
        :meth:`structured_chat` (JSON mode + repair-retry); this streamer is
        for prose whose progressive reveal is the point.
        """
        if not self.enabled:
            raise LLMError("QwenClient is disabled: no API key configured.")

        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream(
                    "POST", url, headers=headers, json=payload
                ) as response:
                    response.raise_for_status()
                    async for raw_line in response.aiter_lines():
                        line = raw_line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[len("data:") :].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            # Malformed SSE line; skip it. Some providers emit
                            # heartbeat comments; those already fail the
                            # startswith check above, but be defensive.
                            continue
                        choices = chunk.get("choices") or []
                        if not choices:
                            continue
                        delta = choices[0].get("delta") or {}
                        piece = delta.get("content")
                        if isinstance(piece, str) and piece:
                            yield piece
        except httpx.HTTPError as exc:
            transport_logger.error("Qwen stream request failed: %s", exc)
            raise LLMError(f"Qwen stream request failed: {exc}") from exc

    async def structured_chat(
        self,
        system: str,
        user: str,
        *,
        schema_hint: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1500,
    ) -> dict[str, Any]:
        """Chat that returns a parsed JSON object, with one retry on parse failure.

        Contract:
          * The strict JSON footer is appended to ``system`` so the model is
            told exactly how to shape its output.
          * ``schema_hint`` (a short description of the expected fields) is
            appended to the user turn when provided; keeping the schema in the
            user message helps models that ignore system-message shaping.
          * ``response_format={"type": "json_object"}`` is requested; providers
            that support JSON mode will honour it and providers that don't
            will ignore the field.
          * If the first response fails to parse (even after cheap syntactic
            repairs), we issue ONE repair prompt asking the model to reformat
            its own output. If that still fails, ``LLMParseError`` is raised.

        Raises:
            LLMError: transport-level failure (see :meth:`chat`).
            LLMParseError: content could not be parsed even after one retry.
        """
        strengthened_system = system + _JSON_FOOTER
        strengthened_user = user
        if schema_hint:
            strengthened_user = (
                f"{user}\n\nExpected JSON shape (all fields REQUIRED unless "
                f"marked optional):\n{schema_hint}"
            )

        messages: list[dict[str, str]] = [
            {"role": "system", "content": strengthened_system},
            {"role": "user", "content": strengthened_user},
        ]
        response_format = {"type": "json_object"}

        # --- Attempt 1: strict + JSON mode -------------------------------
        raw = await self.chat(
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format=response_format,
        )
        parsed, error = robust_json_parse(raw)
        if parsed is not None:
            return parsed

        # Record the parse failure with a snippet -- distinctly, so operators
        # can grep for `qwen.parse` alone.
        preview = raw[:200].replace("\n", " ")
        parse_logger.warning(
            "JSON parse failed on attempt 1 (%s). Content preview: %r",
            error,
            preview,
        )

        # --- Attempt 2: repair prompt ------------------------------------
        repair_messages = messages + [
            {"role": "assistant", "content": raw},
            {"role": "user", "content": _JSON_REPAIR_INSTRUCTION},
        ]
        try:
            repaired_raw = await self.chat(
                repair_messages,
                temperature=0.0,  # lower temp for repair -- we want fidelity
                max_tokens=max_tokens,
                response_format=response_format,
            )
        except LLMError:
            # Repair attempt failed at the transport layer. Surface the
            # ORIGINAL parse failure as the diagnostic reason since that's
            # what actually broke; keep the transport error for the log.
            parse_logger.warning(
                "Repair attempt hit a transport error; giving up on parse."
            )
            raise LLMParseError(
                f"Initial parse failed ({error}); repair attempt failed at "
                "the transport layer."
            )

        repaired, repair_error = robust_json_parse(repaired_raw)
        if repaired is not None:
            parse_logger.info("Recovered valid JSON via one repair retry.")
            return repaired

        preview2 = repaired_raw[:200].replace("\n", " ")
        parse_logger.warning(
            "JSON parse failed on repair attempt (%s). Content preview: %r",
            repair_error,
            preview2,
        )
        raise LLMParseError(
            f"Model output could not be parsed as JSON after one retry: "
            f"initial={error}; retry={repair_error}"
        )


# =============================================================================
# JSON parsing / repair helpers (pure, unit-testable)
# =============================================================================

# Match a fenced code block that MIGHT contain JSON.
_FENCE_RE = re.compile(
    r"```(?:json|JSON)?\s*(.+?)```",
    re.DOTALL,
)


def robust_json_parse(text: str) -> tuple[dict[str, Any] | None, str | None]:
    """Try hard to parse ``text`` as a JSON object.

    Strategy:
      1. Plain :func:`json.loads`.
      2. Strip a surrounding markdown code fence if present.
      3. Extract the outermost balanced ``{...}`` substring.
      4. Remove trailing commas inside objects/arrays.

    Returns:
        ``(parsed_dict, None)`` on success, or ``(None, reason)`` on failure.
        ``parsed_dict`` is guaranteed to be a ``dict``; a JSON array or
        scalar counts as a parse failure at this layer because every caller
        expects a JSON object.
    """
    if not isinstance(text, str) or not text.strip():
        return None, "empty content"

    candidates = list(_candidate_payloads(text))
    last_error: str | None = None
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_error = f"{exc.msg} at pos {exc.pos}"
            continue
        if isinstance(parsed, dict):
            return parsed, None
        last_error = f"root is {type(parsed).__name__}, expected object"

    return None, last_error or "no candidate payload parsed"


def _candidate_payloads(text: str):
    """Yield progressively more forgiving views of ``text`` for JSON parsing."""
    stripped = text.strip()
    yield stripped

    # 1. Strip a markdown fence, if any. Some models wrap JSON in ```json ...```.
    fence_match = _FENCE_RE.search(stripped)
    if fence_match:
        yield fence_match.group(1).strip()

    # 2. Extract the outermost balanced { ... }, in case prose was appended.
    balanced = _extract_outermost_object(stripped)
    if balanced is not None and balanced != stripped:
        yield balanced
        # 3. Also try the balanced payload with trailing commas removed.
        yield _strip_trailing_commas(balanced)

    # 4. And the raw text with trailing commas removed.
    yield _strip_trailing_commas(stripped)


def _extract_outermost_object(text: str) -> str | None:
    """Return the substring from the first '{' to its matching '}'.

    Ignores braces inside JSON strings so ``"a{b"`` isn't mistaken for a
    nested object. Returns ``None`` if no balanced object is found.
    """
    start = text.find("{")
    if start < 0:
        return None

    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


_TRAILING_COMMA_RE = re.compile(r",(\s*[}\]])")


def _strip_trailing_commas(text: str) -> str:
    """Remove trailing commas inside objects/arrays -- a common LLM failure mode."""
    return _TRAILING_COMMA_RE.sub(r"\1", text)
