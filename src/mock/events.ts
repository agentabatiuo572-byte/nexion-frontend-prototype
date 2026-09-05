/**
 * Events Center mock — ported from Nexion-prototype/lib/mock/events.ts.
 *
 * Promotions, contests, lucky-wheels, regional PK. MOCK-ONLY; production:
 * GET /api/events + per-user join/claim overlay. tint hex are the source's
 * literal per-event accent palette (data values used at runtime in color-mix
 * / gradients), never substituting v5 surface/text tokens.
 *
 * `trackable` events (those whose progress is user-driven) opt into the
 * event-quest store's join/claim flow; decorative/auto events keep their
 * hardcoded `joined` flag. The source's separate evaluateEventProgress()
 * evaluator is inlined here as the `trackable` flag + a fixed reward map,
 * keeping the page self-contained without porting the live-progress context.
 */

export type EventKind =
  | "discount"
  | "referral"
  | "wheel"
  | "regional"
  | "boost"
  | "seasonal"
  | "holding"
  | "onboarding";

export type EventStatus = "ongoing" | "upcoming" | "ended";

export interface NexEvent {
  id: string;
  kind: EventKind;
  status: EventStatus;
  title: string;
  subtitle: string;
  ribbon?: string;
  emoji: string;
  tint: string;
  reward: string;
  progress: { current: number; total: number; label: string } | null;
  countdown?: string;
  startsIn?: string;
  /** Hardcoded join flag for decorative/auto events */
  joined: boolean;
  ctaLabel?: string;
  href?: string;
  /** Where "Use it" navigates after the reward is claimed (discount → store, NEX reward → NEX wallet). */
  useHref?: string;
  featured?: boolean;
  /** Opt into the join→claim flow (progress is user-driven). */
  trackable?: boolean;
  /** Whether the trackable goal is met (mock; real: live evaluator). */
  done?: boolean;
  /** NEX reward on claim (trackable events only). */
  rewardNEX?: number;
}

export const EVENTS: NexEvent[] = [
  {
    id: "evt-pro-upgrade-7d",
    kind: "discount",
    status: "ongoing",
    title: "NexGridBox Pro · Flash Upgrade",
    subtitle: "Upgrade to Pro within 7 days · $500 OFF + ×2 Genesis raffle tickets.",
    ribbon: "LIMITED · ENDS 3D 12H",
    emoji: "📦",
    tint: "#FFC83D",
    reward: "$500 OFF + ×2 tickets",
    progress: { current: 247, total: 500, label: "claimed" },
    countdown: "3d 12h 04m",
    joined: false,
    featured: true,
    ctaLabel: "Claim discount",
    useHref: "/pages/store/store",
  },
  {
    id: "evt-refer-5-get-pro",
    kind: "referral",
    status: "ongoing",
    title: "Refer 5 · Win a Pro",
    subtitle: "Invite 5 direct friends within 7 days · get a free NexGridBox Pro ($899).",
    ribbon: "TEAM CHALLENGE",
    emoji: "🎁",
    tint: "#C6FF3A",
    reward: "Free NexGridBox Pro",
    progress: { current: 2, total: 5, label: "friends invited" },
    countdown: "6d 02h",
    joined: true,
    ctaLabel: "View progress",
    trackable: true,
    done: false,
    rewardNEX: 200,
    useHref: "/pages/me/wallet-nex",
  },
  {
    id: "evt-weekend-double-nex",
    kind: "boost",
    status: "ongoing",
    title: "Weekend Double NEX",
    subtitle: "Every Sat–Sun check-in earns 2× NEX · auto-applied.",
    ribbon: "ACTIVE NOW",
    emoji: "💎",
    tint: "#7C5CFF",
    reward: "2× NEX",
    progress: null,
    countdown: "1d 18h",
    joined: true,
    ctaLabel: "Check in",
    href: "/pages/daily/daily",
  },
  {
    id: "evt-regional-pk",
    kind: "regional",
    status: "ongoing",
    title: "Regional PK · Win $20K Pool",
    subtitle: "LatAm vs SEA vs EU · weekly volume race. Top region splits $20K.",
    ribbon: "WEEK 21",
    emoji: "🌎",
    tint: "#FF6B35",
    reward: "Share $20,000 pool",
    progress: { current: 4_120_000, total: 8_000_000, label: "your region $" },
    countdown: "2d 09h",
    joined: false,
    ctaLabel: "Join the race",
    href: "/pages/team/leaderboard",
  },
  {
    id: "evt-spring-spin",
    kind: "wheel",
    status: "ongoing",
    title: "Spring Lucky Spin",
    subtitle: "1 free spin per day · win NEX, USDT & a device coupon.",
    ribbon: "DAILY · RESETS 00:00 UTC",
    emoji: "🎰",
    tint: "#FFC83D",
    reward: "Up to $500 USDT",
    progress: { current: 0, total: 1, label: "spin left today" },
    countdown: "Resets in 08:42:11",
    joined: false,
    ctaLabel: "Spin now",
  },
  {
    id: "evt-reinvest-bonus",
    kind: "boost",
    status: "ongoing",
    title: "Re-invest Bonus Week",
    subtitle: "Re-invest $100 = 2 Genesis tickets (normally 1) · all week long.",
    ribbon: "DOUBLED",
    emoji: "🔄",
    tint: "#9077FF",
    reward: "2× Genesis tickets",
    progress: null,
    countdown: "4d 03h",
    joined: false,
    ctaLabel: "Re-invest now",
    href: "/pages/me/wallet-repurchase",
  },
  {
    id: "evt-onboarding-7d",
    kind: "onboarding",
    status: "ongoing",
    title: "New Pilot · 7-Day Boost",
    subtitle: "Reach V2 within 7 days of joining · get +200 NEX + 1 Streak Saver.",
    ribbon: "FIRST WEEK",
    emoji: "🚀",
    tint: "#C6FF3A",
    reward: "+200 NEX + 1 Saver",
    progress: { current: 1, total: 4, label: "milestones done" },
    countdown: "5d 11h",
    joined: true,
    ctaLabel: "View checklist",
    trackable: true,
    done: false,
    rewardNEX: 200,
    useHref: "/pages/me/wallet-nex",
  },
  {
    id: "evt-black-friday",
    kind: "seasonal",
    status: "upcoming",
    title: "Black Friday · 20% OFF Everything",
    subtitle: "All hardware $300+ off · code BF20 stacks with Pro Flash Upgrade.",
    ribbon: "PRE-LAUNCH",
    emoji: "🛍",
    tint: "#FF6B35",
    reward: "20% OFF + stack codes",
    progress: null,
    startsIn: "Starts in 12d 04h",
    joined: false,
    ctaLabel: "Notify me",
  },
  {
    id: "evt-nex-holders-share",
    kind: "holding",
    status: "ongoing",
    title: "NEX Holders Share · $5K Pool",
    subtitle: "Hold ≥ 1,000 NEX for 7 days · automatically share a $5K USDT pool.",
    ribbon: "AUTO-ENROLL",
    emoji: "💰",
    tint: "#C6FF3A",
    reward: "Share $5,000 USDT",
    progress: { current: 1240, total: 1000, label: "your NEX" },
    countdown: "4d 17h",
    joined: true,
    ctaLabel: "View details",
    trackable: true,
    done: true,
    rewardNEX: 120,
    useHref: "/pages/me/wallet-nex",
  },
  {
    id: "evt-anniversary-spin",
    kind: "wheel",
    status: "ended",
    title: "Anniversary Mega Spin",
    subtitle: "Platform 1-year anniversary · 10,000 winners shared $250K USDT.",
    ribbon: "CONCLUDED",
    emoji: "🎉",
    tint: "#5F6A7E",
    reward: "$250,000 distributed",
    progress: null,
    joined: true,
    ctaLabel: "View results",
  },
];

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  discount: "Flash Sale",
  referral: "Refer & Earn",
  wheel: "Lucky Wheel",
  regional: "Regional PK",
  boost: "Bonus Boost",
  seasonal: "Seasonal",
  holding: "Holders Reward",
  onboarding: "New Pilot",
};
