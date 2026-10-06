import { expect, test, vi } from "vitest";
import { directPage, dictionaries, flush, text, policyFixture, snapshotFixture, click } from "./direct-referral.test-support";
test.each(["en", "zh", "vi"] as const)("renders independent rates, split and waiting policy in %s", async locale => {
  const page = await directPage({ locale }); await flush(); const copy = dictionaries[locale].directReferral;
  expect(text(page.root)).toContain(copy.purchase); expect(text(page.root)).toContain(copy.deviceEarning);
  expect(text(page.root)).toContain(locale === "vi" ? "12,3456%" : "12.3456%"); expect(text(page.root)).toContain("60%"); expect(text(page.root)).toContain("40%");
  await click(page.root, copy.deviceEarning);
  expect(text(page.root)).toContain("70%"); expect(text(page.root)).toContain("30%"); expect(text(page.root)).toContain(copy.platformPays);
});
test("price outage keeps historical paired amounts and explains new accrual is pending", async () => {
  const p = { ...policyFixture(), nexUsdtPrice: null };
  const page = await directPage({ api: { policy: vi.fn().mockResolvedValue(p), snapshot: vi.fn().mockResolvedValue(snapshotFixture()) } }); await flush();
  expect(text(page.root)).toContain("price is temporarily unavailable"); expect(text(page.root)).toContain("4,000 NEX");
});
