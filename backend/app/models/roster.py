"""Employee profile type.

The actual roster is now *derived from the registered agents* (see
``app.agents.registry.build_roster``), so adding one agent class adds the
employee everywhere. This module only defines the shared shape.
"""

from __future__ import annotations

from pydantic import BaseModel


class EmployeeProfile(BaseModel):
    """A company employee profile (mirrors AIEmployee in the frontend)."""

    id: str
    name: str
    role: str
    initials: str
    responsibility: str
