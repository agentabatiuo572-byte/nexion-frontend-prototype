import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { resolveTrialCheckoutProductId, useTrialConfig } from "./trial-config";

describe("trial checkout product routing", () => {
  it("maps the server policy alias to the real catalog SKU", () => {
    expect(resolveTrialCheckoutProductId("device-trial-standard")).toBe("stellarbox-s1");
  });

  it("preserves canonical and other server-selected E1 SKUs while rejecting malformed ids", () => {
    expect(resolveTrialCheckoutProductId("stellarbox-s1")).toBe("stellarbox-s1");
    expect(resolveTrialCheckoutProductId("stellarbox-pro-v2")).toBe("stellarbox-pro-v2");
    expect(resolveTrialCheckoutProductId("../../invalid")).toBeNull();
  });
});

describe("trial card server config", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("uses the PC-managed remaining quota instead of a frontend constant", () => {
    const store = useTrialConfig();
    store.applyAuthoritative({
      trialDays: "3",
      graceDays: "7",
      discountRate: "15",
      discountCapUSD: "50",
      trialOffsetCapUSD: "50",
      trialProductId: "device-trial-standard",
      trialProductName: "NexGridBox S1",
      trialPriceUSD: "1299",
      shadowDailyUSD: "7",
      shadowDailyNEX: "40",
      phaseOpen: true,
      autoPushEnabled: true,
      autoPushDelayMs: "1500",
      autoPushCooldownHours: "24",
      autoPushMaxPerSession: "1",
      seatsLeftToday: "47",
    });

    expect(store.config.seatsLeftToday).toBe(47);
  });

  it.each(["-1", "47.5", "1000001"])("rejects an out-of-contract quota %s", (quota) => {
    const store = useTrialConfig();
    expect(() => store.applyAuthoritative({
      trialDays: "3", graceDays: "7", discountRate: "15", discountCapUSD: "50",
      trialOffsetCapUSD: "50", trialProductId: "device-trial-standard", trialPriceUSD: "1299",
      trialProductName: "NexGridBox S1",
      shadowDailyUSD: "7", shadowDailyNEX: "40", phaseOpen: true, autoPushEnabled: true,
      autoPushDelayMs: "1500", autoPushCooldownHours: "24", autoPushMaxPerSession: "1",
      seatsLeftToday: quota,
    })).toThrow("TRIAL_CONFIG_RESPONSE_INVALID");
  });

  it("accepts a safe E1 SKU and server-owned display name selected in H2", () => {
    const store = useTrialConfig();
    store.applyAuthoritative({
      trialDays: "3", graceDays: "7", discountRate: "15", discountCapUSD: "50",
      trialOffsetCapUSD: "50", trialProductId: "stellarbox-pro-v2", trialProductName: "NexGridBox Pro V2",
      trialPriceUSD: "2499", shadowDailyUSD: "7", shadowDailyNEX: "40",
      phaseOpen: true, autoPushEnabled: true, autoPushDelayMs: "1500",
      autoPushCooldownHours: "24", autoPushMaxPerSession: "1", seatsLeftToday: "47",
    });

    expect(store.config.trialProductId).toBe("stellarbox-pro-v2");
    expect(store.config.trialProductName).toBe("NexGridBox Pro V2");
  });
});
