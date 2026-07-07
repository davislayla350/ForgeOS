export type AIEmployee = {
  id: string;
  name: string;
  role: string;
  status:
    | "active"
    | "reviewing"
    | "waiting"
    | "blocked"
    | "complete"
    | "idle"
    | "offline";
  initials: string;
  /**
   * Full backend AgentState when available (idle | working | waiting |
   * reviewing | blocked | complete). Optional so mock/fallback data still
   * validates; the sidebar keeps using ``status`` and the network panel
   * reads this for fine-grained visualisation.
   */
  rawState?:
    | "idle"
    | "working"
    | "waiting"
    | "reviewing"
    | "blocked"
    | "complete";
};

export const AI_EMPLOYEES: AIEmployee[] = [
  {
    id: "1",
    name: "Aria Chen",
    role: "CEO",
    status: "offline",
    initials: "AC",
  },
  {
    id: "2",
    name: "Elena Voss",
    role: "Product Manager",
    status: "offline",
    initials: "EV",
  },
  {
    id: "3",
    name: "Marcus Webb",
    role: "Engineer",
    status: "offline",
    initials: "MW",
  },
  {
    id: "4",
    name: "Iris Nolan",
    role: "Security",
    status: "offline",
    initials: "IN",
  },
  {
    id: "5",
    name: "Theo Park",
    role: "QA",
    status: "offline",
    initials: "TP",
  },
  {
    id: "6",
    name: "Dex Rivera",
    role: "DevOps",
    status: "offline",
    initials: "DR",
  },
];
