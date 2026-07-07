"""ReviewerAgent -- a worker that can also review a peer's artifact.

Single responsibility, open for extension: a reviewer is a normal
:class:`WorkerAgent` (it still produces its own deliverable, e.g. a Security
Review or Test Plan) that additionally implements ``review`` to issue an
approve/reject verdict on another agent's work.

The verdict comes from the LLM when available. If the LLM is unavailable, errors,
or returns invalid output, a deterministic policy is used:
  * reject the first submission (revision 0) when ``rejects_first_review`` is set,
    then approve the revision -- this exercises the full reject -> revise ->
    re-review loop without an LLM;
  * approve otherwise.
"""

from __future__ import annotations

from typing import ClassVar

from app.agents.base import WorkerAgent
from app.models.company import ReviewOutcome, ReviewVerdict
from app.services.qwen_client import LLMError, LLMParseError


class ReviewerAgent(WorkerAgent):
    """A worker agent that can review another agent's artifact."""

    #: When True, the deterministic policy rejects the first submission once.
    rejects_first_review: ClassVar[bool] = False
    #: A short, role-specific reason used in the deterministic rejection.
    deterministic_reject_reason: ClassVar[str] = "Issues found that must be addressed."
    #: Concrete issues listed in the deterministic rejection.
    deterministic_issues: ClassVar[list[str]] = []

    async def review(
        self, target: str, target_content: str, project: str, revision: int
    ) -> ReviewOutcome:
        """Evaluate ``target_content`` and return an approve/reject outcome."""
        if self.llm.enabled:
            try:
                return await self._review_with_llm(target, target_content, revision)
            except LLMParseError as exc:
                self.logger.warning(
                    "LLM review content unparseable (%s); using deterministic verdict.",
                    exc,
                )
            except (LLMError, ValueError) as exc:
                self.logger.warning(
                    "LLM review failed (%s); using deterministic verdict.", exc
                )
        return self._review_deterministically(target, revision)

    async def _review_with_llm(
        self, target: str, target_content: str, revision: int
    ) -> ReviewOutcome:
        payload = await self._llm_json(
            self.system_prompt,
            (
                f"Review the following '{target}' (revision {revision}). Decide "
                "whether to approve or reject it based on the review criteria "
                "in your system prompt.\n\n"
                f"Artifact:\n{target_content}"
            ),
            schema_hint=(
                '{\n'
                '  "verdict": "approved" | "rejected",\n'
                '  "comments": "<one to three sentence summary of your review>",\n'
                '  "issues": ["<short issue>", "..."]  // empty list if approved\n'
                '}'
            ),
            max_tokens=800,
        )
        verdict_raw = str(payload.get("verdict", "approved")).lower()
        verdict = (
            ReviewVerdict.REJECTED
            if verdict_raw.startswith("reject")
            else ReviewVerdict.APPROVED
        )
        issues = payload.get("issues") or []
        if not isinstance(issues, list):
            issues = [str(issues)]
        return ReviewOutcome(
            reviewer=self.role,
            target=target,
            verdict=verdict,
            comments=str(payload.get("comments", "")),
            issues=[str(i) for i in issues],
            revision=revision,
            source="llm",
        )

    def _review_deterministically(self, target: str, revision: int) -> ReviewOutcome:
        if self.rejects_first_review and revision == 0:
            return ReviewOutcome(
                reviewer=self.role,
                target=target,
                verdict=ReviewVerdict.REJECTED,
                comments=self.deterministic_reject_reason,
                issues=list(self.deterministic_issues),
                revision=revision,
                source="deterministic",
            )
        return ReviewOutcome(
            reviewer=self.role,
            target=target,
            verdict=ReviewVerdict.APPROVED,
            comments=f"{target} meets the bar after revision {revision}."
            if revision
            else f"{target} approved.",
            issues=[],
            revision=revision,
            source="deterministic",
        )
