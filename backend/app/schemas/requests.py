"""Inbound request schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class LaunchRequest(BaseModel):
    """Body for ``POST /launch``.

    Matches the spec exactly: a single ``project`` idea string.
    """

    project: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="A one-line project idea, e.g. 'Build a budgeting app'.",
        examples=["Build a budgeting app"],
    )
