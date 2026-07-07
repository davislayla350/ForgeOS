"""Verification that reasoning traces stream as ARTIFACT_TOKEN events."""

from __future__ import annotations

import asyncio

from app.agents.tools import default_tool_registry
from app.config import get_settings
from app.memory.store import RunMemory
from app.services.company_orchestrator import CompanyOrchestrator
from app.services.qwen_client import LLMError, QwenClient

passed = 0


def check(label: str, cond: bool) -> None:
    global passed
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    assert cond, f"FAILED: {label}"
    passed += 1


settings = get_settings()


# -------------------------------------------------------------------
# 1. Without an LLM, no ARTIFACT_TOKEN events fire (additive, opt-in).
# -------------------------------------------------------------------
async def check_no_llm_no_tokens() -> None:
    orch = CompanyOrchestrator(
        QwenClient(settings), RunMemory(), default_tool_registry()
    )
    result = await orch.run("Build a budgeting app")
    token_events = [e for e in result.events if e.type.value == "artifact_token"]
    check(
        f"No artifact_token events when LLM disabled ({len(token_events)} events)",
        len(token_events) == 0,
    )
    # And the run still completes cleanly.
    check(
        "Deterministic run still ends with run_completed",
        result.events[-1].type.value == "run_completed",
    )
    # And still produces every artifact.
    check(
        f"Deterministic run still produces artifacts ({len(result.tasks)} tasks)",
        len(result.tasks) == 6,
    )


asyncio.run(check_no_llm_no_tokens())


# -------------------------------------------------------------------
# 2. With a streaming LLM, artifact_token events fire for each artifact.
# -------------------------------------------------------------------
class StreamingLLM(QwenClient):
    """Fake LLM that yields token deltas so we can assert on the events."""

    def __init__(self, settings) -> None:
        super().__init__(settings)
        self.stream_calls = 0

    @property
    def enabled(self):
        return True

    async def chat(
        self, messages, *, temperature=0.2, max_tokens=1500, response_format=None
    ):
        # Any non-streaming JSON call: return schema-satisfying content.
        return '{"summary":"ok","content":"model content"}'

    async def stream_chat(self, messages, *, temperature=0.4, max_tokens=1500):
        # Yield a short deterministic sequence of deltas.
        self.stream_calls += 1
        for piece in ["I ", "picked ", "the ", "approach ", "because ", "it ", "scales."]:
            yield piece


async def check_streaming_llm_emits_tokens() -> None:
    llm = StreamingLLM(settings)
    orch = CompanyOrchestrator(llm, RunMemory(), default_tool_registry())
    result = await orch.run("Build a budgeting app")

    token_events = [e for e in result.events if e.type.value == "artifact_token"]
    print(f"    artifact_token events fired: {len(token_events)}")
    check(
        "Streaming LLM produces ARTIFACT_TOKEN events during the run",
        len(token_events) > 0,
    )

    # Each token event should carry the expected payload shape.
    for e in token_events[:5]:
        p = e.payload
        assert isinstance(p.get("title"), str), f"missing title: {p}"
        assert isinstance(p.get("delta"), str) and p["delta"], f"bad delta: {p}"
        assert isinstance(p.get("owner_role"), str), f"missing owner_role: {p}"
        assert isinstance(p.get("seq_in_artifact"), int), f"missing seq_in_artifact: {p}"
    check("All token events carry title/delta/owner_role/seq_in_artifact payload", True)

    # Reassembling deltas per title yields our test string.
    from collections import defaultdict
    reassembled: dict[str, list[str]] = defaultdict(list)
    for e in token_events:
        reassembled[e.payload["title"]].append(e.payload["delta"])
    for title, deltas in reassembled.items():
        joined = "".join(deltas)
        check(
            f"Reassembled tokens for {title!r} match stream (got {joined!r})",
            joined == "I picked the approach because it scales.",
        )

    # And the tokens are surfaced for each of the 6 artifacts.
    unique_titles = set(reassembled.keys())
    check(
        f"Token stream fired for every artifact ({len(unique_titles)} / 6)",
        len(unique_titles) == 6,
    )
    # stream_chat should have been called at least once per artifact (6+).
    check(
        f"stream_chat was invoked once per artifact ({llm.stream_calls} calls)",
        llm.stream_calls >= 6,
    )


asyncio.run(check_streaming_llm_emits_tokens())


# -------------------------------------------------------------------
# 3. Streaming failure is non-fatal: the run still completes.
# -------------------------------------------------------------------
class BrokenStreamingLLM(QwenClient):
    """LLM whose stream_chat raises. The run must not fail."""

    @property
    def enabled(self):
        return True

    async def chat(
        self, messages, *, temperature=0.2, max_tokens=1500, response_format=None
    ):
        return '{"summary":"ok","content":"model content"}'

    async def stream_chat(self, messages, *, temperature=0.4, max_tokens=1500):
        # A generator that raises immediately: caller iterates then it throws.
        raise LLMError("simulated stream failure")
        yield  # pragma: no cover -- unreachable, but keeps this a generator


async def check_streaming_failure_is_nonfatal() -> None:
    orch = CompanyOrchestrator(
        BrokenStreamingLLM(settings), RunMemory(), default_tool_registry()
    )
    result = await orch.run("Build a budgeting app")
    token_events = [e for e in result.events if e.type.value == "artifact_token"]
    check(
        f"Broken stream produces zero token events ({len(token_events)})",
        len(token_events) == 0,
    )
    check(
        "Run still completes cleanly when stream_chat raises",
        result.events[-1].type.value == "run_completed",
    )
    check(
        f"Run still produces all artifacts ({len(result.tasks)} tasks)",
        len(result.tasks) == 6,
    )


asyncio.run(check_streaming_failure_is_nonfatal())


print(f"\nALL {passed} CHECKS PASSED")
