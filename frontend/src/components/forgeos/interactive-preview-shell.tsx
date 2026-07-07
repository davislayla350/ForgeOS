"use client";

/**
 * InteractivePreviewShell
 * =======================
 *
 * Wraps category previews with a believable app flow:
 *   login → app → checkout
 *
 * Keeps the blueprint palette. No "AI thinking" chrome — just a product
 * that feels shippable. Children can add items to cart via context.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Coffee, Lock, ShoppingBag, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type CartItem = {
  id: string;
  name: string;
  detail?: string;
  priceCents: number;
};

type PreviewPhase = "login" | "app" | "checkout" | "confirmed";

type ShellContextValue = {
  addToCart: (item: Omit<CartItem, "id">) => void;
  cartCount: number;
  openCheckout: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function usePreviewShell(): ShellContextValue | null {
  return useContext(ShellContext);
}

type InteractivePreviewShellProps = {
  productName: string;
  urlHost: string;
  children: ReactNode;
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function InteractivePreviewShell({
  productName,
  urlHost,
  children,
}: InteractivePreviewShellProps) {
  const [phase, setPhase] = useState<PreviewPhase>("login");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [email, setEmail] = useState("you@example.com");

  const addToCart = useCallback((item: Omit<CartItem, "id">) => {
    setCart((prev) => [
      ...prev,
      { ...item, id: `item-${Date.now()}-${prev.length}` },
    ]);
  }, []);

  const openCheckout = useCallback(() => {
    if (cart.length > 0) setPhase("checkout");
  }, [cart.length]);

  const totalCents = useMemo(
    () => cart.reduce((s, i) => s + i.priceCents, 0),
    [cart]
  );

  const ctx = useMemo(
    () => ({ addToCart, cartCount: cart.length, openCheckout }),
    [addToCart, cart.length, openCheckout]
  );

  return (
    <ShellContext.Provider value={ctx}>
      <div className="relative flex h-full min-h-[360px] flex-col">
        <AnimatePresence mode="wait">
          {phase === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="flex flex-1 flex-col items-center justify-center px-4 py-8"
            >
              <div className="w-full max-w-sm rounded-lg border border-border/50 bg-card/40 p-6 shadow-lg">
                <div className="mb-5 flex items-center gap-2">
                  <Coffee className="size-4 text-blueprint" strokeWidth={1.75} />
                  <span className="font-mono text-sm tracking-tight text-foreground">
                    {productName}
                  </span>
                </div>
                <p className="mb-4 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                  Sign in to continue
                </p>
                <label className="mb-3 block">
                  <span className="mb-1 block font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
                    Email
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-border/50 bg-background/60 px-3 py-2 font-mono text-xs text-foreground focus:border-blueprint focus:outline-none"
                  />
                </label>
                <label className="mb-5 block">
                  <span className="mb-1 block font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
                    Password
                  </span>
                  <input
                    type="password"
                    defaultValue="••••••••"
                    className="w-full rounded-md border border-border/50 bg-background/60 px-3 py-2 font-mono text-xs text-foreground focus:border-blueprint focus:outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setPhase("app")}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-blueprint/50 bg-blueprint/15 py-2.5 font-mono text-[11px] tracking-widest text-blueprint uppercase transition-colors hover:bg-blueprint/25"
                >
                  <Lock className="size-3.5" strokeWidth={1.75} />
                  Sign in
                </button>
                <p className="mt-3 text-center font-mono text-[9px] text-muted-foreground">
                  {urlHost}
                </p>
              </div>
            </motion.div>
          )}

          {phase === "app" && (
            <motion.div
              key="app"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="mb-2 flex items-center gap-2 border-b border-border/30 pb-2">
                <User className="size-3 text-muted-foreground" strokeWidth={1.75} />
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {email}
                </span>
                <button
                  type="button"
                  onClick={openCheckout}
                  disabled={cart.length === 0}
                  className={cn(
                    "ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] tracking-widest uppercase transition-colors",
                    cart.length > 0
                      ? "border-blueprint/40 bg-blueprint/10 text-blueprint hover:bg-blueprint/20"
                      : "border-border/40 text-muted-foreground opacity-60"
                  )}
                >
                  <ShoppingBag className="size-3" strokeWidth={1.75} />
                  Checkout
                  {cart.length > 0 && (
                    <span className="rounded-full bg-blueprint px-1.5 font-mono text-[9px] text-blueprint-foreground">
                      {cart.length}
                    </span>
                  )}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            </motion.div>
          )}

          {(phase === "checkout" || phase === "confirmed") && (
            <motion.div
              key="checkout"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-1 flex-col px-2 py-4"
            >
              {phase === "checkout" ? (
                <>
                  <h3 className="mb-3 font-mono text-sm tracking-tight text-foreground">
                    Checkout
                  </h3>
                  <ul className="mb-4 flex-1 space-y-2 overflow-y-auto">
                    {cart.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between rounded-md border border-border/40 bg-card/40 px-3 py-2"
                      >
                        <div>
                          <p className="text-xs text-foreground">{item.name}</p>
                          {item.detail && (
                            <p className="font-mono text-[10px] text-muted-foreground">
                              {item.detail}
                            </p>
                          )}
                        </div>
                        <span className="font-mono text-xs tabular-nums text-foreground">
                          {formatPrice(item.priceCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-border/40 pt-3">
                    <div className="mb-3 flex justify-between font-mono text-sm">
                      <span className="text-muted-foreground">Total</span>
                      <span className="tabular-nums text-foreground">
                        {formatPrice(totalCents)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhase("confirmed")}
                      className="w-full rounded-md border border-emerald-500/40 bg-emerald-500/10 py-2.5 font-mono text-[11px] tracking-widest text-emerald-400 uppercase transition-colors hover:bg-emerald-500/20"
                    >
                      Pay {formatPrice(totalCents)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhase("app")}
                      className="mt-2 w-full py-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase hover:text-foreground"
                    >
                      Back to app
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <span className="mb-3 flex size-12 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                    <Check className="size-6" strokeWidth={2} />
                  </span>
                  <p className="font-mono text-sm text-foreground">Order confirmed</p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    Pickup ready in ~4 minutes. A receipt was sent to {email}.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCart([]);
                      setPhase("app");
                    }}
                    className="mt-4 rounded-md border border-blueprint/40 bg-blueprint/10 px-4 py-2 font-mono text-[10px] tracking-widest text-blueprint uppercase hover:bg-blueprint/20"
                  >
                    Order again
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ShellContext.Provider>
  );
}
