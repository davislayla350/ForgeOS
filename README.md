# ForgeOS

> **An AI-powered multi-agent operating system for software development.**

ForgeOS transforms a single project idea into a structured software development workspace using a team of specialized AI agents. Instead of relying on one large prompt, ForgeOS coordinates multiple role-based agents, including a CEO, Product Manager, Engineer, QA, Security, Reviewer, and DevOps, to collaboratively plan, review, and build a software project.

**Global AI Hackathon Series with Qwen Cloud** — **Track 3: Agent Society**.

---

## Features

- Multi-agent collaboration with specialized AI roles
- Live event streaming through a desktop-inspired dashboard
- AI-generated project planning and implementation roadmap
- Code Explorer with copy and ZIP download support
- Artifact Center for generated documentation and assets
- Investor Snapshot with business-focused project insights
- Automatic fallback to demo mode when AI services are unavailable
- Fully deployed with Vercel (frontend) and Render (backend)

---

## Tech Stack

### Frontend
- Next.js 15
- React
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Framer Motion

### Backend
- FastAPI
- Python
- WebSockets

### AI
- Qwen (qwen-plus)
- DashScope OpenAI-Compatible API

### Deployment
- Vercel
- Render
- UptimeRobot

---

## Project Structure

```text
forgeOS/
├── frontend/   # Next.js application
└── backend/    # FastAPI multi-agent service
```

---

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Visit:

http://localhost:3000

---

## How It Works

1. Enter a project idea.
2. ForgeOS creates a software development plan.
3. Specialized AI agents collaborate on different responsibilities.
4. Progress streams live through the dashboard.
5. Generated code, documentation, and project artifacts are available for review, copying, or ZIP download.

---

## Why Multiple Agents?

Rather than relying on a single AI prompt, ForgeOS assigns specialized responsibilities across multiple agents.

- **CEO** defines the overall strategy.
- **Product Manager** creates the implementation roadmap.
- **Engineer** generates technical solutions.
- **QA** validates functionality.
- **Security** reviews potential risks.
- **Reviewer** evaluates overall quality.
- **DevOps** prepares the final deliverable.

This role-based workflow creates a more structured development process while demonstrating collaborative AI agents for the **Agent Society** track.

---

## Deployment

- **Frontend:** Vercel
- **Backend:** Render
- **Monitoring:** UptimeRobot

---

## Security

- Server-side API key storage
- Rate limiting
- Input validation
- Configurable CORS
- No persistent user data
- Graceful demo mode when AI services are unavailable

---

## Notes for Judges

- ForgeOS works even without an API key using deterministic demo mode.
- Live AI mode activates automatically once a valid API key is configured.
- Privacy Policy: `/privacy`
- Terms of Service: `/terms`