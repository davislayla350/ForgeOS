/**
 * Deterministic startup pitch data for the Product Ready reveal.
 * Reads like a credible investor one-pager — not LLM fluff.
 */

import type { OrchestrationState } from "@/lib/orchestration-types";
import type { ProductCategory } from "@/lib/product-templates";
import type { ShowcaseData } from "@/lib/showcase-data";

export type PitchFeature = {
  title: string;
  description: string;
};

export type RoadmapItem = {
  quarter: string;
  milestone: string;
  status: "shipped" | "in_progress" | "planned";
};

export type StartupPitch = {
  marketSize: string;
  targetCustomer: string;
  revenueModel: string;
  projectedArrYearOne: string;
  projectedArrYearThree: string;
  features: PitchFeature[];
  roadmap: RoadmapItem[];
};

const CATEGORY_PITCH: Record<ProductCategory, Omit<StartupPitch, "projectedArrYearOne" | "projectedArrYearThree">> = {
  budgeting: {
    marketSize: "$4.2B personal finance apps (US)",
    targetCustomer: "Households tracking spending without spreadsheets",
    revenueModel: "Freemium · $9/mo Pro · Plaid sync upsell",
    features: [
      { title: "Auto-categorization", description: "Merchant rules learn from every edit." },
      { title: "Cash-flow dashboard", description: "Net position updated in real time." },
      { title: "Budget envelopes", description: "Rollover unused amounts month to month." },
      { title: "Export for taxes", description: "CSV and accountant-ready summaries." },
    ],
    roadmap: [
      { quarter: "Q1", milestone: "Core ledger + bank import", status: "shipped" },
      { quarter: "Q2", milestone: "Shared household accounts", status: "in_progress" },
      { quarter: "Q3", milestone: "Bill negotiation concierge", status: "planned" },
      { quarter: "Q4", milestone: "Tax-loss harvesting hints", status: "planned" },
    ],
  },
  fitness: {
    marketSize: "$96B digital fitness & wellness",
    targetCustomer: "Intermediate lifters who outgrew Notes apps",
    revenueModel: "Subscription · $12/mo · coach marketplace take-rate",
    features: [
      { title: "Session logging", description: "Sets, reps, and RPE in under 10 seconds." },
      { title: "Volume analytics", description: "Weekly tonnage and muscle-group balance." },
      { title: "Program templates", description: "8-week blocks with auto-progression." },
      { title: "Wearable sync", description: "Heart rate and recovery overlays." },
    ],
    roadmap: [
      { quarter: "Q1", milestone: "Workout log + PR tracking", status: "shipped" },
      { quarter: "Q2", milestone: "Coach-shared programs", status: "in_progress" },
      { quarter: "Q3", milestone: "Video form checks", status: "planned" },
      { quarter: "Q4", milestone: "Gym floor heatmaps", status: "planned" },
    ],
  },
  reservation: {
    marketSize: "$12B restaurant ops software",
    targetCustomer: "Independent restaurants doing 40–120 covers/night",
    revenueModel: "SaaS · $149/mo per location · SMS add-on",
    features: [
      { title: "Live floor plan", description: "Drag tables, see turn times at a glance." },
      { title: "Waitlist + SMS", description: "Guests get a text when their table is ready." },
      { title: "VIP tags", description: "Allergies and preferences surface on seat." },
      { title: "Tonight's pacing", description: "Cover curve vs historical Friday baseline." },
    ],
    roadmap: [
      { quarter: "Q1", milestone: "Reservations + floor map", status: "shipped" },
      { quarter: "Q2", milestone: "POS check sync", status: "in_progress" },
      { quarter: "Q3", milestone: "Deposit holds for large parties", status: "planned" },
      { quarter: "Q4", milestone: "Multi-location roll-up", status: "planned" },
    ],
  },
  cafe: {
    marketSize: "$580B global coffee retail",
    targetCustomer: "Urban professionals ordering ahead, skipping the line",
    revenueModel: "Transaction fee · 2.9% + $0.30 · loyalty subscriptions",
    features: [
      { title: "Order ahead", description: "Pick up in-store or curbside in minutes." },
      { title: "Rewards wallet", description: "Every 10th drink free, auto-applied at checkout." },
      { title: "Seasonal menu", description: "Barista picks rotate weekly with photos." },
      { title: "Saved favorites", description: "One-tap reorder your usual oat latte." },
    ],
    roadmap: [
      { quarter: "Q1", milestone: "Mobile order + pickup", status: "shipped" },
      { quarter: "Q2", milestone: "Subscription coffee pass", status: "in_progress" },
      { quarter: "Q3", milestone: "Corporate catering portal", status: "planned" },
      { quarter: "Q4", milestone: "Drive-thru lane integration", status: "planned" },
    ],
  },
  flashcards: {
    marketSize: "$1.8B ed-tech study tools",
    targetCustomer: "Self-directed learners prepping for exams",
    revenueModel: "Freemium · $7/mo unlimited decks · institutional licenses",
    features: [
      { title: "Spaced repetition", description: "SM-2 scheduling tuned per card difficulty." },
      { title: "Rich cards", description: "Images, audio clips, and cloze deletions." },
      { title: "Deck sharing", description: "Import community sets in one click." },
      { title: "Streak insights", description: "Retention curves and weak-topic flags." },
    ],
    roadmap: [
      { quarter: "Q1", milestone: "Core review loop", status: "shipped" },
      { quarter: "Q2", milestone: "Collaborative class decks", status: "in_progress" },
      { quarter: "Q3", milestone: "AI-generated cards from PDFs", status: "planned" },
      { quarter: "Q4", milestone: "Offline mobile sync", status: "planned" },
    ],
  },
  task_manager: {
    marketSize: "$6.1B work management software",
    targetCustomer: "Small product teams (5–25 people) shipping weekly",
    revenueModel: "Per-seat · $8/user/mo · automation pack upsell",
    features: [
      { title: "Kanban boards", description: "WIP limits and swimlanes out of the box." },
      { title: "Cycle analytics", description: "Lead time and throughput without setup." },
      { title: "Slack handoffs", description: "Cards created from threads in one click." },
      { title: "Sprint goals", description: "Tie every card to an OKR for the quarter." },
    ],
    roadmap: [
      { quarter: "Q1", milestone: "Boards + basic automations", status: "shipped" },
      { quarter: "Q2", milestone: "Timeline / Gantt view", status: "in_progress" },
      { quarter: "Q3", milestone: "Portfolio dashboards", status: "planned" },
      { quarter: "Q4", milestone: "Enterprise SSO", status: "planned" },
    ],
  },
  chatbot: {
    marketSize: "$15B conversational AI support",
    targetCustomer: "SaaS teams deflecting tier-1 support tickets",
    revenueModel: "Usage-based · $0.02/message · human handoff fee",
    features: [
      { title: "Grounded answers", description: "Retrieval over your docs, not hallucinations." },
      { title: "Handoff queue", description: "Agents pick up with full thread context." },
      { title: "Persona tuning", description: "Tone and escalation rules per product line." },
      { title: "Analytics", description: "Resolution rate and deflection by topic." },
    ],
    roadmap: [
      { quarter: "Q1", milestone: "Widget + knowledge base", status: "shipped" },
      { quarter: "Q2", milestone: "Zendesk / Intercom bridge", status: "in_progress" },
      { quarter: "Q3", milestone: "Voice channel beta", status: "planned" },
      { quarter: "Q4", milestone: "Multi-language packs", status: "planned" },
    ],
  },
  productivity: {
    marketSize: "$50B team productivity software",
    targetCustomer: "Operators who need one calm surface for daily work",
    revenueModel: "Freemium · $10/user/mo Pro · enterprise SSO",
    features: [
      { title: "Unified inbox", description: "Tasks, messages, and docs in one queue." },
      { title: "Focus blocks", description: "Calendar holds that actually stick." },
      { title: "Lightweight projects", description: "Enough structure without Jira weight." },
      { title: "Weekly review", description: "Auto-generated digest every Friday." },
    ],
    roadmap: [
      { quarter: "Q1", milestone: "Inbox + task list", status: "shipped" },
      { quarter: "Q2", milestone: "Calendar integration", status: "in_progress" },
      { quarter: "Q3", milestone: "Team dashboards", status: "planned" },
      { quarter: "Q4", milestone: "API + webhooks", status: "planned" },
    ],
  },
};

function arrMultiplier(category: ProductCategory, ideaLength: number): { y1: number; y3: number } {
  const base: Record<ProductCategory, number> = {
    budgeting: 420_000,
    fitness: 380_000,
    reservation: 890_000,
    cafe: 1_200_000,
    flashcards: 310_000,
    task_manager: 760_000,
    chatbot: 1_050_000,
    productivity: 540_000,
  };
  const bump = (ideaLength % 5) * 45_000;
  return { y1: base[category] + bump, y3: (base[category] + bump) * 4.2 };
}

function formatArr(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M ARR`;
  return `$${Math.round(n / 1000)}K ARR`;
}

export function buildStartupPitch(
  state: Pick<OrchestrationState, "projectIdea" | "projectPlan">,
  showcase: Pick<ShowcaseData, "template" | "productName">
): StartupPitch {
  const base = CATEGORY_PITCH[showcase.template.category];
  const mult = arrMultiplier(showcase.template.category, state.projectIdea.length);
  return {
    ...base,
    projectedArrYearOne: formatArr(mult.y1),
    projectedArrYearThree: formatArr(mult.y3),
  };
}
