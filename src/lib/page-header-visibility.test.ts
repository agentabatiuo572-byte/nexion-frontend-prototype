import { describe, expect, it } from "vitest";
import { createPageHeaderVisibilityGate } from "./page-header-visibility";

describe("page header visibility gate", () => {
  it("does not let an async update from a hidden order detail reclaim the next page header", () => {
    const writes: string[] = [];
    const gate = createPageHeaderVisibilityGate<string>((title) => writes.push(title), () => writes.push("clear"));
    gate.publish("TRC-ORDER");
    gate.hide();
    gate.publish("TRC-ORDER");
    gate.show("My orders");
    expect(writes).toEqual(["TRC-ORDER", "clear", "My orders"]);
  });

  it("allows a page to publish again only after it is shown", () => {
    const writes: string[] = [];
    const gate = createPageHeaderVisibilityGate<string>((title) => writes.push(title), () => undefined);
    gate.hide();
    gate.publish("stale");
    gate.show("Orders");
    gate.publish("Orders refreshed");
    expect(writes).toEqual(["Orders", "Orders refreshed"]);
  });
});
