// Card-binding push-notification templates — user-side counterpart of the ops
// console's card actions (FEAT-CARDS02: unbind card / send rebind notice; spec
// PRD/specs/FEAT-CARDS01-admin-card-query-unbind.md ⑦ fixes only trigger
// timing + deep link — copy lives in i18n `notifs.card*`).
//
// PRODUCTION: the backend emits `card.unbound` (admin- AND user-initiated
// unbind both, payload carries unboundBy) and `card.rebind_notified` (ops
// asked the user to swap the trial-guarantee card); the push channel delivers
// them into the notification feed. MOCK: static sample builders — a caller
// (e.g. the wallet-cards unbind flow, or demo seeding) resolves the current
// locale's copy at push time and hands the payload to
// useNotifications().push(), exactly like every existing pushed notification
// (nova-bubble channels). Copy references i18n keys so samples stay bilingual
// (conversations.ts seed precedent); the notification feed itself deliberately
// seeds empty (store note), so nothing is auto-injected here.

import type { Messages } from "@/i18n/messages/en";
import type { PushInput } from "@/store/notifications";
import { brandLabel, type SavedCard } from "@/store/cards";
import { fmt } from "@/i18n/format";

type NotifNs = Messages["notifs"];

/** Card fields a push template needs — subset of SavedCard / of the backend event payload. */
export type CardPushRef = Pick<SavedCard, "tokenId" | "brand" | "last4">;

/** Deep link → my bank cards (front PRD §9.10) — real uni route in pages.json; both templates land here. */
export const CARD_NOTIF_HREF = "/pages/me/wallet-cards";

/**
 * Event `card.unbound` — the card was unbound (by the user or by ops).
 * A card unbinds once (terminal state), so the id is deterministic per token:
 * a replayed event dedups in the feed. PRODUCTION: id = backend event id.
 */
export function cardUnboundNotification(ns: NotifNs, card: CardPushRef): PushInput {
  return {
    id: `card-unbound-${card.tokenId}`,
    kind: "system",
    priority: "normal",
    title: ns.cardUnboundTitle,
    body: fmt(ns.cardUnboundBody, { brand: brandLabel(card.brand), last4: card.last4 }),
    ctaLabel: ns.cardUnboundCta,
    ctaHref: CARD_NOTIF_HREF,
  };
}

/**
 * Event `card.rebind_notified` — ops sent a rebind notice: this card can no
 * longer guarantee the free trial; the user should bind a new one. Each notice
 * lands as a fresh feed item (ops may re-notify), hence the timestamped id.
 * PRODUCTION: id = backend event id. High priority — action is needed to keep
 * the trial guaranteed.
 */
export function cardRebindNotification(ns: NotifNs, card: CardPushRef): PushInput {
  return {
    id: `card-rebind-${card.tokenId}-${Date.now().toString(36)}`,
    kind: "system",
    priority: "high",
    title: ns.cardRebindTitle,
    body: fmt(ns.cardRebindBody, { brand: brandLabel(card.brand), last4: card.last4 }),
    ctaLabel: ns.cardRebindCta,
    ctaHref: CARD_NOTIF_HREF,
  };
}
