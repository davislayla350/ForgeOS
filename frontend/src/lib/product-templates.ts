/**
 * lib/product-templates.ts
 *
 * Deterministic keyword classifier that maps a user prompt to a product
 * template. Each template describes what the "shipped product" would plausibly
 * look like: a name generator seed, tagline, tech leanings, and a preview
 * layout hint that the ProductShowcasePanel renders.
 *
 * Design notes
 * ------------
 * Not an LLM. Not fuzzy embeddings. Just a small, testable classifier. The
 * fallback ("Productivity dashboard") is deliberately generic and honest --
 * a judge who types "Zen meditation timer" gets a productivity template, not
 * a fitness dashboard pretending to know about meditation. The alternative
 * (guess wrong confidently) is worse for the demo than "generic dashboard".
 *
 * Every string in these templates should be usable verbatim in the UI. No
 * lorem ipsum, no placeholder anything. If a preview line would need to be
 * "TODO: fill in", it should not be in the template.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProductCategory =
  | "budgeting"
  | "fitness"
  | "reservation"
  | "cafe"
  | "flashcards"
  | "task_manager"
  | "chatbot"
  | "productivity";

/** A single row in the preview's primary data table / list. */
export type PreviewRow = {
  primary: string;
  secondary: string;
  metric: string;
  trend?: "up" | "down" | "flat";
};

/** A dashboard KPI ("stat card") in the preview header. */
export type PreviewStat = {
  label: string;
  value: string;
  delta?: string;
};

/** A named nav item on the preview's left sidebar. */
export type PreviewNavItem = { label: string; count?: number };

export type ProductTemplate = {
  category: ProductCategory;
  /** Short brandable seed appended to the AI-derived name. */
  nameSeed: string;
  /** One-sentence tagline the CEO would put on the launch tweet. */
  tagline: string;
  /** Preview layout description used by ProductShowcasePanel. */
  preview: {
    /** Text in the browser chrome / URL bar. */
    urlHost: string;
    /** Left sidebar items. */
    nav: PreviewNavItem[];
    /** Page title in the preview. */
    pageTitle: string;
    /** Optional subtitle. */
    pageSubtitle?: string;
    /** Three KPI cards at the top. */
    stats: [PreviewStat, PreviewStat, PreviewStat];
    /** Table header labels. */
    tableColumns: [string, string, string];
    /** Rows. Six is enough to fill the panel without scrolling. */
    tableRows: PreviewRow[];
    /** Optional call-to-action button text (right side of page header). */
    primaryCta?: string;
  };
  /** Tech stack shown on the showcase panel when the CEO plan is missing. */
  fallbackStack: string[];
  /** Words that trigger this template (all lowercase). */
  keywords: string[];
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const BUDGETING: ProductTemplate = {
  category: "budgeting",
  nameSeed: "Ledger",
  tagline: "Every dollar accounted for, without the spreadsheet drudgery.",
  preview: {
    urlHost: "app.ledgerly.io",
    nav: [
      { label: "Overview" },
      { label: "Transactions", count: 148 },
      { label: "Budgets", count: 6 },
      { label: "Goals", count: 3 },
      { label: "Reports" },
      { label: "Settings" },
    ],
    pageTitle: "Overview",
    pageSubtitle: "October 2026",
    stats: [
      { label: "Net cash flow", value: "$4,218.42", delta: "+12.4%" },
      { label: "Total spending", value: "$3,806.19", delta: "-3.2%" },
      { label: "Savings rate", value: "18.7%", delta: "+2.1pp" },
    ],
    tableColumns: ["Merchant", "Category", "Amount"],
    tableRows: [
      { primary: "Whole Foods", secondary: "Groceries", metric: "-$127.42", trend: "flat" },
      { primary: "Payroll deposit", secondary: "Income", metric: "+$3,120.00", trend: "up" },
      { primary: "Con Edison", secondary: "Utilities", metric: "-$88.15", trend: "flat" },
      { primary: "Netflix", secondary: "Subscriptions", metric: "-$15.49", trend: "flat" },
      { primary: "Uber", secondary: "Transit", metric: "-$22.30", trend: "up" },
      { primary: "Vanguard IRA", secondary: "Savings", metric: "+$500.00", trend: "up" },
    ],
    primaryCta: "New transaction",
  },
  fallbackStack: ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "Tailwind", "Plaid API"],
  keywords: [
    "budget", "budgeting", "finance", "expense", "expenses", "spending",
    "money", "wallet", "bookkeeping", "accounting", "ledger",
  ],
};

const FITNESS: ProductTemplate = {
  category: "fitness",
  nameSeed: "Peak",
  tagline: "The training log that adapts as you get stronger.",
  preview: {
    urlHost: "app.peakhq.co",
    nav: [
      { label: "Today" },
      { label: "Programs", count: 4 },
      { label: "Exercises", count: 82 },
      { label: "History" },
      { label: "Body metrics" },
      { label: "Settings" },
    ],
    pageTitle: "Today's session",
    pageSubtitle: "Upper body, Week 3 of 8",
    stats: [
      { label: "Sessions this week", value: "4 / 5", delta: "on track" },
      { label: "Volume this week", value: "18,420 lb", delta: "+8.1%" },
      { label: "Streak", value: "17 days", delta: "personal best" },
    ],
    tableColumns: ["Exercise", "Set × reps", "Load"],
    tableRows: [
      { primary: "Bench press", secondary: "4 × 6", metric: "185 lb", trend: "up" },
      { primary: "Barbell row", secondary: "4 × 8", metric: "165 lb", trend: "up" },
      { primary: "Overhead press", secondary: "3 × 8", metric: "115 lb", trend: "flat" },
      { primary: "Weighted pull-up", secondary: "3 × 6", metric: "+25 lb", trend: "up" },
      { primary: "Incline dumbbell", secondary: "3 × 10", metric: "55 lb", trend: "flat" },
      { primary: "Face pull", secondary: "3 × 15", metric: "40 lb", trend: "flat" },
    ],
    primaryCta: "Log a set",
  },
  fallbackStack: ["Next.js", "TypeScript", "Supabase", "PostgreSQL", "Tailwind", "Chart.js"],
  keywords: [
    "fitness", "workout", "workouts", "gym", "exercise", "exercises",
    "training", "strength", "cardio", "running", "run", "runner", "yoga",
    "athletic", "sport", "sports", "coaching",
  ],
};

const RESERVATION: ProductTemplate = {
  category: "reservation",
  nameSeed: "Table",
  tagline: "Reservations, floor plans, and covers in one calm surface.",
  preview: {
    urlHost: "host.tabler.app",
    nav: [
      { label: "Tonight" },
      { label: "Reservations", count: 24 },
      { label: "Floor plan" },
      { label: "Waitlist", count: 3 },
      { label: "Guests" },
      { label: "Settings" },
    ],
    pageTitle: "Tonight's service",
    pageSubtitle: "Friday, October 10 · 62 covers",
    stats: [
      { label: "Covers booked", value: "62 / 84", delta: "74% full" },
      { label: "Turn time avg", value: "1h 42m", delta: "-6m vs last week" },
      { label: "No-shows YTD", value: "2.1%", delta: "under target" },
    ],
    tableColumns: ["Guest", "Party · time", "Table"],
    tableRows: [
      { primary: "Rossi, 4-top", secondary: "6:30 PM · birthday", metric: "T-12" },
      { primary: "Chen party", secondary: "7:00 PM · 2 guests", metric: "T-04" },
      { primary: "Nguyen VIP", secondary: "7:15 PM · 6 guests", metric: "T-21" },
      { primary: "Patel + 1", secondary: "7:45 PM · window seat", metric: "T-08" },
      { primary: "Kim family", secondary: "8:00 PM · high chair", metric: "T-15" },
      { primary: "Walk-in queue", secondary: "3 waiting · 20m est.", metric: "—" },
    ],
    primaryCta: "New reservation",
  },
  fallbackStack: ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "Tailwind", "Twilio"],
  keywords: [
    "restaurant", "reservation", "reservations", "booking", "bookings",
    "table", "tables", "dining", "hospitality", "bar", "bistro",
  ],
};

const CAFE: ProductTemplate = {
  category: "cafe",
  nameSeed: "Brew",
  tagline: "Order ahead, skip the line, earn rewards on every cup.",
  preview: {
    urlHost: "order.brewly.coffee",
    nav: [
      { label: "Menu" },
      { label: "Rewards", count: 240 },
      { label: "Orders", count: 3 },
      { label: "Locations", count: 12 },
      { label: "Gift cards" },
      { label: "Account" },
    ],
    pageTitle: "Today's menu",
    pageSubtitle: "Roasted this morning · pickup in ~4 min",
    stats: [
      { label: "Rewards balance", value: "8 stamps", delta: "2 until free drink" },
      { label: "Avg pickup", value: "3m 42s", delta: "-28s vs last week" },
      { label: "Orders today", value: "1,204", delta: "+14%" },
    ],
    tableColumns: ["Drink", "Size · milk", "Price"],
    tableRows: [
      { primary: "Oat latte", secondary: "16oz · oat", metric: "$5.50", trend: "up" },
      { primary: "Cold brew", secondary: "12oz · black", metric: "$4.25", trend: "flat" },
      { primary: "Cortado", secondary: "8oz · whole", metric: "$4.75", trend: "flat" },
      { primary: "Matcha cloud", secondary: "16oz · oat", metric: "$6.00", trend: "up" },
      { primary: "Espresso tonic", secondary: "12oz · —", metric: "$5.25", trend: "flat" },
      { primary: "Seasonal mocha", secondary: "16oz · almond", metric: "$6.25", trend: "up" },
    ],
    primaryCta: "Add to order",
  },
  fallbackStack: ["Next.js", "TypeScript", "Supabase", "Stripe", "Tailwind", "Vercel"],
  keywords: [
    "coffee", "cafe", "café", "espresso", "latte", "brew", "brewly",
    "barista", "roastery", "cappuccino", "bakery", "pastry", "tea",
  ],
};

const FLASHCARDS: ProductTemplate = {
  category: "flashcards",
  nameSeed: "Recall",
  tagline: "Spaced-repetition that actually sticks, without the friction.",
  preview: {
    urlHost: "app.recall.study",
    nav: [
      { label: "Study today" },
      { label: "Decks", count: 12 },
      { label: "Statistics" },
      { label: "Cards", count: 384 },
      { label: "Import" },
      { label: "Settings" },
    ],
    pageTitle: "Study today",
    pageSubtitle: "38 cards due · Spanish B2, Neuroanatomy, Algorithms",
    stats: [
      { label: "Cards due today", value: "38", delta: "-4 vs yesterday" },
      { label: "Retention (30d)", value: "91.4%", delta: "+0.8pp" },
      { label: "Streak", value: "23 days" },
    ],
    tableColumns: ["Deck", "Due · new", "Retention"],
    tableRows: [
      { primary: "Spanish B2 vocabulary", secondary: "18 due · 4 new", metric: "89%", trend: "up" },
      { primary: "Neuroanatomy", secondary: "12 due · 2 new", metric: "93%", trend: "flat" },
      { primary: "Algorithms & data structures", secondary: "6 due", metric: "88%", trend: "flat" },
      { primary: "Kanji: JLPT N3", secondary: "2 due · 12 new", metric: "76%", trend: "up" },
      { primary: "Music theory intervals", secondary: "on break", metric: "95%", trend: "flat" },
      { primary: "Chemistry mnemonics", secondary: "0 due", metric: "97%", trend: "flat" },
    ],
    primaryCta: "Start reviewing",
  },
  fallbackStack: ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "Tailwind", "Redis"],
  keywords: [
    "flashcard", "flashcards", "study", "studying", "learn", "learning",
    "memorize", "memorization", "spaced", "repetition", "vocab", "vocabulary",
    "quiz", "quizzes", "tutor", "language",
  ],
};

/** Fallback: still believable, doesn't fake domain expertise. */
const TASK_MANAGER: ProductTemplate = {
  category: "task_manager",
  nameSeed: "Board",
  tagline: "Kanban that stays out of the way when the team's shipping.",
  preview: {
    urlHost: "app.boardstack.io",
    nav: [
      { label: "My board" },
      { label: "All boards", count: 8 },
      { label: "Inbox", count: 5 },
      { label: "People" },
      { label: "Archive" },
      { label: "Settings" },
    ],
    pageTitle: "Sprint 14",
    pageSubtitle: "3 columns · 12 cards in flight",
    stats: [
      { label: "In progress", value: "5", delta: "+1 today" },
      { label: "Completed this week", value: "17", delta: "+4 vs last" },
      { label: "Blocked", value: "2", delta: "unchanged" },
    ],
    tableColumns: ["Card", "Assignee", "Column"],
    tableRows: [
      { primary: "Migrate billing to Stripe", secondary: "Marcus Webb", metric: "In progress" },
      { primary: "Fix login redirect loop", secondary: "Elena Voss", metric: "In review" },
      { primary: "Draft security incident runbook", secondary: "Iris Nolan", metric: "To do" },
      { primary: "Q4 metrics dashboard", secondary: "Theo Park", metric: "Blocked" },
      { primary: "Add SSO to admin panel", secondary: "Dex Rivera", metric: "Done" },
      { primary: "Kill deprecated feature flag", secondary: "Aria Chen", metric: "Done" },
    ],
    primaryCta: "New card",
  },
  fallbackStack: ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "Tailwind", "dnd-kit"],
  keywords: [
    "kanban", "task", "tasks", "todo", "todos", "board", "boards",
    "sprint", "backlog", "ticket", "tickets", "jira", "trello",
    "project", "issue", "issues",
  ],
};

const CHATBOT: ProductTemplate = {
  category: "chatbot",
  nameSeed: "Chat",
  tagline: "A conversational interface your users won't want to leave.",
  preview: {
    urlHost: "app.replyloop.ai",
    nav: [
      { label: "Threads" },
      { label: "Personas", count: 4 },
      { label: "Playground" },
      { label: "Analytics" },
      { label: "API keys" },
      { label: "Settings" },
    ],
    pageTitle: "Today's threads",
    pageSubtitle: "204 messages · 32 users · avg reply 380 ms",
    stats: [
      { label: "Messages today", value: "204", delta: "+18%" },
      { label: "Avg reply latency", value: "380 ms", delta: "-40 ms" },
      { label: "Resolved without human", value: "84%", delta: "+3 pp" },
    ],
    tableColumns: ["Thread", "User", "Status"],
    tableRows: [
      { primary: "Help with refund policy", secondary: "user_2831", metric: "Resolved" },
      { primary: "How do I export data?", secondary: "user_9104", metric: "Resolved" },
      { primary: "Billing charge unclear", secondary: "user_7562", metric: "Handoff" },
      { primary: "Feature request: dark mode", secondary: "user_3011", metric: "Open" },
      { primary: "Integration with Slack", secondary: "user_5527", metric: "Resolved" },
      { primary: "Password reset failing", secondary: "user_8844", metric: "Open" },
    ],
    primaryCta: "New thread",
  },
  fallbackStack: ["Next.js", "TypeScript", "PostgreSQL", "pgvector", "Tailwind", "OpenAI SDK"],
  keywords: [
    "chatbot", "chat", "conversation", "conversational", "assistant",
    "bot", "messaging", "message", "support", "helpdesk", "ai",
    "gpt", "llm",
  ],
};

const PRODUCTIVITY: ProductTemplate = {
  category: "productivity",
  nameSeed: "Stack",
  tagline: "The lightweight tool your team will actually keep open.",
  preview: {
    urlHost: "app.stackhq.io",
    nav: [
      { label: "My work" },
      { label: "Inbox", count: 7 },
      { label: "Projects", count: 4 },
      { label: "Team" },
      { label: "Archive" },
      { label: "Settings" },
    ],
    pageTitle: "My work",
    pageSubtitle: "3 in progress · 2 blocked",
    stats: [
      { label: "Open items", value: "12", delta: "-3 this week" },
      { label: "Completed this week", value: "17", delta: "+4 vs last" },
      { label: "Cycle time avg", value: "2.4 days", delta: "-0.3 days" },
    ],
    tableColumns: ["Item", "Owner", "Status"],
    tableRows: [
      { primary: "Draft roadmap review", secondary: "Elena Voss", metric: "In progress" },
      { primary: "Auth flow rewrite", secondary: "Marcus Webb", metric: "In review" },
      { primary: "Vendor security questionnaire", secondary: "Iris Nolan", metric: "Blocked" },
      { primary: "Test plan for Q4", secondary: "Theo Park", metric: "Done" },
      { primary: "Deployment runbook", secondary: "Dex Rivera", metric: "Draft" },
      { primary: "Weekly all-hands notes", secondary: "Aria Chen", metric: "Ready" },
    ],
    primaryCta: "New item",
  },
  fallbackStack: ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "Tailwind", "tRPC"],
  keywords: [], // fallback -- nothing triggers it directly
};

const ALL_TEMPLATES: ProductTemplate[] = [
  BUDGETING,
  FITNESS,
  RESERVATION,
  CAFE,
  FLASHCARDS,
  TASK_MANAGER,
  CHATBOT,
  PRODUCTIVITY,
];

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

const TOKEN_RE = /[a-z0-9]+/g;

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RE) ?? []) as string[];
}

/**
 * Pick the template whose keyword set most overlaps with the prompt. Ties
 * resolve to the earliest-defined template, which puts more specific
 * categories ahead of the generic fallback. Prompts with zero matches get
 * the productivity fallback.
 */
export function classifyProject(prompt: string): ProductTemplate {
  const tokens = new Set(tokenize(prompt));
  let best: ProductTemplate = PRODUCTIVITY;
  let bestScore = 0;
  for (const template of ALL_TEMPLATES) {
    if (template.keywords.length === 0) continue; // skip fallback in scoring
    let score = 0;
    for (const kw of template.keywords) {
      if (tokens.has(kw)) score += 1;
    }
    if (score > bestScore) {
      best = template;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Name derivation
// ---------------------------------------------------------------------------

/**
 * Derive a product name from the CEO's company_name if available, otherwise
 * synthesize one from the prompt's first significant noun + the template
 * seed. Deterministic, so the same input always yields the same output.
 */
export function deriveProductName(
  prompt: string,
  template: ProductTemplate,
  companyName?: string
): string {
  if (companyName && companyName.trim()) return companyName.trim();

  const tokens = tokenize(prompt);
  const stop = new Set([
    "a", "an", "the", "for", "of", "to", "in", "on", "at", "with", "and",
    "or", "build", "make", "create", "app", "application", "platform",
    "system", "tool", "service", "website", "site",
  ]);
  const kept = tokens.filter((t) => !stop.has(t) && t.length > 2);
  const anchor = kept[0];
  if (!anchor) return template.nameSeed;
  const cap = anchor[0].toUpperCase() + anchor.slice(1);
  return `${cap} ${template.nameSeed}`;
}
