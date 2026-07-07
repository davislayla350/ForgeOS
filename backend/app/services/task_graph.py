"""TaskGraph -- a dependency DAG for tasks.

The orchestrator builds a graph of tasks with ``depends_on`` edges, then drives
execution by repeatedly asking which tasks are *ready* (all dependencies
completed). This decouples "what depends on what" from "what order to run",
which is what makes the engine genuinely dependency-driven rather than a loop.
"""

from __future__ import annotations

from app.models.company import Task, TaskStatus


class TaskGraphError(RuntimeError):
    """Raised for invalid graphs (missing dependency, cycle, deadlock)."""


class TaskGraph:
    """A directed acyclic graph of tasks keyed by task id."""

    def __init__(self) -> None:
        self._tasks: dict[str, Task] = {}

    def add_task(self, task: Task) -> None:
        if task.id in self._tasks:
            raise TaskGraphError(f"Duplicate task id: {task.id}")
        self._tasks[task.id] = task

    def add_dependency(self, task_id: str, depends_on_id: str) -> None:
        if task_id not in self._tasks:
            raise TaskGraphError(f"Unknown task: {task_id}")
        if depends_on_id not in self._tasks:
            raise TaskGraphError(f"Unknown dependency: {depends_on_id}")
        if depends_on_id not in self._tasks[task_id].depends_on:
            self._tasks[task_id].depends_on.append(depends_on_id)

    def tasks(self) -> list[Task]:
        return list(self._tasks.values())

    def get(self, task_id: str) -> Task:
        return self._tasks[task_id]

    def ready(self) -> list[Task]:
        """Pending tasks whose dependencies are all completed."""
        ready: list[Task] = []
        for task in self._tasks.values():
            if task.status is not TaskStatus.PENDING:
                continue
            if all(
                self._tasks[dep].status is TaskStatus.COMPLETED
                for dep in task.depends_on
            ):
                ready.append(task)
        return ready

    def dependents_of(self, task_id: str) -> list[Task]:
        """Tasks that depend directly on the given task."""
        return [t for t in self._tasks.values() if task_id in t.depends_on]

    def mark_running(self, task_id: str) -> None:
        self._tasks[task_id].status = TaskStatus.RUNNING

    def mark_completed(self, task_id: str) -> None:
        self._tasks[task_id].status = TaskStatus.COMPLETED

    def is_complete(self) -> bool:
        return all(t.status is TaskStatus.COMPLETED for t in self._tasks.values())

    def validate(self) -> None:
        """Ensure all dependencies exist and the graph is acyclic."""
        for task in self._tasks.values():
            for dep in task.depends_on:
                if dep not in self._tasks:
                    raise TaskGraphError(
                        f"Task {task.id} depends on unknown task {dep}"
                    )
        self._assert_acyclic()

    def _assert_acyclic(self) -> None:
        """Depth-first cycle detection (white/grey/black colouring)."""
        white, grey, black = 0, 1, 2
        colour = {tid: white for tid in self._tasks}

        def visit(tid: str) -> None:
            colour[tid] = grey
            for dep in self._tasks[tid].depends_on:
                if colour[dep] == grey:
                    raise TaskGraphError(f"Dependency cycle detected at {tid} -> {dep}")
                if colour[dep] == white:
                    visit(dep)
            colour[tid] = black

        for tid in self._tasks:
            if colour[tid] == white:
                visit(tid)
