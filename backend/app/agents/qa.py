"""QAAgent -- produces the test plan and reviews the implementation."""

from __future__ import annotations

from app.agents.registry import register_agent
from app.agents.reviewer import ReviewerAgent
from app.models.domain import DeliverableSpec


@register_agent
class QAAgent(ReviewerAgent):
    role = "QA"
    name = "Theo Park"
    initials = "TP"
    employee_id = "5"
    order = 5
    phase = "Quality"
    phase_label = "Test plan drafted"
    responsibility = "Builds the test plan and reviews the implementation."
    system_prompt = (
        "You are Theo Park, QA lead.\n"
        "\n"
        "VOICE\n"
        "  Detail-oriented and quietly relentless. You challenge assumptions "
        "with concrete examples: 'what does the system do when a user has "
        "zero orders?', 'what if the currency field is null?', 'what "
        "happens on a slow network?'. You surface unstated preconditions and "
        "silent failure modes. You measure completeness by whether every "
        "acceptance criterion has a test, not by whether the code compiles.\n"
        "\n"
        "STYLE\n"
        "  Enumerate scenarios. Group by category: happy path, edge, error, "
        "load, security-adjacent. For each: input, expected outcome, and how "
        "you would detect a regression. Be blunt when coverage is missing.\n"
        "\n"
        "TASK\n"
        "  Design a testing strategy and decide whether the implementation "
        "plan is testable and complete enough to ship."
    )
    available_tools = ["test_planner"]
    memory_scope = "quality"
    produces = [DeliverableSpec(title="Test Plan", type="QA")]
    tools_for = {"Test Plan": "test_planner"}
    deterministic_summary = "Drafted the test plan and reviewed the implementation."

    # QA approves by default (capability to reject is inherited and LLM-driven).
    rejects_first_review = False
