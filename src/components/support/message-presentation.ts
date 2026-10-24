import type { ConvMessage } from "@/domain/support";
import type { ThreadMsg } from "./thread-types";
type RecommendationCopy = Record<"product" | "home" | "wallet" | "support" | "unavailable" | "unknown", string>;

/** Inbox cards are explicit internal destinations, never URLs supplied by a sender. */
export function presentRecommendation(message: ConvMessage, copy: RecommendationCopy): Partial<ThreadMsg> {
  if (message.kind !== "SKU" && message.kind !== "LINK") return {};
  const text = message.kind === "SKU" ? [...new Set([message.text, message.skuName].filter(Boolean))].join("\n") : message.text;
  if (message.targetAvailability !== "AVAILABLE") return { text: [text, message.targetAvailability === "UNAVAILABLE" ? copy.unavailable : copy.unknown].join("\n") };
  if (message.kind === "SKU" && message.skuId && /^[a-zA-Z0-9_-]+$/.test(message.skuId)) return { text, ctaLabel: copy.product, ctaHref: "/pages/store/detail?id=" + encodeURIComponent(message.skuId) };
  if (message.linkTarget && Object.keys(message.linkTarget.params).length === 0) {
    const target = message.linkTarget.type;
    if (target === "HOME") return { text, ctaLabel: copy.home, ctaHref: "/home" };
    if (target === "WALLET") return { text, ctaLabel: copy.wallet, ctaHref: "/me/wallet" };
    if (target === "SUPPORT") return { text, ctaLabel: copy.support, ctaHref: "/pages/support/messages" };
  }
  return { text };
}
export function localMessageImage(source?: string): string | undefined {
  return source && /^data:image\/(png|jpeg|webp);base64,/.test(source) ? source : undefined;
}
