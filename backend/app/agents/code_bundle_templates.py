"""Deterministic starter code bundles for the Engineer agent.

Mirrors the frontend ``generated-files.ts`` / ``product-templates.ts``
classifier so the backend can always emit a valid ``CodeBundle`` when Qwen
is disabled or returns unusable output. Every file is real, parseable code.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Literal

from app.models.company import CodeBundle, GeneratedCodeFile
from app.models.domain import ProjectPlan

ProductCategory = Literal[
    "budgeting",
    "fitness",
    "reservation",
    "flashcards",
    "task_manager",
    "chatbot",
    "productivity",
]

_TOKEN_RE = re.compile(r"[a-z0-9]+")

_STOP_WORDS = frozenset({
    "a", "an", "the", "for", "of", "to", "in", "on", "at", "with", "and",
    "or", "build", "make", "create", "app", "application", "platform",
    "system", "tool", "service", "website", "site",
})

_CATEGORY_KEYWORDS: dict[ProductCategory, tuple[str, ...]] = {
    "budgeting": (
        "budget", "budgeting", "finance", "expense", "expenses", "spending",
        "money", "wallet", "bookkeeping", "accounting", "ledger",
    ),
    "fitness": (
        "fitness", "workout", "workouts", "gym", "exercise", "exercises",
        "training", "strength", "cardio", "running", "run", "runner", "yoga",
        "athletic", "sport", "sports", "coaching",
    ),
    "reservation": (
        "restaurant", "reservation", "reservations", "booking", "bookings",
        "table", "tables", "dining", "hospitality", "cafe", "bar", "bistro",
    ),
    "flashcards": (
        "flashcard", "flashcards", "study", "studying", "learn", "learning",
        "memorize", "memorization", "spaced", "repetition", "vocab", "vocabulary",
        "quiz", "quizzes", "tutor", "language",
    ),
    "task_manager": (
        "kanban", "task", "tasks", "todo", "todos", "board", "boards",
        "sprint", "backlog", "ticket", "tickets", "jira", "trello",
        "project", "issue", "issues",
    ),
    "chatbot": (
        "chatbot", "chat", "conversation", "conversational", "assistant",
        "bot", "messaging", "message", "support", "helpdesk", "ai",
        "gpt", "llm",
    ),
}

_CATEGORY_ROUTE: dict[ProductCategory, str] = {
    "budgeting": "transactions",
    "fitness": "workouts",
    "reservation": "reservations",
    "flashcards": "cards",
    "task_manager": "cards",
    "chatbot": "messages",
    "productivity": "items",
}

_CATEGORY_NAME_SEED: dict[ProductCategory, str] = {
    "budgeting": "Ledger",
    "fitness": "Peak",
    "reservation": "Table",
    "flashcards": "Recall",
    "task_manager": "Board",
    "chatbot": "Chat",
    "productivity": "Stack",
}

_CATEGORY_TAGLINE: dict[ProductCategory, str] = {
    "budgeting": "Every dollar accounted for, without the spreadsheet drudgery.",
    "fitness": "The training log that adapts as you get stronger.",
    "reservation": "Reservations, floor plans, and covers in one calm surface.",
    "flashcards": "Spaced-repetition that actually sticks, without the friction.",
    "task_manager": "Kanban that stays out of the way when the team's shipping.",
    "chatbot": "A conversational interface your users won't want to leave.",
    "productivity": "The lightweight tool your team will actually keep open.",
}

_CATEGORY_FALLBACK_STACK: dict[ProductCategory, list[str]] = {
    "budgeting": ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "Tailwind", "Plaid API"],
    "fitness": ["Next.js", "TypeScript", "Supabase", "PostgreSQL", "Tailwind", "Chart.js"],
    "reservation": ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "Tailwind", "Twilio"],
    "flashcards": ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "Tailwind", "Redis"],
    "task_manager": ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "Tailwind", "dnd-kit"],
    "chatbot": ["Next.js", "TypeScript", "PostgreSQL", "pgvector", "Tailwind", "OpenAI SDK"],
    "productivity": ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "Tailwind", "tRPC"],
}

_CATEGORY_PREVIEW: dict[ProductCategory, dict[str, Any]] = {
    "budgeting": {
        "nav": "Overview",
        "primary_cta": "New transaction",
        "page_subtitle": "October 2026",
        "stat": {"label": "Net cash flow", "value": "$4,218.42", "delta": "+12.4%"},
        "stats": [
            {"label": "Total spending", "value": "$3,806.19"},
            {"label": "Savings rate", "value": "18.7%"},
        ],
        "table_columns": ["Merchant", "Category", "Amount"],
        "table_rows": [
            {"primary": "Whole Foods", "secondary": "Groceries", "metric": "-$127.42"},
            {"primary": "Payroll deposit", "secondary": "Income", "metric": "+$3,120.00"},
            {"primary": "Con Edison", "secondary": "Utilities", "metric": "-$88.15"},
        ],
    },
    "fitness": {
        "nav": "Today",
        "primary_cta": "Log a set",
        "page_subtitle": "Upper body, Week 3 of 8",
        "stat": {"label": "Sessions this week", "value": "4 / 5", "delta": "on track"},
        "stats": [
            {"label": "Volume this week", "value": "18,420 lb"},
            {"label": "Streak", "value": "17 days"},
        ],
        "table_columns": ["Exercise", "Set × reps", "Load"],
        "table_rows": [
            {"primary": "Bench press", "secondary": "4 × 6", "metric": "185 lb"},
            {"primary": "Barbell row", "secondary": "4 × 8", "metric": "165 lb"},
            {"primary": "Overhead press", "secondary": "3 × 8", "metric": "115 lb"},
        ],
    },
    "reservation": {
        "nav": "Tonight",
        "primary_cta": "New reservation",
        "page_subtitle": "Friday, October 10 · 62 covers",
        "stat": {"label": "Covers booked", "value": "62 / 84", "delta": "74% full"},
        "stats": [
            {"label": "Turn time avg", "value": "1h 42m"},
            {"label": "No-shows YTD", "value": "2.1%"},
        ],
        "table_columns": ["Guest", "Party · time", "Table"],
        "table_rows": [
            {"primary": "Rossi, 4-top", "secondary": "6:30 PM · birthday", "metric": "T-12"},
            {"primary": "Chen party", "secondary": "7:00 PM · 2 guests", "metric": "T-04"},
            {"primary": "Nguyen VIP", "secondary": "7:15 PM · 6 guests", "metric": "T-21"},
        ],
    },
    "flashcards": {
        "nav": "Study today",
        "primary_cta": "Start reviewing",
        "page_subtitle": "38 cards due · Spanish B2, Neuroanatomy, Algorithms",
        "stat": {"label": "Cards due today", "value": "38", "delta": "-4 vs yesterday"},
        "stats": [
            {"label": "Retention (30d)", "value": "91.4%"},
            {"label": "Streak", "value": "23 days"},
        ],
        "table_columns": ["Deck", "Due · new", "Retention"],
        "table_rows": [
            {"primary": "Spanish B2 vocabulary", "secondary": "18 due · 4 new", "metric": "89%"},
            {"primary": "Neuroanatomy", "secondary": "12 due · 2 new", "metric": "93%"},
            {"primary": "Algorithms & data structures", "secondary": "6 due", "metric": "88%"},
        ],
    },
    "task_manager": {
        "nav": "My board",
        "primary_cta": "New card",
        "page_subtitle": "3 columns · 12 cards in flight",
        "stat": {"label": "In progress", "value": "5", "delta": "+1 today"},
        "stats": [
            {"label": "Completed this week", "value": "17"},
            {"label": "Blocked", "value": "2"},
        ],
        "table_columns": ["Card", "Assignee", "Column"],
        "table_rows": [
            {"primary": "Migrate billing to Stripe", "secondary": "Marcus Webb", "metric": "In progress"},
            {"primary": "Fix login redirect loop", "secondary": "Elena Voss", "metric": "In review"},
            {"primary": "Draft security incident runbook", "secondary": "Iris Nolan", "metric": "To do"},
        ],
    },
    "chatbot": {
        "nav": "Threads",
        "primary_cta": "New thread",
        "page_subtitle": "204 messages · 32 users · avg reply 380 ms",
        "stat": {"label": "Messages today", "value": "204", "delta": "+18%"},
        "stats": [
            {"label": "Avg reply latency", "value": "380 ms"},
            {"label": "Resolved without human", "value": "84%"},
        ],
        "table_columns": ["Thread", "User", "Status"],
        "table_rows": [
            {"primary": "Help with refund policy", "secondary": "user_2831", "metric": "Resolved"},
            {"primary": "How do I export data?", "secondary": "user_9104", "metric": "Resolved"},
            {"primary": "Billing charge unclear", "secondary": "user_7562", "metric": "Handoff"},
        ],
    },
    "productivity": {
        "nav": "My work",
        "primary_cta": "New item",
        "page_subtitle": "3 in progress · 2 blocked",
        "stat": {"label": "Open items", "value": "12", "delta": "-3 this week"},
        "stats": [
            {"label": "Completed this week", "value": "17"},
            {"label": "Cycle time avg", "value": "2.4 days"},
        ],
        "table_columns": ["Item", "Owner", "Status"],
        "table_rows": [
            {"primary": "Draft roadmap review", "secondary": "Elena Voss", "metric": "In progress"},
            {"primary": "Auth flow rewrite", "secondary": "Marcus Webb", "metric": "In review"},
            {"primary": "Vendor security questionnaire", "secondary": "Iris Nolan", "metric": "Blocked"},
        ],
    },
}

_CATEGORY_SCHEMA: dict[ProductCategory, str] = {
    "budgeting": """CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  merchant TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX transactions_user_time_idx
  ON transactions (user_id, occurred_at DESC);""",
    "fitness": """CREATE TABLE workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  performed_at TIMESTAMPTZ NOT NULL,
  exercise TEXT NOT NULL,
  reps INTEGER NOT NULL,
  load_lb NUMERIC(6,2) NOT NULL,
  rpe NUMERIC(2,1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX workout_sets_user_time_idx
  ON workout_sets (user_id, performed_at DESC);""",
    "reservation": """CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  guest_name TEXT NOT NULL,
  party_size INTEGER NOT NULL CHECK (party_size > 0),
  reserved_for TIMESTAMPTZ NOT NULL,
  table_id UUID REFERENCES tables(id),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'booked',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reservations_restaurant_time_idx
  ON reservations (restaurant_id, reserved_for);""",
    "flashcards": """CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ease NUMERIC(4,2) NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cards_user_due_idx ON cards (user_id, due_at);""",
    "task_manager": """CREATE TABLE kanban_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  column_key TEXT NOT NULL CHECK (column_key IN ('todo','in_progress','review','done')),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  assignee_id UUID REFERENCES users(id),
  labels TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_id, column_key, position)
);

CREATE INDEX kanban_cards_board_col_idx
  ON kanban_cards (board_id, column_key, position);""",
    "chatbot": """CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_conv_time_idx
  ON messages (conversation_id, created_at);""",
    "productivity": """CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority INTEGER NOT NULL DEFAULT 3,
  due_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX items_project_status_idx
  ON items (project_id, status);""",
}

_CATEGORY_ENTITY: dict[ProductCategory, str] = {
    "budgeting": """export type Transaction = {
  id: string;
  occurredAt: string;
  merchant: string;
  category: string;
  amountCents: number;
  currency: "USD";
};""",
    "fitness": """export type WorkoutSet = {
  id: string;
  performedAt: string;
  exercise: string;
  reps: number;
  loadLb: number;
  rpe?: number;
  notes?: string;
};""",
    "reservation": """export type Reservation = {
  id: string;
  guestName: string;
  partySize: number;
  reservedFor: string;
  tableId?: string;
  notes?: string;
  status: "booked" | "seated" | "cancelled" | "noshow";
};""",
    "flashcards": """export type Card = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  ease: number;
  intervalDays: number;
  dueAt: string;
};""",
    "task_manager": """export type KanbanCard = {
  id: string;
  boardId: string;
  columnKey: "todo" | "in_progress" | "review" | "done";
  position: number;
  title: string;
  assigneeId?: string;
  labels: string[];
};""",
    "chatbot": """export type Message = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};""",
    "productivity": """export type Item = {
  id: string;
  projectId: string;
  ownerId: string;
  title: string;
  status: "open" | "in_progress" | "blocked" | "done";
  priority: 1 | 2 | 3 | 4 | 5;
  dueOn?: string;
};""",
}

_CREATE_SCHEMA_FIELDS: dict[ProductCategory, str] = {
    "budgeting": (
        "merchant: z.string().min(1),\n"
        "  category: z.string().min(1),\n"
        "  amountCents: z.number().int()"
    ),
    "fitness": (
        "exercise: z.string().min(1),\n"
        "  reps: z.number().int().positive(),\n"
        "  loadLb: z.number().nonnegative()"
    ),
    "reservation": (
        "guestName: z.string().min(1),\n"
        "  partySize: z.number().int().positive(),\n"
        "  reservedFor: z.string().datetime()"
    ),
    "flashcards": (
        "deckId: z.string().uuid(),\n"
        "  front: z.string().min(1),\n"
        "  back: z.string().min(1)"
    ),
    "task_manager": (
        "boardId: z.string().uuid(),\n"
        "  columnKey: z.enum([\"todo\",\"in_progress\",\"review\",\"done\"]),\n"
        "  title: z.string().min(1)"
    ),
    "chatbot": (
        "conversationId: z.string().uuid(),\n"
        "  role: z.enum([\"user\",\"assistant\",\"system\"]),\n"
        "  content: z.string().min(1)"
    ),
    "productivity": (
        "projectId: z.string().uuid(),\n"
        "  title: z.string().min(1),\n"
        "  priority: z.number().int().min(1).max(5)"
    ),
}


@dataclass(frozen=True)
class BundleContext:
    """Resolved naming and category for a single run."""

    category: ProductCategory
    product_name: str
    tagline: str
    route: str
    stack: list[str]


def _tokenize(text: str) -> set[str]:
    return set(_TOKEN_RE.findall(text.lower()))


def classify_category(project: str) -> ProductCategory:
    """Keyword overlap classifier; mirrors frontend ``classifyProject``."""
    tokens = _tokenize(project)
    best: ProductCategory = "productivity"
    best_score = 0
    for category, keywords in _CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in tokens)
        if score > best_score:
            best = category
            best_score = score
    return best


def derive_product_name(
    project: str,
    category: ProductCategory,
    company_name: str | None = None,
) -> str:
    if company_name and company_name.strip():
        return company_name.strip()
    tokens = [t for t in _TOKEN_RE.findall(project.lower()) if t not in _STOP_WORDS and len(t) > 2]
    anchor = tokens[0] if tokens else None
    if not anchor:
        return _CATEGORY_NAME_SEED[category]
    return f"{anchor[0].upper()}{anchor[1:]} {_CATEGORY_NAME_SEED[category]}"


def resolve_bundle_context(project: str, plan: ProjectPlan | None) -> BundleContext:
    category = classify_category(project)
    company_name = plan.company_name if plan else None
    product_name = derive_product_name(project, category, company_name)
    tagline = (plan.mission if plan and plan.mission else None) or _CATEGORY_TAGLINE[category]
    stack = (
        list(plan.recommended_stack)
        if plan and plan.recommended_stack
        else list(_CATEGORY_FALLBACK_STACK[category])
    )
    return BundleContext(
        category=category,
        product_name=product_name,
        tagline=tagline,
        route=_CATEGORY_ROUTE[category],
        stack=stack,
    )


def requested_file_specs(ctx: BundleContext) -> list[dict[str, str]]:
    """File paths the Engineer asks Qwen to produce (matches frontend layout)."""
    route = ctx.route
    return [
        {"path": "package.json", "language": "json",
         "purpose": "Node.js project manifest with scripts and dependencies."},
        {"path": "tsconfig.json", "language": "json",
         "purpose": "TypeScript compiler configuration for Next.js."},
        {"path": "next.config.ts", "language": "ts",
         "purpose": "Next.js application configuration."},
        {"path": "app/globals.css", "language": "css",
         "purpose": "Global Tailwind CSS styles and design tokens."},
        {"path": "app/page.tsx", "language": "tsx",
         "purpose": "Next.js App Router landing page for the main dashboard."},
        {"path": "components/overview-page.tsx", "language": "tsx",
         "purpose": "Primary dashboard React component with stats and data table."},
        {"path": f"app/api/{route}/route.ts", "language": "ts",
         "purpose": "Next.js route handler for the core REST resource."},
        {"path": f"lib/{route}.ts", "language": "ts",
         "purpose": "Business logic, types, and summary loader for the dashboard."},
        {"path": "database/schema.sql", "language": "sql",
         "purpose": "PostgreSQL DDL for core tables with indexes."},
        {"path": "README.md", "language": "markdown",
         "purpose": "Project overview, stack, local dev, and deployment notes."},
    ]


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "forgeos-app"


def _build_package_json(ctx: BundleContext) -> str:
    slug = _slugify(ctx.product_name)
    return (
        "{\n"
        f'  "name": "{slug}",\n'
        '  "version": "0.1.0",\n'
        '  "private": true,\n'
        '  "scripts": {\n'
        '    "dev": "next dev",\n'
        '    "build": "next build",\n'
        '    "start": "next start",\n'
        '    "lint": "next lint",\n'
        '    "db:migrate": "prisma migrate deploy",\n'
        '    "test": "vitest run",\n'
        '    "test:e2e": "playwright test"\n'
        "  },\n"
        '  "dependencies": {\n'
        '    "next": "^15.0.0",\n'
        '    "react": "^19.0.0",\n'
        '    "react-dom": "^19.0.0",\n'
        '    "zod": "^3.23.0"\n'
        "  },\n"
        '  "devDependencies": {\n'
        '    "@types/node": "^22.0.0",\n'
        '    "@types/react": "^19.0.0",\n'
        '    "typescript": "^5.6.0",\n'
        '    "tailwindcss": "^3.4.0",\n'
        '    "vitest": "^2.0.0",\n'
        '    "playwright": "^1.48.0"\n'
        "  }\n"
        "}\n"
    )


def _build_tsconfig() -> str:
    return (
        "{\n"
        '  "compilerOptions": {\n'
        '    "target": "ES2022",\n'
        '    "lib": ["dom", "dom.iterable", "esnext"],\n'
        '    "allowJs": true,\n'
        '    "skipLibCheck": true,\n'
        '    "strict": true,\n'
        '    "noEmit": true,\n'
        '    "esModuleInterop": true,\n'
        '    "module": "esnext",\n'
        '    "moduleResolution": "bundler",\n'
        '    "resolveJsonModule": true,\n'
        '    "isolatedModules": true,\n'
        '    "jsx": "preserve",\n'
        '    "incremental": true,\n'
        '    "plugins": [{ "name": "next" }],\n'
        '    "paths": { "@/*": ["./*"] }\n'
        "  },\n"
        '  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],\n'
        '  "exclude": ["node_modules"]\n'
        "}\n"
    )


def _build_next_config() -> str:
    return (
        "import type { NextConfig } from 'next';\n"
        "\n"
        "const nextConfig: NextConfig = {\n"
        "  reactStrictMode: true,\n"
        "};\n"
        "\n"
        "export default nextConfig;\n"
    )


def _build_globals_css() -> str:
    return (
        "@tailwind base;\n"
        "@tailwind components;\n"
        "@tailwind utilities;\n"
        "\n"
        ":root {\n"
        "  --background: 222 47% 6%;\n"
        "  --foreground: 210 40% 96%;\n"
        "  --primary: 217 91% 60%;\n"
        "  --primary-foreground: 222 47% 6%;\n"
        "  --muted-foreground: 215 20% 65%;\n"
        "}\n"
        "\n"
        "body {\n"
        "  color: hsl(var(--foreground));\n"
        "  background: hsl(var(--background));\n"
        "}\n"
    )


def _build_page(ctx: BundleContext) -> str:
    preview = _CATEGORY_PREVIEW[ctx.category]
    nav = preview["nav"]
    route = ctx.route
    return (
        f'import {{ OverviewPage }} from "@/components/overview-page";\n'
        f'import {{ getSummary }} from "@/lib/{route}";\n'
        "\n"
        "export default async function Home() {\n"
        "  const summary = await getSummary();\n"
        f'  return <OverviewPage title="{nav}" summary={{summary}} />;\n'
        "}\n"
    )


def _build_overview_component(ctx: BundleContext) -> str:
    preview = _CATEGORY_PREVIEW[ctx.category]
    cols = '", "'.join(preview["table_columns"])
    cta = preview["primary_cta"]
    return (
        'import { StatCard } from "@/components/stat-card";\n'
        'import { DataTable } from "@/components/data-table";\n'
        f'import type {{ Summary }} from "@/lib/{ctx.route}";\n'
        "\n"
        "type OverviewPageProps = {\n"
        "  title: string;\n"
        "  summary: Summary;\n"
        "};\n"
        "\n"
        "export function OverviewPage({ title, summary }: OverviewPageProps) {\n"
        "  return (\n"
        '    <main className="mx-auto max-w-6xl px-4 py-6">\n'
        '      <header className="mb-6 flex items-center justify-between">\n'
        "        <div>\n"
        '          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>\n'
        '          <p className="text-sm text-muted-foreground">{summary.subtitle}</p>\n'
        "        </div>\n"
        '        <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">\n'
        f"          {cta}\n"
        "        </button>\n"
        "      </header>\n"
        "\n"
        '      <div className="mb-6 grid gap-3 sm:grid-cols-3">\n'
        "        {summary.stats.map((s) => (\n"
        '          <StatCard key={s.label} label={s.label} value={s.value} delta={s.delta} />\n'
        "        ))}\n"
        "      </div>\n"
        "\n"
        "      <DataTable\n"
        f'        columns={{["{cols}"]}}\n'
        "        rows={summary.rows}\n"
        "      />\n"
        "    </main>\n"
        "  );\n"
        "}\n"
    )


def _build_route_handler(ctx: BundleContext) -> str:
    route = ctx.route
    fields = _CREATE_SCHEMA_FIELDS[ctx.category]
    return (
        'import { NextResponse } from "next/server";\n'
        'import { z } from "zod";\n'
        'import { db } from "@/lib/db";\n'
        "\n"
        "const createSchema = z.object({\n"
        f"  {fields}\n"
        "});\n"
        "\n"
        "export async function GET() {\n"
        f"  const rows = await db.{route}.list({{ limit: 50 }});\n"
        "  return NextResponse.json({ rows });\n"
        "}\n"
        "\n"
        "export async function POST(request: Request) {\n"
        "  const body = createSchema.parse(await request.json());\n"
        f"  const created = await db.{route}.create(body);\n"
        "  return NextResponse.json(created, { status: 201 });\n"
        "}\n"
    )


def _build_lib(ctx: BundleContext) -> str:
    preview = _CATEGORY_PREVIEW[ctx.category]
    entity = _CATEGORY_ENTITY[ctx.category]
    stat = preview["stat"]
    stats = preview["stats"]
    rows = preview["table_rows"]
    nav = preview["nav"]
    subtitle = preview.get("page_subtitle", "")

    stat_lines = [
        f'      {{ label: "{stat["label"]}", value: "{stat["value"]}"'
        + (f', delta: "{stat["delta"]}"' if stat.get("delta") else "")
        + " },"
    ]
    for s in stats:
        stat_lines.append(
            f'      {{ label: "{s["label"]}", value: "{s["value"]}" }},'
        )

    row_lines = [
        "      { "
        + f'primary: {json.dumps(r["primary"])}, '
        + f'secondary: {json.dumps(r["secondary"])}, '
        + f'metric: {json.dumps(r["metric"])} '
        + "},"
        for r in rows
    ]

    return (
        f"{entity}\n"
        "\n"
        "export type Summary = {\n"
        "  subtitle: string;\n"
        "  stats: Array<{ label: string; value: string; delta?: string }>;\n"
        "  rows: Array<{ primary: string; secondary: string; metric: string }>;\n"
        "};\n"
        "\n"
        "/**\n"
        " * Load a dashboard summary for the current user.\n"
        " */\n"
        "export async function getSummary(): Promise<Summary> {\n"
        "  return {\n"
        f'    subtitle: "{subtitle}",\n'
        "    stats: [\n"
        + "\n".join(stat_lines)
        + "\n"
        "    ],\n"
        "    rows: [\n"
        + "\n".join(row_lines)
        + "\n"
        "    ],\n"
        "  };\n"
        "}\n"
    )


def _build_schema(ctx: BundleContext) -> str:
    return (
        f"-- {ctx.product_name} schema. Managed via migrations.\n"
        "-- Every table is scoped to a user_id so row-level security stays trivial.\n"
        "\n"
        'CREATE EXTENSION IF NOT EXISTS "pgcrypto";\n'
        "\n"
        "CREATE TABLE users (\n"
        "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n"
        "  email CITEXT UNIQUE NOT NULL,\n"
        "  display_name TEXT NOT NULL,\n"
        "  created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n"
        ");\n"
        "\n"
        f"{_CATEGORY_SCHEMA[ctx.category]}\n"
    )


def _build_readme(ctx: BundleContext) -> str:
    stack_lines = "\n".join(f"- {item}" for item in ctx.stack)
    return (
        f"# {ctx.product_name}\n"
        "\n"
        f"{ctx.tagline}\n"
        "\n"
        "## Stack\n"
        "\n"
        f"{stack_lines}\n"
        "\n"
        "## Local development\n"
        "\n"
        "```bash\n"
        "npm install\n"
        "cp .env.example .env\n"
        "npm run db:migrate\n"
        "npm run dev\n"
        "```\n"
        "\n"
        "Open http://localhost:3000.\n"
        "\n"
        "## Layout\n"
        "\n"
        "- `app/` — Next.js app router pages.\n"
        "- `components/` — Shared UI primitives.\n"
        "- `app/api/` — Route handlers.\n"
        "- `lib/` — Business logic, database access, schema types.\n"
        "- `database/` — SQL migrations.\n"
        "\n"
        "## Testing\n"
        "\n"
        "```bash\n"
        "npm run test\n"
        "npm run test:e2e\n"
        "```\n"
        "\n"
        "## Deploying\n"
        "\n"
        "Continuous deployment runs on push to `main`. Health checks live at\n"
        "`/api/health`; a green check gates promotion to production.\n"
    )


def build_deterministic_file(path: str, ctx: BundleContext) -> GeneratedCodeFile | None:
    """Return a single deterministic file for ``path``, or None if unknown."""
    builders: dict[str, tuple[str, Any]] = {
        "package.json": ("json", _build_package_json),
        "tsconfig.json": ("json", lambda c: _build_tsconfig()),
        "next.config.ts": ("ts", lambda c: _build_next_config()),
        "app/globals.css": ("css", lambda c: _build_globals_css()),
        "app/page.tsx": ("tsx", _build_page),
        "components/overview-page.tsx": ("tsx", _build_overview_component),
        f"app/api/{ctx.route}/route.ts": ("ts", _build_route_handler),
        f"lib/{ctx.route}.ts": ("ts", _build_lib),
        "database/schema.sql": ("sql", _build_schema),
        "README.md": ("markdown", _build_readme),
    }
    entry = builders.get(path)
    if entry is None:
        return None
    language, builder = entry
    content = builder(ctx)
    return GeneratedCodeFile(
        path=path,
        language=language,
        content=content,
        source="deterministic",
    )


def build_deterministic_bundle(
    project: str, plan: ProjectPlan | None
) -> CodeBundle:
    """Build a complete starter bundle from templates."""
    ctx = resolve_bundle_context(project, plan)
    files: list[GeneratedCodeFile] = []
    for spec in requested_file_specs(ctx):
        generated = build_deterministic_file(spec["path"], ctx)
        if generated is not None:
            files.append(generated)
    return CodeBundle(files=files, source="deterministic")
