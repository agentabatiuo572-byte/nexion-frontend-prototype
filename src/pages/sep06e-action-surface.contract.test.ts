import { describe, expect, it } from "vitest";

const sources = import.meta.glob([
  "./me/wallet-repurchase.vue",
  "./market/market.vue",
  "./events/events.vue",
  "./onboarding/intro.vue",
  "../components/lucky-spin-sheet.vue",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const read = (path: string) => sources[path] ?? "";

describe("September 6 action surfaces", () => {
  it("renders server repurchase orders and confirms both irreversible order actions", () => {
    const source = read("./me/wallet-repurchase.vue");
    expect(source).toMatch(/v-for="[^"\n]+ in repurchase\.orders"/);
    expect(source).toMatch(/order\.status/);
    expect(source).toMatch(/@click="handleClaim\([^)]*order\.orderNo[^)]*\)"/);
    expect(source).toMatch(/@click="handleEarlyWithdraw\([^)]*order\.orderNo[^)]*\)"/);

    const claimHandler = source.slice(source.indexOf("async function handleClaim"), source.indexOf("async function handleEarlyWithdraw"));
    const earlyHandler = source.slice(source.indexOf("async function handleEarlyWithdraw"));
    expect(claimHandler).toContain("await uiConfirm({");
    expect(claimHandler).toContain("await repurchase.claim(orderNo)");
    expect(earlyHandler).toContain("await uiConfirm({");
    expect(earlyHandler).toContain("await repurchase.earlyWithdraw(orderNo)");
    expect(source).toMatch(/:disabled="[^"\n]*repurchase\.submitting/);
  });

  it("passes the selected event code from the event CTA into Lucky Spin", () => {
    const source = read("./events/events.vue");
    expect(source).toContain("luckySpin.openSheet(ev.id);");
  });

  it("opens buy as USDT to NEX and sell as NEX to USDT", () => {
    const source = read("./market/market.vue");
    expect(source).toContain('@click="goExchange(\'usdt2nex\')"');
    expect(source).toContain('@click="goExchange(\'nex2usdt\')"');
    expect(source).toContain("navTo(`/pages/me/wallet-exchange?direction=${direction}`)");
  });

  it("keeps onboarding's public online number backed by verified device data", () => {
    const source = read("./onboarding/intro.vue");

    expect(source).toContain("cfg.config.verifiedStats?.onlineDevices.value");
    expect(source).not.toContain("onlineDevicesOf(cfg.config.publicStats)");
    expect(source).toContain("const devices = ref(fleetNow())");
    expect(source).toContain("devices.value = fleetNow()");
    expect(source).not.toContain("devices.value = app.homeTruth?.onboarding.activeDevices");
  });

  it("does not replay a closed or switched wheel result, while retaining a retry idempotency key", () => {
    const source = read("../components/lucky-spin-sheet.vue");

    expect(source).toContain("const spinSubmitting = ref(false)");
    expect(source).toContain("if (spinSubmitting.value) return");
    expect(source).toContain("const key = pendingSpinKeys.get(eventCode) ?? createSpinIdempotencyKey()");
    expect(source).toContain("const result = await spin.spinRemote(eventCode, key)");
    expect(source).toContain("if (generation !== accountGeneration) return");
    expect(source).toContain("if (result.stale) return");
    expect(source).toContain("void doSpin(true)");

    const close = source.slice(source.indexOf("function handleClose"), source.indexOf("function onBackdrop"));
    expect(close).toContain("settleSpin()");
    expect(close).toContain("spin.closeSheet()");
    expect(source).toContain('watch(() => [spin.activeEventCode, spin.open]');
    expect(source).toContain("clearSettleTimer()");
  });
});
