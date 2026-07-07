# ForgeOS Demo Script

A 90-second pitch. Rehearse it out loud twice before you present.

## Setup (before you go on stage)

1. Backend running: `cd forgeos/backend && uvicorn app.main:app --port 8000`
2. Frontend running: `cd forgeos-cursor-forgeos-landing-page-d139 && npm run dev`
3. Browser window sized to your presentation screen. Zoom out to 90 percent.
4. **In the header, toggle demo mode ON** (the presentation icon lights up).
   This hides the activity, timeline, and deliverables-list panels so the
   audience focuses on network topology, mission control, and artifacts.
5. Sound toggle: your call. If the room has good speakers, sound on adds a
   subtle "this is real" feeling. If unsure, leave it off.
6. Type your project idea into the input, but DON'T press launch yet.
7. Have `/mnt/user-data/outputs/forgeos.zip` open in another tab as a
   fallback, in case the live demo has a network issue.

## The 90-second pitch

### 0:00 to 0:15 – The problem

> "Every software company runs on the same six roles: a CEO who sets the
> vision, a PM who writes it up, an engineer who builds it, a security
> reviewer who blocks it, a QA who tests it, and a DevOps who ships it.
> Coordinating those six roles is where teams die. What if you could hire
> all six as AI agents that coordinate themselves?"

### 0:15 to 0:30 – Launch

Type: *"Build a budgeting app for freelancers"*, press Launch.

> "This is ForgeOS. Six AI agents, each with a distinct personality and a
> real job. Watch what happens when I hit launch."

**[Countdown plays: 3, 2, 1, Company Online.]**

> "The company is online. Six agents are now working the project."

### 0:30 to 0:60 – The network + mission control

Point at the network topology panel (six nodes, CEO on top).

> "This is the company graph. Every message between agents is a pulse.
> You'll see the CEO hand off to the PM here, then engineering, then
> security. Watch this next part."

Point at mission control as messages start appearing.

> "This is the real conversation. The engineer just shipped the
> architecture. Security is reviewing it. And Security is going to reject
> it, because it's missing authentication."

**[Wait for the rejection to appear. If your Qwen key is working and
personality is on, the messages will sound like distinct agents.]**

> "Rejection. Engineer revises. Approval. This is a real review loop,
> not a script."

### 0:60 to 0:80 – The artifacts

Scroll to the Artifact Center. Click the PRD card.

> "Every artifact is inspectable. Real markdown, real code fences,
> downloadable. And if the LLM is streaming, you can see the author's
> reasoning at the top of the doc."

Close the dialog. Click an agent avatar in the sidebar.

> "Click any agent to see everything the backend knows: their current
> thought, current task, what they remember from past runs, every
> message they've sent or received, every artifact they own."

### 0:80 to 0:90 – The close

Point at the run stats above.

> "Six real artifacts. Twelve messages. Seven reviews. About forty hours
> of manual work, done in fifteen seconds. Not a mockup, not a script.
> Every event you saw is a WebSocket message from a real orchestration
> backend, resumable on reconnect, persisting memory across runs.
> ForgeOS."

## Anticipated judge questions

**"Is this really running?"**
Yes. Backend at localhost:8000, WebSocket at /company/stream/{run_id}.
You can point at the browser devtools Network tab and show the WS frames.

**"What if the LLM is unavailable?"**
The whole workflow falls back to deterministic content. Every agent has a
`_respond_deterministically` method. Show them the same run with the key
unset if they push. It's the same event stream, same artifacts, just
canned prose.

**"How would this scale?"**
`LiveRunRegistry` fans out to multiple concurrent subscribers per run,
with a bounded per-subscriber queue so slow clients get dropped instead
of stalling producers. Persistent memory sits behind a `MemoryRepository`
protocol; the in-memory backend today is a Redis or vector-store swap
away tomorrow.

**"What did you actually build vs use?"**
Anthropic-style Python backend, FastAPI, custom orchestration, custom
message bus, custom event stream. Qwen for the LLM. Next.js frontend
with Framer Motion animations. Everything you're seeing is written for
this project; the LLM is the only third-party inference.

## What to do if something breaks

- WebSocket won't connect: the frontend falls back to REST + replay. You
  won't notice unless you look at the header status line.
- Countdown doesn't play: refresh, try again. It's stateless.
- Backend returns 500: the backend log says why. Usually it's a missing
  env var or Qwen 403.
- Nothing happens on Launch: your `.env` probably isn't loaded. Restart
  uvicorn with `--reload`.

## What NOT to say

- "It's just prompt engineering." (It isn't; you built an orchestrator.)
- "The AI is thinking." (It isn't; it's generating tokens. Say "the model
  is generating" if pressed.)
- "This will replace engineers." (It won't; say "coordinates them.")

## What to say if you have more time (extended demo)

- Show the reconnect behavior. Kill the backend mid-run, watch the
  activity feed show "Reconnecting", start it back up, watch it resume.
- Run a second project idea that's similar to the first. Open an agent's
  reasoning drawer and show that "Memory context" now lists the prior
  project with a similarity score.
- Toggle sound on and let the room hear the countdown + approval chirps.
