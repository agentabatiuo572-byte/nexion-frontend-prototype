import { describe, expect, it } from "vitest";
import { orderListPanels } from "@/lib/remote-commerce-refresh";

const pages = import.meta.glob("./{orders,order-detail}.vue", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const page = (name: string) => pages[`./${name}`] ?? "";

describe("orders cursor pagination UI", () => {
  it("offers an accessible explicit load-more control", () => {
    const source = page("orders.vue");
    expect(source).toContain("orders.nextCursor");
    expect(source).toContain('@click.stop="loadMoreOrders"');
    expect(source).toContain('@keydown.enter.prevent.stop="loadMoreOrders"');
    expect(source).toContain('@keydown.space.prevent.stop="loadMoreOrders"');
    expect(source).toContain("orders.loadMoreRemote()");
  });

  it("resolves a deep-linked order across all available pages", () => {
    expect(page("order-detail.vue")).toContain("orders.ensureRemoteOrder(id.value)");
  });

  it("shows an outage without claiming that a partial read found no orders", () => {
    const source = page("orders.vue");
    expect(orderListPanels({ loading: false, availability: "partial", orderCount: 0 }))
      .toEqual({ mainPresentation: "partial", showSourceOutage: true });
    expect(source).toContain('v-if="orderPanels.showSourceOutage"');
    expect(source).toContain('v-if="orderPanels.mainPresentation === \'empty\'"');
    expect(source).not.toContain('v-if="mainContentEmpty"');
  });
});
