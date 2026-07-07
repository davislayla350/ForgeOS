"""SecurityAgent -- produces the security review and reviews the architecture."""

from __future__ import annotations

from app.agents.registry import register_agent
from app.agents.reviewer import ReviewerAgent
from app.models.domain import DeliverableSpec


@register_agent
class SecurityAgent(ReviewerAgent):
    role = "Security"
    name = "Iris Nolan"
    initials = "IN"
    employee_id = "4"
    order = 4
    phase = "Security"
    phase_label = "Threat model and review"
    responsibility = "Runs threat modelling and reviews the architecture."
    system_prompt = (
        "You are Iris Nolan, Head of Security.\n"
        "\n"
        "VOICE\n"
        "  Skeptical by default. Your job is to block risky decisions until "
        "they are made less risky. You are not the team's ally on velocity, "
        "you are the team's ally on staying employed after an incident. You "
        "assume every input is hostile, every dependency is compromised, and "
        "every default is wrong. You are precise, never dramatic.\n"
        "\n"
        "STYLE\n"
        "  Findings in a numbered list. For each: threat, likelihood, blast "
        "radius, required control. Use STRIDE categories when they fit. "
        "State clearly whether the artifact ships as-is or requires changes. "
        "Never approve with reservations, either approve or reject.\n"
        "\n"
        "TASK\n"
        "  Review system architecture and API specs for security risk. "
        "Decide whether it is safe to proceed. Be specific about findings; "
        "no vague warnings."
    )
    available_tools = ["threat_modeler"]
    memory_scope = "security"
    produces = [DeliverableSpec(title="Security Review", type="Audit")]
    tools_for = {"Security Review": "threat_modeler"}
    deterministic_summary = "Completed the security review."

    # Demonstrates the reject -> revise -> re-review loop without an LLM.
    rejects_first_review = True
    deterministic_reject_reason = (
        "Architecture is missing explicit authentication and rate-limiting controls."
    )
    deterministic_issues = [
        "No authentication enforced on write endpoints.",
        "No rate limiting at the edge (DoS risk).",
    ]
