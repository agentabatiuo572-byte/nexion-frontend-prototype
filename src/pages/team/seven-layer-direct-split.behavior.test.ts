import { expect, test, vi } from "vitest";
import { directPage, deferred, eventFixture, snapshotFixture, policyFixture, flush, text, click } from "./direct-referral.test-support";
import { dictionaries } from "./direct-referral.test-support";

const cutoff = "2026-10-05T00:00:00Z";
const purchase = (filter = "direct", events = [{ ...eventFixture("order"), layer: 1, orderId: "ORDER-1" }]) => ({
  period: "month", page: 1, pageSize: 20, totalRows: events.length, snapshotAt: cutoff, events,
  split: { direct: { amountUSDT: 60, amountNEX: 4000, count: 1 }, extended: { amountUSDT: 50, amountNEX: 100, count: 1 } },
  schemaVersion: 2, settlementMode: "SEVEN_V2", filter,
});

test("purchase totals use unilevel once; the device tab has its own server-filtered totals and cutoff", async () => {
  const unilevel = vi.fn().mockResolvedValue(purchase());
  const snapshot = vi.fn().mockResolvedValue({ ...snapshotFixture([eventFixture("device", "direct_device_earning")]),
    split: { purchase: { amountUSDT: 600, amountNEX: 40000, count: 10 }, deviceEarning: { amountUSDT: .33, amountNEX: 22, count: 1 } } });
  const page = await directPage({ api: { snapshot, policy: vi.fn().mockResolvedValue(policyFixture()) }, purchaseApi: { unilevel } });
  await flush();
  expect(snapshot).not.toHaveBeenCalled();
  expect(unilevel).toHaveBeenLastCalledWith("month", 1, 20, null, "direct");
  expect(text(page.root)).toContain("110USDT4,100NEX");
  await click(page.root, "Device earnings reward");
  expect(snapshot).toHaveBeenLastCalledWith("month", 1, 20, cutoff, "device_earning");
  expect(text(page.root)).toContain("0.33USDT22NEX");
  expect(text(page.root)).not.toContain("600USDT");
});

test("network selection queries before pagination and discards a late direct response", async () => {
  const late = deferred<ReturnType<typeof purchase>>();
  const unilevel = vi.fn().mockReturnValueOnce(late.promise).mockResolvedValueOnce(purchase("extended", [{ ...eventFixture("deep"), layer: 3, orderId: "ORDER-3" }]));
  const page = await directPage({ purchaseApi: { unilevel } });
  await click(page.root, "Network purchase");
  expect(unilevel).toHaveBeenLastCalledWith("month", 1, 20, null, "extended");
  expect(text(page.root)).toContain("Member deep");
  late.resolve(purchase()); await flush();
  expect(text(page.root)).not.toContain("Member order");
});
test.each(["en", "zh", "vi"] as const)("%s renders a network group's different currency states without hiding the valid currency", async locale => {
  const event = { ...eventFixture("partial"), layer: 2, orderId: "ORDER-PARTIAL", status: "reversed", statusUSDT: "reversed", statusNEX: "unlocked" };
  const unilevel = vi.fn().mockResolvedValue(purchase("extended", [event]));
  const page = await directPage({ locale, purchaseApi: { unilevel } }); await flush();
  await click(page.root, dictionaries[locale].directReferral.networkPurchase);
  expect(text(page.root)).toContain(`USDT ${dictionaries[locale].commissions.reversedTag} · NEX ${dictionaries[locale].commissions.readyTag}`);
  expect(text(page.root)).toContain(locale === "vi" ? "4.000 NEX" : "4,000 NEX");
});

test("waiting price is visible and a stale environment read cannot replace a fresh snapshot", async () => {
  const late = deferred<ReturnType<typeof purchase>>();
  const unilevel = vi.fn().mockReturnValueOnce(late.promise).mockResolvedValueOnce(purchase("direct", [{ ...eventFixture("pending"), layer: 1,
    orderId: "ORDER-PENDING", status: "waiting_calculation", amountUSDT: 0, amountNEX: 0 }]));
  const page = await directPage({ purchaseApi: { unilevel } });
  page.revision(); await flush();
  expect(text(page.root)).toContain("Awaiting calculation");
  late.resolve(purchase()); await flush();
  expect(text(page.root)).not.toContain("Member order");
});

test.each(["TEAM_SCHEMA_UPDATE_REQUIRED", "TEAM_SCHEMA_VERSION_UNSUPPORTED", "DIRECT_REFERRAL_SCHEMA_VERSION_UNSUPPORTED"])("%s gives an ordinary update hint without printing protocol codes", async message => {
  const unilevel = vi.fn().mockRejectedValue(new Error(message));
  const page = await directPage({ purchaseApi: { unilevel } }); await flush();
  expect(text(page.root)).toContain("Update the app to continue");
  expect(text(page.root)).not.toContain("TEAM_SCHEMA_UPDATE_REQUIRED");
});
test.each(["en", "zh", "vi"] as const)("%s explains an unconfigured purchase block while preserving device rules", async locale => {
  const policy = { ...policyFixture(), schemaVersion: 2, settlementMode: "SEVEN_V2", policySchemaVersion: 1, purchaseSplitConfigured: false,
    purchaseSplit: { enabled: false, usdtSharePct: 50 }, sevenLayerReference: { revision: 0, baseRatePct: null, coolingDays: null, legacyNexPerUsd: null } };
  const page = await directPage({ locale, api: { snapshot: vi.fn().mockResolvedValue(snapshotFixture()), policy: vi.fn().mockResolvedValue(policy) } });
  await flush();
  expect(text(page.root)).not.toContain("10%");
  await click(page.root, locale === "zh" ? "设备收益分成" : locale === "vi" ? "Thưởng thu nhập thiết bị" : "Device earnings reward");
  expect(text(page.root)).toContain("70%");
});
