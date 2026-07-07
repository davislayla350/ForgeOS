# ForgeOS Backend

Production-style FastAPI backend for ForgeOS, an "AI Operating System" where
autonomous software-engineering agents collaborate like a real company. This
service takes a one-line project idea and returns the CEO agent's structured
project plan, plus a ready-to-render orchestration payload for the existing
frontend.

## Why the response has two parts

The shipped frontend (`use-orchestration.ts`) does **not** call a backend. It
replays a hardcoded, timed `ORCHESTRATION_STEPS` script entirely on the client.
So this backend returns:

1. `plan` — the CEO's structured project plan (the core deliverable).
2. `orchestration` — that plan projected into the frontend's exact step format
   (`employeeId`, `docType` camelCase keys included), so the UI can be switched
   from its canned script to live backend data with a one-line import change in
   the hook.

## Architecture

```
app/
  api/          # routes.py (POST /launch, GET /health) + DI providers
  agents/       # base.py (BaseAgent), registry.py (@register_agent), tools.py
  agents/       #   ceo.py, product_manager.py, engineer.py,
  agents/       #   security.py, qa.py, devops.py  (one class per employee)
  services/     # qwen_client.py (LLM) + orchestrator.py (runs the crew)
  memory/       # store.py: RunContext + ScopedMemory (blackboard) + RunMemory
  models/       # domain.py (ProjectPlan, AgentResponse, ...) + roster.py
  schemas/      # requests / responses / orchestration (frontend contract)
  config.py     # pydantic-settings + python-dotenv + logging
  main.py       # app factory + lifespan DI wiring + CORS
```

Separation of concerns: agents reason, services coordinate and talk to the LLM,
schemas define the wire contract, memory persists runs, the API is a thin shell.

### Agent model

Every employee subclasses `BaseAgent`. `generate_response()` is implemented
**once** on the base (template method: try LLM, fall back to deterministic,
assemble a uniform `AgentResponse`) so there is no duplicated control flow.

Each agent only declares its identity and config, and one small builder:

| Attribute | Meaning |
|---|---|
| `role`, `name`, `initials`, `employee_id`, `order` | identity + sequence |
| `system_prompt` | the LLM persona/instructions for this agent |
| `available_tools` | whitelist enforced by the agent's `ToolBelt` |
| `memory_scope` | which slice of the shared `RunContext` it owns |
| `produces` | the deliverables it emits (drives plan + UI cards) |
| `_respond_deterministically()` | the only required method to implement |

Composition: each agent is constructed with an LLM client, a `ScopedMemory`
(its scope of the shared blackboard), and a `ToolBelt` (its allowed tools). The
CEO writes the plan into the `company` scope; downstream agents read it via
`recall_global("company", "plan")`.

### Adding an employee = one new class

1. Create `app/agents/<role>.py` with a class that subclasses `BaseAgent`,
   sets the attributes above, and is decorated with `@register_agent`.
2. Import it in `app/agents/__init__.py` so it registers.

That's it. The roster, the CEO's plan (milestones + deliverables), the run
sequence, and the orchestration payload are all derived from the registry, so
they pick up the new agent automatically. `verify.py` proves this by adding a
7th agent at runtime: the plan grows to 7 deliverables and the new card appears
in the orchestration steps with no other edits.

## Orchestration engine (CompanyOrchestrator)

`CompanyOrchestrator` is the real engine. The older `Orchestrator` is kept only
as the frontend step-script projection; the engine is event-first.

The engine runs a realistic, message-driven delivery workflow. It is **not** a
fixed timer: each stage advances only when the prior work is done and the right
messages/reviews have flowed.

```
CEO        -> project vision + plan
PM         -> PRD / requirements          (message: PM -> Engineer)
Engineer   -> architecture + impl plan    (request review: Engineer -> Security)
Security   -> reviews architecture
              approve -> proceed
              reject  -> Engineer revises -> Security re-reviews   (bounded loop)
              exceeded MAX_REVISIONS -> escalate to CEO, who overrides to unblock
QA         -> test strategy + reviews the implementation (same bounded loop)
DevOps     -> deployment plan + approves the release
CEO        -> publishes the final project summary
```

Pieces (each a separate, testable component):

| Component | File | Job |
|---|---|---|
| `CompanyMessageBus` | `services/company_message_bus.py` | message + review protocol; each action becomes an event |
| `ReviewerAgent` | `agents/reviewer.py` | approve/reject verdicts (LLM or deterministic) |
| `EventBus` | `services/event_bus.py` | ordered log + async fan-out to subscribers |
| `TaskGraph` | `services/task_graph.py` | task records + dependency chain + cycle check |
| `CompanyOrchestrator` | `services/company_orchestrator.py` | drives the staged workflow |

Why staged, not a single DAG: the review steps are **loops** (reject -> revise
-> re-review), and a DAG cannot contain a cycle. The `TaskGraph` still records
the deliverables and their linear dependency chain; the orchestrator drives the
cyclic review logic explicitly. Termination is guaranteed: each loop is capped
at `MAX_REVISIONS`, after which the reviewer escalates to the CEO, who overrides
to unblock. The deterministic Security reviewer rejects exactly once (to
exercise the loop) then approves; QA approves by default. When Qwen is live, the
model decides each verdict, still bounded by the cap + escalation.

### Agent states

Each agent moves through `AgentState`: `idle -> working -> waiting -> reviewing
-> blocked -> complete`. Every transition emits an `agent_state_changed` event.
Agents carry an `inbox`, an `outbox`, and a `task_queue`; the message bus
delivers each message to the recipient's inbox and the sender's outbox.

### Two entry points, one driver

`run(project)` awaits the whole run and returns a `CompanyRunResult` (plan +
tasks + final agent state + messages + the full event list).

`stream(project)` is the websocket path: it yields each event as a JSON dict the
moment it happens. A future websocket handler is just:

```python
@app.websocket("/company/stream")
async def company_stream(ws: WebSocket):
    await ws.accept()
    body = await ws.receive_json()
    async for event in app.state.company_orchestrator.stream(body["project"]):
        await ws.send_json(event)   # already JSON-serialisable
```

Because both paths share the same driver and emit through the `EventBus`, the
streamed events are identical to the ones in the non-streaming result (verified).

### HTTP surface

`POST /company/launch` returns the structured `CompanyRunResult` JSON. Example
event shape:

```json
{ "seq": 4, "type": "plan_created", "timestamp": "2026-06-30T20:40:00Z",
  "actor": "Aria Chen", "payload": { "company_name": "Budgeting Labs", "plan": { … } } }
```

## The LLM ("no API key yet")

`QwenClient` speaks the OpenAI-compatible chat-completions protocol. With no
`QWEN_API_KEY` set it reports `enabled == False` and makes no network calls; the
`CEOAgent` then uses a deterministic planner. The same fallback fires if a real
call errors or returns unparseable JSON. Drop a key into `.env` to go live — no
code changes.

## Run locally

```bash
pip install -r requirements.txt
cp .env.example .env          # optional; defaults work without a key
uvicorn app.main:app --reload --port 8000
```

```bash
curl -s localhost:8000/launch \
  -H "Content-Type: application/json" \
  -d '{"project": "Build a budgeting app"}' | python -m json.tool
```

Interactive docs at `http://localhost:8000/docs`.

## Run with Docker

```bash
docker build -t forgeos-backend .
docker run --rm -p 8000:8000 --env-file .env forgeos-backend
```

## Verify

```bash
python verify.py          # agents: inheritance, registry, one-class extension
python verify_company.py  # engine: task DAG, scheduling, events, messages, stream
```

## API

### `POST /launch`
Request:
```json
{ "project": "Build a budgeting app" }
```
Response (abridged):
```json
{
  "status": "ok",
  "run_id": "…",
  "llm_enabled": false,
  "plan": { "project": "…", "company_name": "Budgeting Labs", "team": [ … ], "deliverables": [ … ], … },
  "orchestration": {
    "projectIdea": "Build a budgeting app",
    "durationMs": 15000,
    "employees": [ … 6 … ],
    "steps": [ { "type": "activate", "employeeId": "1", "at": 0 }, … ]
  }
}
```

### `GET /health`
Returns `{ "status": "ok", "app_env": "…", "llm_enabled": false }`.

## Connecting the frontend (optional, one change)

In `src/hooks/use-orchestration.ts`, instead of importing the static
`ORCHESTRATION_STEPS`, fetch `POST /launch` inside `launch()` and feed
`response.orchestration.steps` and `.employees` into the existing reducer. The
step shape already matches `OrchestrationStep` in `orchestration-types.ts`.
```

## Tech

Python 3.12 · FastAPI · Pydantic v2 · pydantic-settings · python-dotenv · httpx
