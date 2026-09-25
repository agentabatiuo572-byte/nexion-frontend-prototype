import { expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import type { OrderStatus } from "@/store/orders";
import { orderStatusText } from "./order-status-copy";

it("keeps every order outcome distinct and localized without exposing unknown states", () => {
  const states: OrderStatus[] = ["placed", "paid", "provisioning", "activated", "cancelled", "payment_failed", "expired", "provisioning_failed", "refunded", "chargeback"];
  for (const { orders } of [en, zh, vi]) {
    const labels = states.map((state) => orderStatusText(orders, state));
    expect(new Set(labels).size).toBe(states.length);
    expect(labels.every((label) => Boolean(label) && !states.includes(label as OrderStatus))).toBe(true);
    expect(orderStatusText(orders, "INTERNAL_FAILURE" as OrderStatus)).toBe(orders.refreshFailed);
  }
});
