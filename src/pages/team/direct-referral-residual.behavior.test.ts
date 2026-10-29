import { networkReauditCopy } from "@/i18n/network-reaudit";
import {expect, test, vi} from "vitest";
import {createDirectReferralApi} from "@/api/direct-referral-api";
import type {ApiClient} from "@/api/api-client";
import {directPage, dictionaries, deferred, eventFixture, snapshotFixture, policyFixture, flush, text, click, all} from "./direct-referral.test-support";

test("a failed current period can retry while the previous period is still pending", async () => {
  const old = deferred<ReturnType<typeof snapshotFixture>>();
  const api = {policy: vi.fn().mockResolvedValue(policyFixture()), snapshot: vi.fn().mockReturnValueOnce(old.promise)
    .mockRejectedValueOnce(new Error("today offline")).mockResolvedValueOnce({...snapshotFixture([eventFixture("current")]), period: "today"})};
  const page = await directPage({api}); await click(page.root, "Today");
  expect(text(page.root)).toContain("Retry");
  await click(page.root, "Retry"); expect(api.snapshot).toHaveBeenCalledTimes(3);
  expect(text(page.root)).toContain("Member current");
  old.resolve(snapshotFixture([eventFixture("old-month")])); await flush();
  expect(text(page.root)).not.toContain("Member old-month");
});

test.each(["en", "zh", "vi"] as const)("%s hides policy metadata while keeping device identity and settlement details", async locale => {
  const event = {...eventFixture("settlement-7", "direct_device_earning"), sourceDeviceId: "DEVICE-REAL-7", status: "recovery_pending", recoveryPendingUSDT: 2, recoveryPendingNEX: 3};
  const groups = {...snapshotFixture([event]), split: {purchase: {amountUSDT: 0, amountNEX: 0, count: 0}, deviceEarning: {amountUSDT: 0, amountNEX: 0, count: 1}}};
  const page = await directPage({locale, api: {policy: vi.fn().mockResolvedValue({...policyFixture(), effectiveAt: '2099-12-31T23:59:59Z'}), snapshot: vi.fn().mockResolvedValue(groups)}}); await flush();
  await click(page.root, dictionaries[locale].directReferral.deviceEarning);
  expect(text(page.root)).not.toContain("DEVICE-REAL-7");
  await click(page.root,networkReauditCopy(locale).recordDetails);
  all(page.root).find(n=>n.props.role === "button" && text(n).startsWith(networkReauditCopy(locale).settlementDetails))!.props.onClick(); await flush();
  expect(text(page.root)).toContain("DEVICE-REAL-7");
  expect(text(page.root)).toContain("settlement-7"); expect(text(page.root)).not.toContain("2099-12-31T23:59:59Z");
  const copy = dictionaries[locale].directReferral as unknown as Record<string, string>;
  expect(text(page.root)).not.toMatch(/政策版本|Policy version|Phiên bản chính sách|生效时间（UTC）|Effective from \(UTC\)|Có hiệu lực từ \(UTC\)/);
  expect(text(page.root)).toContain(`1 ${copy.settlementGroups}`); expect(text(page.root)).toContain(copy.netHint);
});

test("production page reads a real adapter's terminal groups while unconfigured/null-price policy remains independently visible", async () => {
  const proof = {source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true};
  const pending = {...eventFixture("canonical-group", "direct_device_earning"), status: "recovery_pending", recoveryPendingUSDT: 2, recoveryPendingNEX: 3};
  const groups = {...proof, ...snapshotFixture([pending]), split: {purchase: {amountUSDT: 0, amountNEX: 0, count: 0}, deviceEarning: {amountUSDT: 0, amountNEX: 0, count: 1}}};
  const rules = {...proof, ...policyFixture(), configured: false, policyVersion: 0, effectiveAt: null, nexUsdtPrice: null,
    purchase: {enabled: false, totalRatePct: 0, usdtSharePct: 50, coolingDays: 0}, deviceEarning: {enabled: false, totalRatePct: 0, usdtSharePct: 50, coolingDays: 0}};
  const request = vi.fn((query: {path: string}) => Promise.resolve(query.path.includes("/config/") ? rules : groups));
  const page = await directPage({api: createDirectReferralApi({request} as unknown as ApiClient)}); await flush();
  await click(page.root, dictionaries.en.directReferral.deviceEarning);
  expect(text(page.root)).toContain(dictionaries.en.directReferral.unconfigured);
  await click(page.root,networkReauditCopy("en").recordDetails);
  expect(text(page.root)).toContain("canonical-group");
  expect(text(page.root)).toContain("1 record(s)"); expect(text(page.root)).toContain("$2.00 + 3.00 UVT");
  expect(request.mock.calls.map(call => call[0].path)).toEqual(expect.arrayContaining([
    "/api/app/team/insights/direct-referral?period=month&page=1&pageSize=20&snapshotAt=2026-10-05T00%3A00%3A00Z&schemaVersion=2&kind=device_earning", "/api/config/commission/direct-referral?schemaVersion=2"]));
});
