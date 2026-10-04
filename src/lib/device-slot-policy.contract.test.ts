// @ts-nocheck -- source-contract test runs in Node; the app tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("device slot policy consumers", () => {
  it("uses the shared physical-slot predicate in every count and activation surface", () => {
    const app = readFileSync(new URL("../store/app.ts", import.meta.url), "utf8");
    const earn = readFileSync(new URL("../pages/earn/earn.vue", import.meta.url), "utf8");
    const slots = readFileSync(new URL("../components/earn/empty-slots-hint.vue", import.meta.url), "utf8");
    const poster = readFileSync(new URL("../components/team/share-poster-sheet.vue", import.meta.url), "utf8");
    const checkout = readFileSync(new URL("../pages/store/checkout.vue", import.meta.url), "utf8");
    const deviceInventory = readFileSync(new URL("../pages/me/devices.vue", import.meta.url), "utf8");

    expect(app).toContain("isActiveSlotDevice");
    expect(app).toContain("occupiesDeviceSlot(device.kind)");
    expect(earn).toContain("isActiveSlotDevice");
    expect(slots).toContain("isActiveSlotDevice");
    expect(poster).toContain("app.visibleDevices.filter(isActiveSlotDevice).length");
    expect(poster).not.toContain("app.devices.length");
    expect(checkout).toContain('product.value?.productType !== "SHARE"');
    expect(checkout).toContain("targetOccupiesPhysicalSlot.value &&");
    expect(deviceInventory).toContain(':disabled="slotsFull && occupiesDeviceSlot(d.kind)"');
    expect(deviceInventory).toContain("if (occupiesDeviceSlot(d.kind) && slotsFull.value)");
  });
});
