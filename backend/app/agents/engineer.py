"""EngineerAgent -- owns architecture and the API spec."""

from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from app.agents.base import WorkerAgent
from app.agents.code_bundle_templates import (
    build_deterministic_bundle,
    build_deterministic_file,
    requested_file_specs,
    resolve_bundle_context,
)
from app.agents.registry import register_agent
from app.models.company import CodeBundle, GeneratedCodeFile
from app.models.domain import DeliverableSpec, ProjectPlan
from app.services.qwen_client import LLMError, LLMParseError


_ALLOWED_LANGUAGES = {"tsx", "ts", "python", "sql", "markdown", "json", "css", "text"}


@register_agent
class EngineerAgent(WorkerAgent):
    role = "Engineer"
    name = "Marcus Webb"
    initials = "MW"
    employee_id = "3"
    order = 3
    phase = "Architecture"
    phase_label = "System design and API spec"
    responsibility = "Designs system architecture and authors the API spec."
    system_prompt = (
        "You are Marcus Webb, Engineer.\n"
        "\n"
        "VOICE\n"
        "  Technical and grounded. You propose implementation tradeoffs "
        "explicitly: managed service versus self-hosted, sync versus async, "
        "monolith versus split. When you pick, you name the alternative you "
        "rejected and why. You cite the operational cost, not just the "
        "elegant abstraction. You are calm about legacy constraints.\n"
        "\n"
        "STYLE\n"
        "  Structured writing: 'Option A' / 'Option B' with a one-line "
        "recommendation and a two-line rationale. Use fenced code blocks for "
        "any signature, schema, or protocol snippet. Prefer concrete "
        "components (Postgres, Redis, ...) over abstract nouns (a 'database "
        "layer').\n"
        "\n"
        "TASK\n"
        "  Given the project, plan, and PRD, return a JSON object with keys: "
        "summary, Architecture, 'API Spec'."
    )
    available_tools = ["architecture_designer", "api_spec_writer"]
    memory_scope = "engineering"
    produces = [
        DeliverableSpec(title="Architecture", type="Blueprint"),
        DeliverableSpec(title="API Spec", type="Technical"),
    ]
    tools_for = {
        "Architecture": "architecture_designer",
        "API Spec": "api_spec_writer",
    }
    deterministic_summary = "Designed system architecture and authored the API spec."

    # -----------------------------------------------------------------
    # Code bundle generation (Qwen with deterministic fallback)
    # -----------------------------------------------------------------
    async def generate_code_bundle(
        self, project: str, plan: ProjectPlan | None
    ) -> CodeBundle:
        """Produce a starter code bundle for the project.

        Contract:
          * Always returns a :class:`CodeBundle` with at least one file.
          * Tries Qwen first when enabled; fills any missing or invalid
            files from deterministic templates.
          * ``source`` is ``llm``, ``deterministic``, or ``hybrid``.
          * Never raises.
        """
        ctx = resolve_bundle_context(project, plan)
        specs = requested_file_specs(ctx)
        llm_files: dict[str, GeneratedCodeFile] = {}

        if self.llm.enabled:
            llm_files = await self._generate_code_bundle_llm(project, plan, ctx, specs)

        accepted: list[GeneratedCodeFile] = []
        llm_count = 0
        det_count = 0

        for spec in specs:
            path = spec["path"]
            llm_file = llm_files.get(path)
            if llm_file is not None:
                accepted.append(llm_file)
                llm_count += 1
                continue
            fallback = build_deterministic_file(path, ctx)
            if fallback is not None:
                accepted.append(fallback)
                det_count += 1

        if not accepted:
            return build_deterministic_bundle(project, plan)

        if llm_count > 0 and det_count > 0:
            source = "hybrid"
        elif llm_count > 0:
            source = "llm"
        else:
            source = "deterministic"

        return CodeBundle(files=accepted, source=source)

    async def _generate_code_bundle_llm(
        self,
        project: str,
        plan: ProjectPlan | None,
        ctx: Any,
        specs: list[dict[str, str]],
    ) -> dict[str, GeneratedCodeFile]:
        """Ask Qwen for starter files; return a path -> file map (may be empty)."""
        plan_ctx: dict[str, Any] = {}
        if plan is not None:
            dumped = plan.model_dump()
            for key in ("company_name", "mission", "vision", "recommended_stack"):
                if key in dumped:
                    plan_ctx[key] = dumped[key]

        prd = self.memory.recall_global("product", "PRD")

        file_specs = "\n".join(
            f"  {i + 1}. {f['path']} ({f['language']}): {f['purpose']}"
            for i, f in enumerate(specs)
        )

        files_example = ",\n".join(
            f'    "{f["path"]}": "<file contents as a JSON string>"'
            for f in specs
        )
        schema_hint = "{\n  \"files\": {\n" + files_example + "\n  }\n}"

        user_prompt = (
            f"Project: {project}\n"
            f"Company plan: {json.dumps(plan_ctx, ensure_ascii=False) or 'none'}\n"
            f"PRD summary: {(prd or 'none')[:600]}\n"
            f"Product category: {ctx.category}\n"
            f"Product name: {ctx.product_name}\n"
            "\n"
            "Produce a small, believable STARTER code bundle for this "
            "project. Not a full app; just the scaffolding a senior engineer "
            "would push in the first commit. Files to produce:\n"
            f"{file_specs}\n"
            "\n"
            "Constraints:\n"
            "  - Every file must be REAL code that at least parses. No lorem "
            "    ipsum, no placeholder comments, no '// TODO: implement'.\n"
            "  - Prefer concise over comprehensive. 40 to 120 lines per file "
            "    is right for a starter.\n"
            "  - Match the domain in the plan/PRD: budgeting terms for a "
            "    budgeting app, workout terms for a fitness app, etc.\n"
            "  - Next.js pages use the App Router. SQL is PostgreSQL. "
            "    README is plain markdown.\n"
            "  - Return ONE JSON object with a top-level \"files\" key whose "
            "value is an OBJECT mapping each path string to the file content "
            "string. Escape newlines as \\n and quotes as \\\" inside strings."
        )

        try:
            payload = await self._llm_json(
                self.system_prompt,
                user_prompt,
                schema_hint=schema_hint,
                max_tokens=6000,
            )
        except (LLMError, LLMParseError, ValueError, ValidationError) as exc:
            self.logger.info(
                "Code bundle LLM call failed (%s); using deterministic fallback.", exc
            )
            return {}

        files_map = _normalize_files_payload(payload)
        if not files_map:
            self.logger.info(
                "Code bundle payload missing 'files' object; using deterministic fallback."
            )
            return {}

        accepted: dict[str, GeneratedCodeFile] = {}
        spec_by_path = {s["path"]: s for s in specs}
        for path, raw in files_map.items():
            if path not in spec_by_path:
                continue
            content = _coerce_file_content(raw)
            if content is None:
                continue
            content = content.strip()
            if len(content) < 20:
                continue
            if _looks_like_placeholder(content):
                continue
            language = spec_by_path[path]["language"]
            if language not in _ALLOWED_LANGUAGES:
                language = "text"
            accepted[path] = GeneratedCodeFile(
                path=path,
                language=language,
                content=content,
                source="llm",
            )

        if not accepted:
            self.logger.info(
                "Code bundle LLM produced no valid files; using deterministic fallback."
            )
        return accepted


def _normalize_files_payload(payload: Any) -> dict[str, Any]:
    """Accept LLM ``files`` as a path-keyed object or an array of file records."""
    if not isinstance(payload, dict):
        return {}
    files_raw = payload.get("files")
    if isinstance(files_raw, dict) and files_raw:
        return files_raw
    if isinstance(files_raw, list):
        mapped: dict[str, Any] = {}
        for entry in files_raw:
            if not isinstance(entry, dict):
                continue
            path = entry.get("path")
            if not isinstance(path, str) or not path:
                continue
            if "content" in entry:
                mapped[path] = entry["content"]
            elif "contents" in entry:
                mapped[path] = entry["contents"]
        return mapped
    return {}


def _coerce_file_content(raw: Any) -> str | None:
    if isinstance(raw, str):
        return raw
    if isinstance(raw, list) and all(isinstance(x, str) for x in raw):
        return "\n".join(raw)
    return None


def _looks_like_placeholder(content: str) -> bool:
    """Reject obviously bogus content (lorem, TODO comments as the whole body)."""
    stripped = content.strip().lower()
    if "lorem ipsum" in stripped:
        return True
    if stripped.startswith("// todo") or stripped.startswith("# todo"):
        return True
    if stripped in {"", "n/a", "todo", "tbd"}:
        return True
    return False
