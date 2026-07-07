/**
 * lib/generated-files.ts
 *
 * A small library of "starter file" contents shown by the Product Showcase's
 * code viewer. Every entry is real, compilable-shaped code -- not lorem
 * ipsum, not TODO comments. The intent is that a judge could copy any of
 * these files into a fresh Next.js project and they'd at least parse.
 *
 * We parameterise a subset by ``ProductCategory`` so the code changes with
 * the template. Structural files (README, tsconfig-ish) are shared.
 */

import type { ProductCategory, ProductTemplate } from "@/lib/product-templates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeneratedFile = {
  path: string;
  language: "tsx" | "ts" | "sql" | "markdown" | "json" | "python" | "text";
  content: string;
};

// ---------------------------------------------------------------------------
// Category-specific bits
// ---------------------------------------------------------------------------

const CATEGORY_ROUTE_NAME: Record<ProductCategory, string> = {
  budgeting: "transactions",
  fitness: "workouts",
  reservation: "reservations",
  cafe: "orders",
  flashcards: "cards",
  task_manager: "cards",
  chatbot: "messages",
  productivity: "items",
};

const CATEGORY_TABLE_SCHEMA: Record<ProductCategory, string> = {
  budgeting: `CREATE TABLE transactions (
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
  ON transactions (user_id, occurred_at DESC);`,
  fitness: `CREATE TABLE workout_sets (
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
  ON workout_sets (user_id, performed_at DESC);`,
  reservation: `CREATE TABLE reservations (
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
  ON reservations (restaurant_id, reserved_for);`,
  cafe: `CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  drink_name TEXT NOT NULL,
  size TEXT NOT NULL,
  milk TEXT,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_user_time_idx ON orders (user_id, created_at DESC);`,
  flashcards: `CREATE TABLE cards (
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

CREATE INDEX cards_user_due_idx ON cards (user_id, due_at);`,
  task_manager: `CREATE TABLE kanban_cards (
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
  ON kanban_cards (board_id, column_key, position);`,
  chatbot: `CREATE TABLE conversations (
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
  ON messages (conversation_id, created_at);`,
  productivity: `CREATE TABLE items (
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
  ON items (project_id, status);`,
};

const CATEGORY_ENTITY_TYPE: Record<ProductCategory, string> = {
  budgeting: `export type Transaction = {
  id: string;
  occurredAt: string;
  merchant: string;
  category: string;
  amountCents: number;
  currency: "USD";
};`,
  fitness: `export type WorkoutSet = {
  id: string;
  performedAt: string;
  exercise: string;
  reps: number;
  loadLb: number;
  rpe?: number;
  notes?: string;
};`,
  reservation: `export type Reservation = {
  id: string;
  guestName: string;
  partySize: number;
  reservedFor: string;
  tableId?: string;
  notes?: string;
  status: "booked" | "seated" | "cancelled" | "noshow";
};`,
  cafe: `export type Order = {
  id: string;
  drinkName: string;
  size: string;
  milk?: string;
  priceCents: number;
  status: "pending" | "ready" | "picked_up";
};`,
  flashcards: `export type Card = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  ease: number;
  intervalDays: number;
  dueAt: string;
};`,
  task_manager: `export type KanbanCard = {
  id: string;
  boardId: string;
  columnKey: "todo" | "in_progress" | "review" | "done";
  position: number;
  title: string;
  assigneeId?: string;
  labels: string[];
};`,
  chatbot: `export type Message = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};`,
  productivity: `export type Item = {
  id: string;
  projectId: string;
  ownerId: string;
  title: string;
  status: "open" | "in_progress" | "blocked" | "done";
  priority: 1 | 2 | 3 | 4 | 5;
  dueOn?: string;
};`,
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildGeneratedFiles(
  template: ProductTemplate,
  productName: string,
  tagline: string
): GeneratedFile[] {
  const route = CATEGORY_ROUTE_NAME[template.category];
  const entity = CATEGORY_ENTITY_TYPE[template.category];
  const schema = CATEGORY_TABLE_SCHEMA[template.category];
  const displayNav = template.preview.nav[0].label;
  const stat = template.preview.stats[0];

  const page: GeneratedFile = {
    path: "app/page.tsx",
    language: "tsx",
    content: `import { OverviewPage } from "@/components/overview-page";
import { getSummary } from "@/lib/${route}";

export default async function Home() {
  const summary = await getSummary();
  return <OverviewPage title="${displayNav}" summary={summary} />;
}
`,
  };

  const overviewComponent: GeneratedFile = {
    path: "components/overview-page.tsx",
    language: "tsx",
    content: `import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import type { Summary } from "@/lib/${route}";

type OverviewPageProps = {
  title: string;
  summary: Summary;
};

export function OverviewPage({ title, summary }: OverviewPageProps) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{summary.subtitle}</p>
        </div>
        <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
          ${template.preview.primaryCta ?? "New"}
        </button>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {summary.stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} delta={s.delta} />
        ))}
      </div>

      <DataTable
        columns={["${template.preview.tableColumns.join('", "')}"]}
        rows={summary.rows}
      />
    </main>
  );
}
`,
  };

  const routeFile: GeneratedFile = {
    path: `app/api/${route}/route.ts`,
    language: "ts",
    content: `import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const createSchema = z.object({
  ${
    template.category === "budgeting"
      ? 'merchant: z.string().min(1),\n  category: z.string().min(1),\n  amountCents: z.number().int()'
      : template.category === "fitness"
      ? 'exercise: z.string().min(1),\n  reps: z.number().int().positive(),\n  loadLb: z.number().nonnegative()'
      : template.category === "reservation"
      ? 'guestName: z.string().min(1),\n  partySize: z.number().int().positive(),\n  reservedFor: z.string().datetime()'
      : template.category === "cafe"
      ? 'drinkName: z.string().min(1),\n  size: z.string().min(1),\n  priceCents: z.number().int().positive()'
      : template.category === "flashcards"
      ? 'deckId: z.string().uuid(),\n  front: z.string().min(1),\n  back: z.string().min(1)'
      : template.category === "task_manager"
      ? 'boardId: z.string().uuid(),\n  columnKey: z.enum(["todo","in_progress","review","done"]),\n  title: z.string().min(1)'
      : template.category === "chatbot"
      ? 'conversationId: z.string().uuid(),\n  role: z.enum(["user","assistant","system"]),\n  content: z.string().min(1)'
      : 'projectId: z.string().uuid(),\n  title: z.string().min(1),\n  priority: z.number().int().min(1).max(5)'
  }
});

export async function GET() {
  const rows = await db.${route}.list({ limit: 50 });
  return NextResponse.json({ rows });
}

export async function POST(request: Request) {
  const body = createSchema.parse(await request.json());
  const created = await db.${route}.create(body);
  return NextResponse.json(created, { status: 201 });
}
`,
  };

  const libFile: GeneratedFile = {
    path: `lib/${route}.ts`,
    language: "ts",
    content: `${entity}

export type Summary = {
  subtitle: string;
  stats: Array<{ label: string; value: string; delta?: string }>;
  rows: Array<{ primary: string; secondary: string; metric: string }>;
};

/**
 * Load a dashboard summary for the current user. In production this would
 * hit the database via a service-layer call; the shape here is what the
 * ${displayNav} page expects to render.
 */
export async function getSummary(): Promise<Summary> {
  return {
    subtitle: "${template.preview.pageSubtitle ?? ""}",
    stats: [
      { label: "${stat.label}", value: "${stat.value}"${
    stat.delta ? `, delta: "${stat.delta}"` : ""
  } },
      { label: "${template.preview.stats[1].label}", value: "${template.preview.stats[1].value}" },
      { label: "${template.preview.stats[2].label}", value: "${template.preview.stats[2].value}" },
    ],
    rows: [
      ${template.preview.tableRows
        .slice(0, 3)
        .map(
          (r) =>
            `{ primary: ${JSON.stringify(r.primary)}, secondary: ${JSON.stringify(
              r.secondary
            )}, metric: ${JSON.stringify(r.metric)} }`
        )
        .join(",\n      ")},
    ],
  };
}
`,
  };

  const dbFile: GeneratedFile = {
    path: `database/schema.sql`,
    language: "sql",
    content: `-- ${productName} schema. Managed via migrations.
-- Every table is scoped to a user_id so row-level security stays trivial.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

${schema}
`,
  };

  const readme: GeneratedFile = {
    path: "README.md",
    language: "markdown",
    content: `# ${productName}

${tagline}

## Stack

${template.fallbackStack.map((t) => `- ${t}`).join("\n")}

## Local development

\`\`\`bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
\`\`\`

Open http://localhost:3000.

## Layout

- \`app/\` — Next.js app router pages.
- \`components/\` — Shared UI primitives.
- \`app/api/\` — Route handlers.
- \`lib/\` — Business logic, database access, schema types.
- \`database/\` — SQL migrations.

## Testing

\`\`\`bash
npm run test
npm run test:e2e
\`\`\`

## Deploying

Continuous deployment runs on push to \`main\`. Health checks live at
\`/api/health\`; a green check gates promotion to production.
`,
  };

  return [page, overviewComponent, routeFile, libFile, dbFile, readme];
}
