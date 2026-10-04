import type { CanonicalEvent } from "@/api/events-api";
import type { NexEvent } from "@/mock/events";

export interface EventActionLabels {
  claimDiscount: string;
  checkIn: string;
  reinvest: string;
  spin: string;
  leaderboard: string;
  viewDetails: string;
  progress: string;
  wheelPool: string;
}

const TINT_BY_KIND: Record<CanonicalEvent["kind"], string> = {
  discount: "#FFC83D",
  referral: "#7DD3FC",
  wheel: "#C4B5FD",
  regional: "#FB7185",
  boost: "#86EFAC",
  seasonal: "#F9A8D4",
  holding: "#93C5FD",
  onboarding: "#FDE68A",
};

function businessCtaLabel(event: CanonicalEvent, labels: EventActionLabels): string | undefined {
  if (event.trackable) return undefined;
  if (event.kind === "wheel") return labels.spin;
  if (!event.href) return undefined;
  if (event.kind === "discount") return labels.claimDiscount;
  if (event.href === "/pages/daily/daily") return labels.checkIn;
  if (event.href === "/pages/me/wallet-repurchase") return labels.reinvest;
  if (event.href === "/pages/team/leaderboard") return labels.leaderboard;
  return labels.viewDetails;
}

function claimedUseHref(event: CanonicalEvent): string | undefined {
  if (event.userStatus !== "CLAIMED") return undefined;
  return event.href || undefined;
}

export function remoteEventView(event: CanonicalEvent, labels: EventActionLabels): NexEvent {
  return {
    id: event.eventCode,
    kind: event.kind,
    status: event.state,
    title: event.title,
    subtitle: event.subtitle,
    emoji: "✦",
    tint: TINT_BY_KIND[event.kind],
    reward: event.kind === "wheel" ? event.rewardName : `${event.rewardAmount} ${event.rewardName}`,
    progress: event.trackable
      ? { current: event.progressValue, total: event.targetValue, label: labels.progress }
      : null,
    joined: ["JOINED", "CLAIMABLE", "CLAIMED"].includes(event.userStatus),
    ctaLabel: businessCtaLabel(event, labels),
    href: event.href || undefined,
    runtimeSource: "remote",
    useHref: claimedUseHref(event),
    featured: event.featured,
    trackable: event.trackable,
    done: ["CLAIMABLE", "CLAIMED"].includes(event.userStatus),
    rewardNEX: event.rewardType === "NEX" ? event.rewardAmount : 0,
  };
}
