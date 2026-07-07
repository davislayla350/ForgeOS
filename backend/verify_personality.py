"""Verification of agent personality + voiced inter-agent messages.

Covers:
  * Each agent's system prompt carries a distinct VOICE/STYLE section.
  * BaseAgent.voice() calls the LLM when enabled; falls back verbatim to the
    supplied string when disabled, on LLM error, on parse error, on empty
    reply, and on absurdly long reply.
  * Voiced text lands in the message bus as a structured event.
  * End-to-end: with a cooperating LLM, real handoff message bodies come from
    the LLM path; with a broken LLM, they come from the deterministic string.
  * With NO LLM at all, the deterministic strings match the pre-personality
    build byte-for-byte (backwards compatible).
"""

from __future__ import annotations

import asyncio

from app.agents.base import BaseAgent
from app.agents.registry import get_ordered_agent_classes
from app.agents.tools import default_tool_registry
from app.config import Settings, get_settings
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
# 1. Every agent has a distinct VOICE + STYLE section in its prompt.
# -------------------------------------------------------------------
personality_markers = {
    "CEO": ["Strategic", "concise", "executive"],
    "Product Manager": ["Organized", "clarifying", "scope"],
    "Engineer": ["Technical", "tradeoffs", "Option"],
    "Security": ["Skeptical", "block", "STRIDE"],
    "QA": ["Detail-oriented", "assumption", "scenario"],
    "DevOps": ["Reliability", "SLO", "rollback"],
}

for cls in get_ordered_agent_classes():
    prompt = cls.system_prompt
    check(
        f"{cls.role} prompt has VOICE section",
        "VOICE" in prompt,
    )
    check(
        f"{cls.role} prompt has STYLE section",
        "STYLE" in prompt,
    )
    for marker in personality_markers.get(cls.role, []):
        check(
            f"{cls.role} prompt contains distinct marker '{marker}'",
            marker.lower() in prompt.lower(),
        )

# Distinct: no two prompts should be identical or near-identical.
prompts = {cls.role: cls.system_prompt for cls in get_ordered_agent_classes()}
unique_prompts = set(prompts.values())
check("All six agent prompts are unique strings", len(unique_prompts) == 6)

# -------------------------------------------------------------------
# 2. voice() falls back when LLM is disabled.
# -------------------------------------------------------------------
async def check_disabled_fallback() -> None:
    disabled_llm = QwenClient(Settings(qwen_api_key=None))
    # Construct one CEO to exercise voice() directly. We inject a minimal
    # scoped memory + toolbelt via the standard session builder used in tests.
    from app.agents.registry import agent_class_for_role as get_agent_class
    from app.agents.tools import ToolBelt
    from app.memory.store import RunContext, ScopedMemory
    ctx = RunContext()
    ceo_cls = get_agent_class("CEO")
    tools = ToolBelt(default_tool_registry(), ceo_cls.available_tools)
    ceo = ceo_cls(disabled_llm, ScopedMemory(ctx, "company"), tools)
    line = await ceo.voice(
        "handoff",
        recipient_role="Product Manager",
        deliverable="PRD",
        fallback="Vision set. Please turn it into a PRD.",
    )
    check(
        "voice() returns fallback verbatim when LLM disabled",
        line == "Vision set. Please turn it into a PRD.",
    )

asyncio.run(check_disabled_fallback())

# -------------------------------------------------------------------
# 3. voice() falls back on LLM transport error.
# -------------------------------------------------------------------
class TransportDownLLM(QwenClient):
    @property
    def enabled(self): return True
    async def chat(self, messages, *, temperature=0.2, max_tokens=1500, response_format=None):
        raise LLMError("simulated network failure")

async def check_transport_fallback() -> None:
    from app.agents.registry import agent_class_for_role as get_agent_class
    from app.agents.tools import ToolBelt
    from app.memory.store import RunContext, ScopedMemory
    ctx = RunContext()
    ceo_cls = get_agent_class("CEO")
    tools = ToolBelt(default_tool_registry(), ceo_cls.available_tools)
    ceo = ceo_cls(TransportDownLLM(settings), ScopedMemory(ctx, "company"), tools)
    line = await ceo.voice(
        "handoff",
        recipient_role="Product Manager",
        deliverable="PRD",
        fallback="Fallback line.",
    )
    check("voice() returns fallback on LLM transport error", line == "Fallback line.")

asyncio.run(check_transport_fallback())

# -------------------------------------------------------------------
# 4. voice() falls back on unparseable content.
# -------------------------------------------------------------------
class GarbageLLM(QwenClient):
    @property
    def enabled(self): return True
    async def chat(self, messages, *, temperature=0.2, max_tokens=1500, response_format=None):
        return "not JSON at all, just prose about the weather"

async def check_parse_fallback() -> None:
    from app.agents.registry import agent_class_for_role as get_agent_class
    from app.agents.tools import ToolBelt
    from app.memory.store import RunContext, ScopedMemory
    ctx = RunContext()
    ceo_cls = get_agent_class("CEO")
    tools = ToolBelt(default_tool_registry(), ceo_cls.available_tools)
    ceo = ceo_cls(GarbageLLM(settings), ScopedMemory(ctx, "company"), tools)
    line = await ceo.voice("handoff", fallback="Deterministic content.")
    check("voice() returns fallback on unparseable LLM content", line == "Deterministic content.")

asyncio.run(check_parse_fallback())

# -------------------------------------------------------------------
# 5. voice() falls back on empty 'line' field.
# -------------------------------------------------------------------
class EmptyLineLLM(QwenClient):
    @property
    def enabled(self): return True
    async def chat(self, messages, *, temperature=0.2, max_tokens=1500, response_format=None):
        return '{"line": "   "}'

async def check_empty_fallback() -> None:
    from app.agents.registry import agent_class_for_role as get_agent_class
    from app.agents.tools import ToolBelt
    from app.memory.store import RunContext, ScopedMemory
    ctx = RunContext()
    ceo_cls = get_agent_class("CEO")
    tools = ToolBelt(default_tool_registry(), ceo_cls.available_tools)
    ceo = ceo_cls(EmptyLineLLM(settings), ScopedMemory(ctx, "company"), tools)
    line = await ceo.voice("handoff", fallback="Deterministic content.")
    check("voice() returns fallback on empty 'line' field", line == "Deterministic content.")

asyncio.run(check_empty_fallback())

# -------------------------------------------------------------------
# 6. voice() clips absurdly long replies (guardrail).
# -------------------------------------------------------------------
class TooLongLLM(QwenClient):
    @property
    def enabled(self): return True
    async def chat(self, messages, *, temperature=0.2, max_tokens=1500, response_format=None):
        long = " ".join([f"word{i}" for i in range(100)])
        return f'{{"line": "{long}"}}'

async def check_length_clip() -> None:
    from app.agents.registry import agent_class_for_role as get_agent_class
    from app.agents.tools import ToolBelt
    from app.memory.store import RunContext, ScopedMemory
    ctx = RunContext()
    ceo_cls = get_agent_class("CEO")
    tools = ToolBelt(default_tool_registry(), ceo_cls.available_tools)
    ceo = ceo_cls(TooLongLLM(settings), ScopedMemory(ctx, "company"), tools)
    line = await ceo.voice("handoff", fallback="Deterministic content.")
    word_count = len(line.split())
    check(
        f"voice() clips over-long LLM reply (got {word_count} words, ends '...')",
        word_count <= 41 and line.endswith("..."),
    )

asyncio.run(check_length_clip())

# -------------------------------------------------------------------
# 7. voice() actually returns LLM output when it's well-formed.
# -------------------------------------------------------------------
class GoodLineLLM(QwenClient):
    @property
    def enabled(self): return True
    async def chat(self, messages, *, temperature=0.2, max_tokens=1500, response_format=None):
        return '{"line": "Scope locked. PRD, three acceptance criteria, ships tomorrow."}'

async def check_llm_used() -> None:
    from app.agents.registry import agent_class_for_role as get_agent_class
    from app.agents.tools import ToolBelt
    from app.memory.store import RunContext, ScopedMemory
    ctx = RunContext()
    ceo_cls = get_agent_class("CEO")
    tools = ToolBelt(default_tool_registry(), ceo_cls.available_tools)
    ceo = ceo_cls(GoodLineLLM(settings), ScopedMemory(ctx, "company"), tools)
    line = await ceo.voice("handoff", fallback="Deterministic content.")
    check(
        "voice() returns LLM-generated line when the model cooperates",
        line == "Scope locked. PRD, three acceptance criteria, ships tomorrow.",
    )

asyncio.run(check_llm_used())

# -------------------------------------------------------------------
# 8. Backwards compat: NO LLM = deterministic strings unchanged.
# -------------------------------------------------------------------
async def check_deterministic_run() -> None:
    llm = QwenClient(Settings(qwen_api_key=None))
    orch = CompanyOrchestrator(llm, RunMemory(), default_tool_registry())
    result = await orch.run("Build a budgeting app")

    expected_lines = {
        "Vision set. Please turn it into a PRD and requirements.",
        "PRD is ready. Please design the architecture and implementation plan.",
        "Architecture approved. Please create the test strategy and review the implementation.",
        "QA passed. Please prepare the deployment plan and release.",
        "Release approved and ready to ship.",
    }
    body_texts = {m.content for m in result.messages}
    missing = expected_lines - body_texts
    check(
        f"Deterministic run preserves EVERY canned handoff verbatim "
        f"(missing: {missing})",
        len(missing) == 0,
    )

asyncio.run(check_deterministic_run())

# -------------------------------------------------------------------
# 9. End-to-end personality: cooperating LLM replaces canned handoffs.
# -------------------------------------------------------------------
class PersonalityLLM(QwenClient):
    """A cooperating LLM: every JSON reply is valid; voice() returns a
    role-tagged short line so we can tell which agent voiced which handoff."""

    @property
    def enabled(self): return True

    async def chat(self, messages, *, temperature=0.2, max_tokens=1500, response_format=None):
        sys = messages[0]["content"]
        user = messages[-1]["content"]
        # voice() calls are recognisable by the "Intent:" prefix in the user.
        if user.startswith("Intent:"):
            # Pull the intent + speaker role out of the system prompt.
            role = "unknown"
            for tag in ("CEO", "Product Manager", "Engineer", "Security", "QA", "DevOps"):
                if tag in sys.split("VOICE")[0]:
                    role = tag
                    break
            return f'{{"line": "[voiced by {role}] handoff ok."}}'
        # Everything else: return schema-satisfying JSON.
        if "CEO" in sys:
            return '{"company_name":"Voiced Co","mission":"m","vision":"v"}'
        if "review" in sys.lower() or "STRIDE" in sys:
            return '{"verdict":"approved","comments":"ok","issues":[]}'
        return '{"summary":"ok","content":"model content"}'

async def check_end_to_end_personality() -> None:
    llm = PersonalityLLM(settings)
    orch = CompanyOrchestrator(llm, RunMemory(), default_tool_registry())
    result = await orch.run("Build a budgeting app")

    # We can't assert equality (LLM behavior can vary), but with our stub the
    # voiced messages should carry the "[voiced by ROLE]" tag.
    voiced = [m for m in result.messages if "[voiced by" in m.content]
    check(
        f"Voiced handoffs land in structured messages "
        f"({len(voiced)} voiced of {len(result.messages)} total)",
        len(voiced) >= 4,
    )
    # Each voiced message should be attributable to the sending role.
    for m in voiced:
        expected_marker = f"[voiced by {m.sender}]"
        check(
            f"Voiced msg from {m.sender} carries the correct sender tag",
            expected_marker in m.content,
        )
    # And they should be recorded as message_sent events on the bus, not
    # skipped or synthesised outside the event stream.
    voiced_events = [
        e for e in result.events
        if e.type.value == "agent_message" and "[voiced by" in e.payload.get("content", "")
    ]
    check(
        f"Voiced messages appear as structured 'message_sent' events "
        f"({len(voiced_events)} events)",
        len(voiced_events) >= 4,
    )

asyncio.run(check_end_to_end_personality())

print(f"\nALL {passed} CHECKS PASSED")
