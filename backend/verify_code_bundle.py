"""Verification of the code bundle generation pipeline."""

from __future__ import annotations

import asyncio
import json

from app.agents.tools import default_tool_registry
from app.config import get_settings
from app.memory.store import RunMemory
from app.services.company_orchestrator import CompanyOrchestrator
from app.services.qwen_client import LLMError, QwenClient

passed = 0

EXPECTED_PATHS = [
    "package.json",
    "tsconfig.json",
    "next.config.ts",
    "app/globals.css",
    "app/page.tsx",
    "components/overview-page.tsx",
    "app/api/transactions/route.ts",  # budgeting default for "Build a budgeting app"
    "lib/transactions.ts",
    "database/schema.sql",
    "README.md",
]


def check(label: str, cond: bool) -> None:
    global passed
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    assert cond, f"FAILED: {label}"
    passed += 1


settings = get_settings()


# -------------------------------------------------------------------
# 1. Without an LLM, a deterministic code bundle is always emitted.
# -------------------------------------------------------------------
async def check_no_llm_emits_deterministic_bundle() -> None:
    orch = CompanyOrchestrator(
        QwenClient(settings), RunMemory(), default_tool_registry()
    )
    result = await orch.run("Build a budgeting app")
    check("Deterministic run: code_bundle is present", result.code_bundle is not None)
    bundle = result.code_bundle
    assert bundle is not None
    check("Deterministic run: bundle source is 'deterministic'", bundle.source == "deterministic")
    check(f"Deterministic run: bundle has {len(EXPECTED_PATHS)} files", len(bundle.files) == len(EXPECTED_PATHS))
    for p in EXPECTED_PATHS:
        check(f"Deterministic run includes {p}", any(f.path == p for f in bundle.files))
    check(
        "Deterministic run: code_bundle_generated event emitted",
        any(e.type.value == "code_bundle_generated" for e in result.events),
    )
    check(
        "Deterministic run still ends with run_completed",
        result.events[-1].type.value == "run_completed",
    )
    check(
        f"Deterministic run still produces artifacts ({len(result.tasks)} tasks)",
        len(result.tasks) == 6,
    )


asyncio.run(check_no_llm_emits_deterministic_bundle())


# -------------------------------------------------------------------
# 2. With a cooperating LLM, a code bundle is emitted with expected fields.
# -------------------------------------------------------------------
_GOOD_BUNDLE_FILES = {
    "package.json": (
        '{\n  "name": "ledgerly",\n  "version": "0.1.0",\n  "private": true,\n'
        '  "scripts": { "dev": "next dev" }\n}\n'
    ),
    "tsconfig.json": (
        '{\n  "compilerOptions": { "strict": true, "jsx": "preserve" }\n}\n'
    ),
    "next.config.ts": (
        "import type { NextConfig } from 'next';\n"
        "const nextConfig: NextConfig = { reactStrictMode: true };\n"
        "export default nextConfig;\n"
    ),
    "app/globals.css": (
        "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n"
        "body { color: #fff; background: #111; }\n"
    ),
    "app/page.tsx": (
        "import { OverviewPage } from '@/components/overview-page';\n"
        "import { getSummary } from '@/lib/transactions';\n"
        "export default async function Home() {\n"
        "  const summary = await getSummary();\n"
        "  return <OverviewPage title=\"Overview\" summary={summary} />;\n"
        "}\n"
    ),
    "components/overview-page.tsx": (
        "'use client';\n"
        "import { useState } from 'react';\n"
        "export function OverviewPage() {\n"
        "  const [n, setN] = useState(0);\n"
        "  return <button onClick={() => setN(n + 1)}>Count: {n}</button>;\n"
        "}\n"
    ),
    "app/api/transactions/route.ts": (
        "import { NextResponse } from 'next/server';\n"
        "export async function GET() { return NextResponse.json({ rows: [] }); }\n"
    ),
    "lib/transactions.ts": (
        "export type Summary = { subtitle: string; stats: []; rows: [] };\n"
        "export async function getSummary(): Promise<Summary> {\n"
        "  return { subtitle: 'October', stats: [], rows: [] };\n"
        "}\n"
    ),
    "database/schema.sql": (
        "CREATE TABLE transactions (\n"
        "  id UUID PRIMARY KEY,\n"
        "  amount_cents INTEGER NOT NULL\n"
        ");\n"
    ),
    "README.md": (
        "# Ledgerly\n\nA starter budgeting app.\n\n## Stack\n- Next.js\n"
    ),
}


class GoodBundleLLM(QwenClient):
    """Returns valid content for both non-streaming and streaming paths.

    For the code-bundle JSON call, the marker "Produce a small, believable
    STARTER code bundle" appears in the user message; we branch on it.
    """

    @property
    def enabled(self): return True

    async def chat(self, messages, *, temperature=0.2, max_tokens=1500, response_format=None):
        user = messages[-1]["content"]
        if "STARTER code bundle" in user:
            return json.dumps({"files": _GOOD_BUNDLE_FILES})
        if user.startswith("Intent:"):
            return '{"line": "handoff ok."}'
        return '{"summary":"ok","content":"model content"}'

    async def stream_chat(self, messages, *, temperature=0.4, max_tokens=1500):
        yield "ok"


async def check_llm_produces_bundle() -> None:
    orch = CompanyOrchestrator(
        GoodBundleLLM(settings), RunMemory(), default_tool_registry()
    )
    result = await orch.run("Build a budgeting app")

    check("Bundle present after LLM run", result.code_bundle is not None)
    bundle = result.code_bundle
    assert bundle is not None
    check(f"Bundle has {len(EXPECTED_PATHS)} files ({len(bundle.files)})", len(bundle.files) == len(EXPECTED_PATHS))
    check("Bundle source is 'llm'", bundle.source == "llm")

    paths = [f.path for f in bundle.files]
    for p in EXPECTED_PATHS:
        check(f"Bundle includes {p}", p in paths)

    langs = {f.path: f.language for f in bundle.files}
    check("app/page.tsx language is tsx", langs["app/page.tsx"] == "tsx")
    check("app/api/transactions/route.ts language is ts", langs["app/api/transactions/route.ts"] == "ts")
    check("database/schema.sql language is sql", langs["database/schema.sql"] == "sql")
    check("README.md language is markdown", langs["README.md"] == "markdown")

    for f in bundle.files:
        check(f"{f.path} content is non-empty", len(f.content) > 20)
        check(f"{f.path} source tagged 'llm'", f.source == "llm")

    bundle_events = [e for e in result.events if e.type.value == "code_bundle_generated"]
    check(f"Exactly one code_bundle_generated event ({len(bundle_events)})", len(bundle_events) == 1)
    ev = bundle_events[0]
    check("Event actor is the Engineer", ev.actor == "Marcus Webb")
    check(
        f"Event payload has file_count={len(EXPECTED_PATHS)}",
        ev.payload.get("file_count") == len(EXPECTED_PATHS),
    )
    check(
        f"Event payload has files array of {len(EXPECTED_PATHS)}",
        len(ev.payload.get("files", [])) == len(EXPECTED_PATHS),
    )

    completed_idx = next(
        i for i, e in enumerate(result.events) if e.type.value == "run_completed"
    )
    bundle_idx = next(
        i for i, e in enumerate(result.events) if e.type.value == "code_bundle_generated"
    )
    engineer_idx = next(
        i for i, e in enumerate(result.events)
        if e.type.value == "artifact_produced" and e.payload.get("title") == "API Spec"
    )
    check(
        f"code_bundle_generated fires after API Spec ({bundle_idx} > {engineer_idx})",
        bundle_idx > engineer_idx,
    )
    check(
        f"code_bundle_generated fires before run_completed ({bundle_idx} < {completed_idx})",
        bundle_idx < completed_idx,
    )


asyncio.run(check_llm_produces_bundle())


# -------------------------------------------------------------------
# 3. LLM returns malformed content: deterministic bundle still emitted.
# -------------------------------------------------------------------
class GarbageBundleLLM(QwenClient):
    @property
    def enabled(self): return True

    async def chat(self, messages, *, temperature=0.2, max_tokens=1500, response_format=None):
        user = messages[-1]["content"]
        if "STARTER code bundle" in user:
            return "this is not JSON at all"
        if user.startswith("Intent:"):
            return '{"line": "handoff ok."}'
        return '{"summary":"ok","content":"model content"}'

    async def stream_chat(self, messages, *, temperature=0.4, max_tokens=1500):
        yield "ok"


async def check_garbage_llm_gets_deterministic_bundle() -> None:
    orch = CompanyOrchestrator(
        GarbageBundleLLM(settings), RunMemory(), default_tool_registry()
    )
    result = await orch.run("Build a budgeting app")
    check("Garbage LLM: bundle is present", result.code_bundle is not None)
    assert result.code_bundle is not None
    check("Garbage LLM: bundle source is deterministic", result.code_bundle.source == "deterministic")
    check(
        "Garbage LLM: code_bundle_generated event emitted",
        any(e.type.value == "code_bundle_generated" for e in result.events),
    )
    check(
        "Garbage LLM: run still completes",
        result.events[-1].type.value == "run_completed",
    )


asyncio.run(check_garbage_llm_gets_deterministic_bundle())


# -------------------------------------------------------------------
# 4. LLM returns placeholder/lorem content: deterministic fallback used.
# -------------------------------------------------------------------
class PlaceholderLLM(QwenClient):
    @property
    def enabled(self): return True

    async def chat(self, messages, *, temperature=0.2, max_tokens=1500, response_format=None):
        user = messages[-1]["content"]
        if "STARTER code bundle" in user:
            return json.dumps({"files": {
                "package.json": "// TODO",
                "app/page.tsx": "lorem ipsum dolor",
                "components/overview-page.tsx": "",
                "README.md": "# TODO",
            }})
        if user.startswith("Intent:"):
            return '{"line": "handoff ok."}'
        return '{"summary":"ok","content":"model content"}'

    async def stream_chat(self, messages, *, temperature=0.4, max_tokens=1500):
        yield "ok"


async def check_placeholder_gets_deterministic_bundle() -> None:
    orch = CompanyOrchestrator(
        PlaceholderLLM(settings), RunMemory(), default_tool_registry()
    )
    result = await orch.run("Build a budgeting app")
    check("Placeholder LLM: bundle is present", result.code_bundle is not None)
    assert result.code_bundle is not None
    check(
        "Placeholder LLM: bundle source is deterministic (all LLM files rejected)",
        result.code_bundle.source == "deterministic",
    )
    check(
        f"Placeholder LLM: full file set emitted ({len(result.code_bundle.files)} files)",
        len(result.code_bundle.files) == len(EXPECTED_PATHS),
    )


asyncio.run(check_placeholder_gets_deterministic_bundle())


# -------------------------------------------------------------------
# 5. Partial LLM success: valid files kept, gaps filled deterministically.
# -------------------------------------------------------------------
class PartialLLM(QwenClient):
    @property
    def enabled(self): return True

    async def chat(self, messages, *, temperature=0.2, max_tokens=1500, response_format=None):
        user = messages[-1]["content"]
        if "STARTER code bundle" in user:
            return json.dumps({"files": {
                "app/page.tsx": _GOOD_BUNDLE_FILES["app/page.tsx"],
                "components/overview-page.tsx": "// TODO",
                "lib/transactions.ts": _GOOD_BUNDLE_FILES["lib/transactions.ts"],
                "database/schema.sql": _GOOD_BUNDLE_FILES["database/schema.sql"],
                "README.md": _GOOD_BUNDLE_FILES["README.md"],
            }})
        if user.startswith("Intent:"):
            return '{"line": "handoff ok."}'
        return '{"summary":"ok","content":"model content"}'

    async def stream_chat(self, messages, *, temperature=0.4, max_tokens=1500):
        yield "ok"


async def check_partial_hybrid_bundle() -> None:
    orch = CompanyOrchestrator(
        PartialLLM(settings), RunMemory(), default_tool_registry()
    )
    result = await orch.run("Build a budgeting app")
    check("Partial LLM: bundle is present", result.code_bundle is not None)
    bundle = result.code_bundle
    assert bundle is not None
    check("Partial LLM: bundle source is hybrid", bundle.source == "hybrid")
    check(
        f"Partial LLM: complete file set ({len(bundle.files)} files)",
        len(bundle.files) == len(EXPECTED_PATHS),
    )
    accepted_paths = {f.path for f in bundle.files}
    llm_paths = {f.path for f in bundle.files if f.source == "llm"}
    check("Partial LLM: app/page.tsx from LLM", "app/page.tsx" in llm_paths)
    check(
        "Partial LLM: rejected placeholder filled deterministically",
        any(f.path == "components/overview-page.tsx" and f.source == "deterministic" for f in bundle.files),
    )
    check("Partial LLM: missing package.json filled", "package.json" in accepted_paths)


asyncio.run(check_partial_hybrid_bundle())


print(f"\nALL {passed} CHECKS PASSED")
