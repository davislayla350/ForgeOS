"use client";

/**
 * live-preview-templates.tsx
 * =========================
 *
 * A gallery of interactive React "products" that the LivePreviewPanel picks
 * from based on the product category. Each template is a self-contained
 * component: real ``useState``, real handlers, real feedback. The judge can
 * poke at it and see it react.
 *
 * Design rules
 * ------------
 *   * No external deps beyond what's already installed. No drag-and-drop
 *     libraries, no charting libs, no animation timelines beyond Framer
 *     Motion which is already in.
 *   * Local state only. Data is seeded once on mount from the template's
 *     domain fixtures. Nothing persists; that's fine, this is a preview.
 *   * Realistic but tiny. 5 to 10 rows, 3 to 4 states, one or two
 *     write actions. Enough to feel real; small enough to read at a glance.
 *   * Blueprint aesthetic. Existing token palette (blueprint, muted, card).
 *     No colour outside the theme.
 */

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Coffee,
  Dumbbell,
  Filter,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Send,
  UserRound,
  Utensils,
  Wallet,
} from "lucide-react";
import type { ProductCategory } from "@/lib/product-templates";
import { cn } from "@/lib/utils";
import { usePreviewShell } from "@/components/forgeos/interactive-preview-shell";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const cardCls =
  "rounded-md border border-border/50 bg-background/60 p-3 backdrop-blur-sm";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-md border border-border/40 bg-card/40 px-3 py-2">
      <p className="font-mono text-[8px] tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

// ===========================================================================
// 1. BUDGETING - Expense dashboard with category filter + live totals
// ===========================================================================

type Txn = {
  id: string;
  merchant: string;
  category: "Groceries" | "Income" | "Utilities" | "Subscriptions" | "Transit";
  amountCents: number;
};

const INITIAL_TXNS: Txn[] = [
  { id: "t1", merchant: "Whole Foods", category: "Groceries", amountCents: -12742 },
  { id: "t2", merchant: "Payroll deposit", category: "Income", amountCents: 312000 },
  { id: "t3", merchant: "Con Edison", category: "Utilities", amountCents: -8815 },
  { id: "t4", merchant: "Netflix", category: "Subscriptions", amountCents: -1549 },
  { id: "t5", merchant: "Uber", category: "Transit", amountCents: -2230 },
  { id: "t6", merchant: "Trader Joe's", category: "Groceries", amountCents: -6412 },
  { id: "t7", merchant: "Spotify", category: "Subscriptions", amountCents: -1099 },
  { id: "t8", merchant: "MTA subway", category: "Transit", amountCents: -3300 },
];

const CATEGORIES: Array<Txn["category"] | "All"> = [
  "All",
  "Groceries",
  "Income",
  "Utilities",
  "Subscriptions",
  "Transit",
];

function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : cents > 0 ? "+" : "";
  const abs = Math.abs(cents) / 100;
  return `${sign}$${abs.toFixed(2)}`;
}

export function BudgetingPreview() {
  const shell = usePreviewShell();
  const [txns] = useState<Txn[]>(INITIAL_TXNS);
  const [filter, setFilter] = useState<Txn["category"] | "All">("All");

  const filtered = useMemo(
    () => (filter === "All" ? txns : txns.filter((t) => t.category === filter)),
    [txns, filter]
  );
  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const t of filtered) {
      if (t.amountCents > 0) inflow += t.amountCents;
      else outflow += t.amountCents;
    }
    return { inflow, outflow, net: inflow + outflow };
  }, [filtered]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Wallet className="size-4 text-blueprint" strokeWidth={1.75} />
        <h3 className="font-mono text-sm tracking-tight text-foreground">
          October transactions
        </h3>
        {shell && (
          <button
            type="button"
            onClick={() =>
              shell.addToCart({
                name: "Pro subscription",
                detail: "Annual billing",
                priceCents: 9900,
              })
            }
            className="ml-auto rounded-md border border-blueprint/30 bg-blueprint/10 px-2 py-0.5 font-mono text-[9px] tracking-widest text-blueprint uppercase hover:bg-blueprint/20"
          >
            Upgrade Pro
          </button>
        )}
        {!shell && (
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {filtered.length} of {txns.length} shown
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <StatChip label="Net" value={formatUsd(totals.net)} />
        <StatChip label="Inflow" value={formatUsd(totals.inflow)} />
        <StatChip label="Outflow" value={formatUsd(totals.outflow)} />
      </div>

      <div className="flex flex-wrap gap-1">
        <Filter className="mr-1 size-3 self-center text-muted-foreground" strokeWidth={1.75} />
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={cn(
              "rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase transition-colors",
              filter === c
                ? "border-blueprint bg-blueprint/20 text-blueprint"
                : "border-border/40 bg-background/40 text-muted-foreground hover:bg-muted/30"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <ul className={cn(cardCls, "flex-1 space-y-1 overflow-y-auto")}>
        <AnimatePresence initial={false}>
          {filtered.map((t) => (
            <motion.li
              key={t.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2 rounded px-2 py-1.5"
            >
              <span className="flex size-6 items-center justify-center rounded border border-border/40 bg-card/40 font-mono text-[9px] text-muted-foreground">
                {t.category.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground">{t.merchant}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {t.category}
                </p>
              </div>
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  t.amountCents >= 0 ? "text-emerald-400" : "text-foreground"
                )}
              >
                {formatUsd(t.amountCents)}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
        {filtered.length === 0 && (
          <li className="px-2 py-3 text-center font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            No transactions in this category
          </li>
        )}
      </ul>
    </div>
  );
}

// ===========================================================================
// 2. FITNESS - Workout tracker: log a set, see it appear
// ===========================================================================

type WorkoutSet = {
  id: string;
  exercise: string;
  reps: number;
  loadLb: number;
};

const INITIAL_SETS: WorkoutSet[] = [
  { id: "s1", exercise: "Bench press", reps: 6, loadLb: 185 },
  { id: "s2", exercise: "Bench press", reps: 6, loadLb: 185 },
  { id: "s3", exercise: "Barbell row", reps: 8, loadLb: 165 },
  { id: "s4", exercise: "Overhead press", reps: 8, loadLb: 115 },
];
const EXERCISES = ["Bench press", "Barbell row", "Overhead press", "Squat", "Deadlift"];

export function FitnessPreview() {
  const [sets, setSets] = useState<WorkoutSet[]>(INITIAL_SETS);
  const [draft, setDraft] = useState<{ exercise: string; reps: number; loadLb: number }>({
    exercise: EXERCISES[0],
    reps: 6,
    loadLb: 135,
  });

  const totalVolume = useMemo(
    () => sets.reduce((v, s) => v + s.reps * s.loadLb, 0),
    [sets]
  );

  const addSet = useCallback(() => {
    setSets((prev) => [
      ...prev,
      { id: `s${Date.now()}`, ...draft },
    ]);
  }, [draft]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Dumbbell className="size-4 text-blueprint" strokeWidth={1.75} />
        <h3 className="font-mono text-sm tracking-tight text-foreground">
          Today&apos;s session
        </h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          Upper body, Week 3
        </span>
      </div>

      <div className="flex gap-2">
        <StatChip label="Sets" value={String(sets.length)} />
        <StatChip label="Volume" value={`${totalVolume.toLocaleString()} lb`} />
        <StatChip label="Exercises" value={String(new Set(sets.map((s) => s.exercise)).size)} />
      </div>

      <div className={cn(cardCls, "flex flex-col gap-2")}>
        <p className="font-mono text-[9px] tracking-widest text-blueprint/70 uppercase">
          Log a set
        </p>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
          <select
            value={draft.exercise}
            onChange={(e) => setDraft((d) => ({ ...d, exercise: e.target.value }))}
            className="rounded border border-border/40 bg-card/40 px-2 py-1 text-xs text-foreground focus:border-blueprint focus:outline-none"
          >
            {EXERCISES.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
          <NumberInput
            label="reps"
            value={draft.reps}
            onChange={(v) => setDraft((d) => ({ ...d, reps: v }))}
            step={1}
            min={1}
          />
          <NumberInput
            label="lb"
            value={draft.loadLb}
            onChange={(v) => setDraft((d) => ({ ...d, loadLb: v }))}
            step={5}
            min={0}
          />
          <button
            type="button"
            onClick={addSet}
            className="inline-flex items-center gap-1 rounded-md border border-blueprint/40 bg-blueprint/10 px-2 py-1 font-mono text-[10px] tracking-widest text-blueprint uppercase transition-colors hover:bg-blueprint/20"
          >
            <Plus className="size-3" strokeWidth={2} />
            Log
          </button>
        </div>
      </div>

      <ul className={cn(cardCls, "flex-1 space-y-1 overflow-y-auto")}>
        <AnimatePresence initial={false}>
          {sets.map((s, i) => (
            <motion.li
              key={s.id}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded px-2 py-1 text-xs"
            >
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                #{i + 1}
              </span>
              <span className="truncate text-foreground">{s.exercise}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {s.reps} × {s.loadLb} lb
              </span>
              <span className="font-mono text-[10px] tabular-nums text-blueprint">
                {(s.reps * s.loadLb).toLocaleString()} lb·v
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step,
  min,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
  min: number;
}) {
  return (
    <label className="flex items-center gap-1 rounded border border-border/40 bg-card/40 px-1.5">
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(Math.max(min, n));
        }}
        className="w-12 bg-transparent py-1 text-right font-mono text-xs tabular-nums text-foreground focus:outline-none"
      />
      <span className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
    </label>
  );
}

// ===========================================================================
// 3b. CAFE - Order ahead: pick drinks, add to cart, checkout
// ===========================================================================

type Drink = {
  id: string;
  name: string;
  detail: string;
  priceCents: number;
};

const MENU: Drink[] = [
  { id: "d1", name: "Oat latte", detail: "16oz · oat milk", priceCents: 550 },
  { id: "d2", name: "Cold brew", detail: "12oz · black", priceCents: 425 },
  { id: "d3", name: "Cortado", detail: "8oz · whole milk", priceCents: 475 },
  { id: "d4", name: "Matcha cloud", detail: "16oz · oat", priceCents: 600 },
  { id: "d5", name: "Espresso tonic", detail: "12oz", priceCents: 525 },
  { id: "d6", name: "Seasonal mocha", detail: "16oz · almond", priceCents: 625 },
];

export function CafePreview() {
  const shell = usePreviewShell();
  const [picked, setPicked] = useState<string | null>(null);

  const addDrink = useCallback(
    (drink: Drink) => {
      setPicked(drink.id);
      shell?.addToCart({
        name: drink.name,
        detail: drink.detail,
        priceCents: drink.priceCents,
      });
      window.setTimeout(() => setPicked(null), 400);
    },
    [shell]
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Coffee className="size-4 text-blueprint" strokeWidth={1.75} />
        <h3 className="font-mono text-sm tracking-tight text-foreground">
          Today&apos;s menu
        </h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          Roasted this morning
        </span>
      </div>
      <div className="flex gap-2">
        <StatChip label="Rewards" value="8 stamps" />
        <StatChip label="Pickup" value="~4 min" />
        <StatChip label="Orders today" value="1,204" />
      </div>
      <ul className={cn(cardCls, "flex-1 space-y-1.5 overflow-y-auto")}>
        {MENU.map((drink) => (
          <motion.li
            key={drink.id}
            animate={
              picked === drink.id
                ? { scale: [1, 1.02, 1], borderColor: "oklch(0.72 0.11 210 / 0.5)" }
                : { scale: 1 }
            }
            transition={{ duration: 0.25 }}
            className="flex items-center gap-3 rounded-md border border-border/40 bg-background/40 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">{drink.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {drink.detail}
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-foreground">
              ${(drink.priceCents / 100).toFixed(2)}
            </span>
            <button
              type="button"
              onClick={() => addDrink(drink)}
              className="inline-flex items-center gap-1 rounded-md border border-blueprint/40 bg-blueprint/10 px-2 py-1 font-mono text-[9px] tracking-widest text-blueprint uppercase transition-colors hover:bg-blueprint/20"
            >
              <Plus className="size-3" strokeWidth={2} />
              Add
            </button>
          </motion.li>
        ))}
      </ul>
      {shell && shell.cartCount > 0 && (
        <button
          type="button"
          onClick={shell.openCheckout}
          className="w-full rounded-md border border-blueprint/40 bg-blueprint/15 py-2 font-mono text-[10px] tracking-widest text-blueprint uppercase hover:bg-blueprint/25"
        >
          Go to checkout ({shell.cartCount})
        </button>
      )}
    </div>
  );
}

// ===========================================================================
// 3. RESERVATION - Table page with status cycling
// ===========================================================================

type ResStatus = "booked" | "seated" | "cancelled";
type Reservation = {
  id: string;
  guest: string;
  party: number;
  time: string;
  table: string;
  status: ResStatus;
};

const INITIAL_RES: Reservation[] = [
  { id: "r1", guest: "Rossi, 4-top", party: 4, time: "6:30 PM", table: "T-12", status: "seated" },
  { id: "r2", guest: "Chen party", party: 2, time: "7:00 PM", table: "T-04", status: "booked" },
  { id: "r3", guest: "Nguyen VIP", party: 6, time: "7:15 PM", table: "T-21", status: "booked" },
  { id: "r4", guest: "Patel + 1", party: 2, time: "7:45 PM", table: "T-08", status: "booked" },
  { id: "r5", guest: "Kim family", party: 3, time: "8:00 PM", table: "T-15", status: "booked" },
  { id: "r6", guest: "Walk-in: Torres", party: 2, time: "6:45 PM", table: "T-03", status: "seated" },
];

const STATUS_STYLE: Record<ResStatus, { label: string; badge: string }> = {
  booked: { label: "Booked", badge: "border-blueprint/40 bg-blueprint/10 text-blueprint" },
  seated: { label: "Seated", badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  cancelled: { label: "Cancelled", badge: "border-rose-500/40 bg-rose-500/10 text-rose-400" },
};

function nextStatus(current: ResStatus): ResStatus {
  if (current === "booked") return "seated";
  if (current === "seated") return "cancelled";
  return "booked";
}

export function ReservationPreview() {
  const [reservations, setReservations] = useState<Reservation[]>(INITIAL_RES);
  const covers = reservations
    .filter((r) => r.status === "seated" || r.status === "booked")
    .reduce((sum, r) => sum + r.party, 0);
  const seated = reservations.filter((r) => r.status === "seated").length;
  const advance = useCallback((id: string) => {
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: nextStatus(r.status) } : r))
    );
  }, []);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Utensils className="size-4 text-blueprint" strokeWidth={1.75} />
        <h3 className="font-mono text-sm tracking-tight text-foreground">
          Tonight&apos;s service
        </h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          Friday, October 10
        </span>
      </div>
      <div className="flex gap-2">
        <StatChip label="Covers booked" value={String(covers)} />
        <StatChip label="Currently seated" value={String(seated)} />
        <StatChip label="Reservations" value={String(reservations.length)} />
      </div>

      <ul className={cn(cardCls, "flex-1 space-y-1 overflow-y-auto")}>
        <AnimatePresence initial={false}>
          {reservations.map((r) => {
            const style = STATUS_STYLE[r.status];
            return (
              <motion.li
                key={r.id}
                layout
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded border border-transparent px-2 py-1.5 hover:border-border/40 hover:bg-muted/20"
              >
                <UserRound className="size-3 text-muted-foreground" strokeWidth={1.75} />
                <div className="min-w-0">
                  <p className="truncate text-xs text-foreground">{r.guest}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {r.time} · party of {r.party} · {r.table}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-widest uppercase",
                    style.badge
                  )}
                >
                  {style.label}
                </span>
                <button
                  type="button"
                  onClick={() => advance(r.id)}
                  className="inline-flex items-center gap-1 rounded border border-blueprint/30 bg-blueprint/5 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-blueprint uppercase transition-colors hover:bg-blueprint/15"
                >
                  Advance
                  <ArrowRight className="size-2.5" />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

// ===========================================================================
// 4. FLASHCARDS - Study session with flip + advance
// ===========================================================================

type Card = { id: string; front: string; back: string };
const INITIAL_CARDS: Card[] = [
  { id: "c1", front: "la mesa", back: "the table" },
  { id: "c2", front: "el gato", back: "the cat" },
  { id: "c3", front: "el libro", back: "the book" },
  { id: "c4", front: "la ventana", back: "the window" },
  { id: "c5", front: "el amigo", back: "the friend" },
];

export function FlashcardsPreview() {
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [known, setKnown] = useState<Set<string>>(new Set());

  const card = INITIAL_CARDS[index];
  const advance = useCallback(
    (goodAnswer: boolean) => {
      setKnown((prev) => {
        const next = new Set(prev);
        if (goodAnswer) next.add(card.id);
        else next.delete(card.id);
        return next;
      });
      setShowBack(false);
      setIndex((i) => (i + 1) % INITIAL_CARDS.length);
    },
    [card.id]
  );

  const reset = useCallback(() => {
    setIndex(0);
    setShowBack(false);
    setKnown(new Set());
  }, []);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-blueprint" strokeWidth={1.75} />
        <h3 className="font-mono text-sm tracking-tight text-foreground">
          Spanish B1 · Nouns
        </h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          Card {index + 1} of {INITIAL_CARDS.length}
        </span>
      </div>

      <div className="flex gap-2">
        <StatChip label="Known" value={String(known.size)} />
        <StatChip
          label="Remaining"
          value={String(INITIAL_CARDS.length - known.size)}
        />
        <StatChip
          label="Retention"
          value={`${Math.round((known.size / INITIAL_CARDS.length) * 100)}%`}
        />
      </div>

      <div
        className={cn(
          cardCls,
          "flex flex-1 flex-col items-center justify-center text-center"
        )}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${card.id}-${showBack ? "back" : "front"}`}
            initial={{ opacity: 0, rotateY: -20 }}
            animate={{ opacity: 1, rotateY: 0 }}
            exit={{ opacity: 0, rotateY: 20 }}
            transition={{ duration: 0.18 }}
            className="mb-4"
          >
            <p className="font-mono text-[9px] tracking-widest text-blueprint/70 uppercase">
              {showBack ? "Translation" : "Prompt"}
            </p>
            <p className="mt-2 font-mono text-2xl tracking-tight text-foreground">
              {showBack ? card.back : card.front}
            </p>
          </motion.div>
        </AnimatePresence>

        {!showBack ? (
          <button
            type="button"
            onClick={() => setShowBack(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-blueprint/40 bg-blueprint/10 px-3 py-1.5 font-mono text-[10px] tracking-widest text-blueprint uppercase transition-colors hover:bg-blueprint/20"
          >
            Show answer
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => advance(false)}
              className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-mono text-[10px] tracking-widest text-rose-400 uppercase transition-colors hover:bg-rose-500/20"
            >
              Again
            </button>
            <button
              type="button"
              onClick={() => advance(true)}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-mono text-[10px] tracking-widest text-emerald-400 uppercase transition-colors hover:bg-emerald-500/20"
            >
              Good
              <Check className="size-2.5" strokeWidth={2.5} />
            </button>
          </div>
        )}
        {known.size === INITIAL_CARDS.length && (
          <button
            type="button"
            onClick={reset}
            className="mt-4 inline-flex items-center gap-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase hover:text-foreground"
          >
            <RefreshCw className="size-2.5" />
            Deck complete, reset
          </button>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// 5. TASK MANAGER - Kanban board with move buttons
// ===========================================================================

type KanbanCard = {
  id: string;
  title: string;
  assignee: string;
};
type ColumnKey = "todo" | "in_progress" | "review" | "done";
type BoardState = Record<ColumnKey, KanbanCard[]>;

const COLUMN_ORDER: ColumnKey[] = ["todo", "in_progress", "review", "done"];
const COLUMN_LABEL: Record<ColumnKey, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

const INITIAL_BOARD: BoardState = {
  todo: [
    { id: "k1", title: "Draft security runbook", assignee: "IN" },
    { id: "k2", title: "Q4 metrics dashboard", assignee: "TP" },
  ],
  in_progress: [
    { id: "k3", title: "Migrate billing to Stripe", assignee: "MW" },
    { id: "k4", title: "Add SSO to admin panel", assignee: "DR" },
  ],
  review: [{ id: "k5", title: "Fix login redirect loop", assignee: "EV" }],
  done: [{ id: "k6", title: "Kill deprecated feature flag", assignee: "AC" }],
};

export function TaskManagerPreview() {
  const [board, setBoard] = useState<BoardState>(INITIAL_BOARD);

  const move = useCallback(
    (card: KanbanCard, from: ColumnKey, direction: -1 | 1) => {
      const fromIdx = COLUMN_ORDER.indexOf(from);
      const toIdx = fromIdx + direction;
      if (toIdx < 0 || toIdx >= COLUMN_ORDER.length) return;
      const to = COLUMN_ORDER[toIdx];
      setBoard((prev) => ({
        ...prev,
        [from]: prev[from].filter((c) => c.id !== card.id),
        [to]: [...prev[to], card],
      }));
    },
    []
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <CircleDot className="size-4 text-blueprint" strokeWidth={1.75} />
        <h3 className="font-mono text-sm tracking-tight text-foreground">
          Sprint 14
        </h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {Object.values(board).reduce((n, col) => n + col.length, 0)} cards
        </span>
      </div>

      <div className="grid flex-1 grid-cols-4 gap-2 overflow-hidden">
        {COLUMN_ORDER.map((col) => (
          <div
            key={col}
            className={cn(
              cardCls,
              "flex min-w-0 flex-col gap-2 !p-2"
            )}
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-[9px] tracking-widest text-blueprint/80 uppercase">
                {COLUMN_LABEL[col]}
              </p>
              <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                {board[col].length}
              </span>
            </div>
            <ul className="flex-1 space-y-1 overflow-y-auto">
              <AnimatePresence initial={false}>
                {board[col].map((card) => (
                  <motion.li
                    key={card.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="rounded border border-border/40 bg-card/40 p-1.5"
                  >
                    <p className="mb-1 text-[11px] leading-snug text-foreground">
                      {card.title}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="flex size-4 items-center justify-center rounded-full border border-blueprint/30 bg-blueprint/10 font-mono text-[8px] text-blueprint">
                        {card.assignee}
                      </span>
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          disabled={col === COLUMN_ORDER[0]}
                          onClick={() => move(card, col, -1)}
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-blueprint disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="Move left"
                        >
                          <ChevronLeft className="size-3" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          disabled={col === COLUMN_ORDER[COLUMN_ORDER.length - 1]}
                          onClick={() => move(card, col, 1)}
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-blueprint disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="Move right"
                        >
                          <ChevronRight className="size-3" strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// 6. CHATBOT - Conversational interface with canned assistant reply
// ===========================================================================

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const INITIAL_CHAT: ChatMessage[] = [
  {
    id: "m1",
    role: "assistant",
    content: "Hi! I can help with returns, order status, or account questions. What do you need?",
  },
  {
    id: "m2",
    role: "user",
    content: "I need to return the shoes I bought last week.",
  },
  {
    id: "m3",
    role: "assistant",
    content:
      "No problem. Purchases from the last 30 days are eligible. Do you want a full refund or store credit?",
  },
];

/**
 * Small canned reply generator. Not an LLM: picks a template based on
 * simple keyword sniffing so the chatbot preview feels responsive without
 * a network call. If a judge types random gibberish it falls back to a
 * neutral acknowledgement.
 */
function generateReply(text: string): string {
  const t = text.toLowerCase();
  if (/refund|return|store credit/.test(t)) {
    return "Got it. I've queued a return label to your email. It usually arrives within 15 minutes. Anything else?";
  }
  if (/order|shipping|delivery|when/.test(t)) {
    return "Let me check. Your order shipped yesterday from Newark and should arrive Thursday. Tracking is in your account.";
  }
  if (/cancel|stop|unsubscribe/.test(t)) {
    return "I can cancel this for you. To confirm, I'll send a one-time code to your email. Sound good?";
  }
  if (/thank|thanks|thx/.test(t)) {
    return "Anytime. I'll close this thread. Have a good one.";
  }
  return "Thanks for the detail. I'm looping in a specialist who can help with that. Expect a reply within an hour.";
}

export function ChatbotPreview() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || pending) return;
    const userMsg: ChatMessage = {
      id: `u${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setPending(true);
    // Simulate the assistant "thinking" for a beat then answering.
    window.setTimeout(() => {
      const reply: ChatMessage = {
        id: `a${Date.now()}`,
        role: "assistant",
        content: generateReply(text),
      };
      setMessages((prev) => [...prev, reply]);
      setPending(false);
    }, 600);
  }, [draft, pending]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Coffee className="size-4 text-blueprint" strokeWidth={1.75} />
        <h3 className="font-mono text-sm tracking-tight text-foreground">
          Support · Order #90717
        </h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          Avg reply 380ms
        </span>
      </div>

      <ul
        className={cn(
          cardCls,
          "flex flex-1 flex-col gap-2 overflow-y-auto"
        )}
      >
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.li
              key={m.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed",
                  m.role === "user"
                    ? "border-blueprint/40 bg-blueprint/10 text-foreground"
                    : "border-border/40 bg-card/40 text-foreground"
                )}
              >
                {m.content}
              </div>
            </motion.li>
          ))}
          {pending && (
            <motion.li
              key="typing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-start"
            >
              <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-card/40 px-3 py-2">
                <span className="size-1 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                <span className="size-1 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                <span className="size-1 animate-bounce rounded-full bg-muted-foreground/60" />
              </div>
            </motion.li>
          )}
        </AnimatePresence>
      </ul>

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Type a message..."
          disabled={pending}
          className="flex-1 rounded-md border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blueprint focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !draft.trim()}
          className="inline-flex items-center gap-1 rounded-md border border-blueprint/40 bg-blueprint/10 px-3 py-1.5 font-mono text-[10px] tracking-widest text-blueprint uppercase transition-colors hover:bg-blueprint/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
          <Send className="size-3" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// 7. PRODUCTIVITY - Fallback todo list
// ===========================================================================

type Todo = { id: string; title: string; done: boolean };
const INITIAL_TODOS: Todo[] = [
  { id: "p1", title: "Draft roadmap review", done: false },
  { id: "p2", title: "Auth flow rewrite", done: false },
  { id: "p3", title: "Vendor security questionnaire", done: false },
  { id: "p4", title: "Test plan for Q4", done: true },
  { id: "p5", title: "Weekly all-hands notes", done: true },
];

export function ProductivityPreview() {
  const [todos, setTodos] = useState<Todo[]>(INITIAL_TODOS);
  const [draft, setDraft] = useState("");

  const toggle = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  }, []);
  const add = useCallback(() => {
    const title = draft.trim();
    if (!title) return;
    setTodos((prev) => [...prev, { id: `p${Date.now()}`, title, done: false }]);
    setDraft("");
  }, [draft]);

  const remaining = todos.filter((t) => !t.done).length;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Play className="size-4 text-blueprint" strokeWidth={1.75} />
        <h3 className="font-mono text-sm tracking-tight text-foreground">
          My work
        </h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {remaining} of {todos.length} open
        </span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Add an item..."
          className="flex-1 rounded-md border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blueprint focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-md border border-blueprint/40 bg-blueprint/10 px-3 py-1.5 font-mono text-[10px] tracking-widest text-blueprint uppercase transition-colors hover:bg-blueprint/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
          <Plus className="size-3" strokeWidth={2} />
        </button>
      </div>

      <ul className={cn(cardCls, "flex-1 space-y-1 overflow-y-auto")}>
        <AnimatePresence initial={false}>
          {todos.map((t) => (
            <motion.li
              key={t.id}
              layout
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/20"
            >
              <button
                type="button"
                onClick={() => toggle(t.id)}
                aria-pressed={t.done}
                className={cn(
                  "flex size-4 items-center justify-center rounded border transition-colors",
                  t.done
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-border/50 text-transparent hover:border-blueprint/40"
                )}
              >
                <Check className="size-2.5" strokeWidth={3} />
              </button>
              <span
                className={cn(
                  "flex-1 text-xs",
                  t.done
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
                )}
              >
                {t.title}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

// ===========================================================================
// Dispatch
// ===========================================================================

/**
 * Return the interactive preview component for a given product category.
 * Kept as a switch (not a map) because the templates aren't
 * interchangeable data -- they're distinct components with different DOM
 * structures and internal state.
 */
export function templateForCategory(
  category: ProductCategory
): React.ComponentType {
  switch (category) {
    case "budgeting":
      return BudgetingPreview;
    case "fitness":
      return FitnessPreview;
    case "reservation":
      return ReservationPreview;
    case "cafe":
      return CafePreview;
    case "flashcards":
      return FlashcardsPreview;
    case "task_manager":
      return TaskManagerPreview;
    case "chatbot":
      return ChatbotPreview;
    case "productivity":
    default:
      return ProductivityPreview;
  }
}
