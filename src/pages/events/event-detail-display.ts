import type { EventDetail } from "@/api/event-detail-api";
import type { eventDetailCopy } from "@/i18n/event-detail";
import { formatAmount } from "@/lib/amount-display";
import { promotionStoreHref } from "@/lib/promotion-entry";

export function eventDetailRules(rules: EventDetail["rules"], copy: typeof eventDetailCopy.en) {
  return Object.entries(copy.labels).flatMap(([key, label]) => {
    const value = rules[key];
    if (value === undefined || value === null || value === "") return [];
    if (key === "weekdays" && Array.isArray(value)) return [{ label, value: value.map(day => copy.weekdays[Number(day) - 1]).filter(Boolean).join(" · ") }];
    if (key === "regions" && Array.isArray(value)) return [{ label, value: value.map(region => typeof region?.name === "string" ? region.name : "").filter(Boolean).join(" · ") }];
    return typeof value === "string" || typeof value === "number" ? [{ label, value: String(value) }] : [];
  }).filter(row => row.value);
}
export function eventDetailReward(reward: EventDetail["rewards"][number], copy: typeof eventDetailCopy.en): string {
  const label = ({ NEX: "UVT", USDT: "USDT", DEVICE: copy.device, STREAK_SAVER: copy.saver, GENESIS_TICKET: copy.tickets } as Record<string, string>)[reward.type] ?? copy.reward;
  return `${reward.pool ? `${copy.labels.poolUsdt} · ` : ""}${formatAmount(reward.quantity ?? reward.amount)} ${label}`;
}
export function eventClaimCommandKey(code: string, claimKeys: readonly string[] = []): string {
  return `h4-event-claim:${code}${claimKeys[0] && claimKeys[0] !== "ONCE" ? `:${claimKeys[0]}` : ""}`;
}
export function eventDetailHref(detail: EventDetail): string {
  if (["discount", "seasonal"].includes(detail.event.kind) && typeof detail.rules.promotionActivityId === "string" && detail.rules.promotionActivityId) return promotionStoreHref(detail.rules.promotionActivityId);
  if (detail.event.kind === "regional") return "";
  return detail.event.href;
}
export function eventDetailAction(detail: EventDetail): "join" | "claim" | "open" | "remind" | null {
  if (detail.eligible && detail.userStatus === "CLAIMABLE") return "claim";
  if (detail.enabled && detail.event.state === "upcoming" && !detail.reminderSubscribed) return "remind";
  if (!detail.enabled || !detail.eligible || detail.event.state !== "ongoing" || ["DISABLED", "NOT_STARTED", "ENDED", "NOT_ELIGIBLE", "CLAIMED"].includes(detail.eligibilityReason)) return null;
  if (detail.event.trackable && detail.userStatus === "AVAILABLE") return "join";
  return eventDetailHref(detail) ? "open" : null;
}
