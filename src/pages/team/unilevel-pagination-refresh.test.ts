import { expect, test, vi } from "vitest";
import { directPage, deferred, eventFixture, snapshotFixture, policyFixture, flush, text, click } from "./direct-referral.test-support";
test("pagination uses the same snapshot, retries failure and rejects old account responses", async () => {
  const first = { ...snapshotFixture(), totalRows: 21 };
  const late = deferred<ReturnType<typeof snapshotFixture>>();
  const api = { policy: vi.fn().mockResolvedValue(policyFixture()), snapshot: vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(new Error("offline")).mockReturnValueOnce(late.promise).mockResolvedValueOnce(snapshotFixture([eventFixture("new-account")])) };
  const page = await directPage({ api }); await flush();
  await click(page.root, "View more"); expect(text(page.root)).toContain("Retry");
  await click(page.root, "Retry");
  expect(api.snapshot).toHaveBeenLastCalledWith("month", 2, 20, first.snapshotAt);
  page.auth.accountId = "user:608"; page.app.accountBindingEpoch++; page.app.accountKey = "user:608"; await flush();
  late.resolve({ ...snapshotFixture([eventFixture("old-account")]), page: 2 }); await flush();
  expect(text(page.root)).toContain("Member new-account"); expect(text(page.root)).not.toContain("Member old-account");
});
test("period switches discard an older first page and retain selection on retry", async () => {
  const old = deferred<ReturnType<typeof snapshotFixture>>();
  const api = { policy: vi.fn().mockResolvedValue(policyFixture()), snapshot: vi.fn().mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ...snapshotFixture([eventFixture("today")]), period: "today" }) };
  const page = await directPage({ api }); await click(page.root, "Today");
  old.resolve(snapshotFixture([eventFixture("old-month")])); await flush();
  expect(text(page.root)).not.toContain("Member old-month"); expect(text(page.root)).toContain("Retry");
  await click(page.root, "Retry"); expect(api.snapshot).toHaveBeenLastCalledWith("today"); expect(text(page.root)).toContain("Member today");
});
test("paired recovery amounts and every state remain readable", async () => {
  const events = ["cooling", "unlocked", "frozen", "reversed", "rejected", "recovery_pending"].map((status, i) => ({ ...eventFixture(String(i)), status, recoveryPendingUSDT: 2, recoveryPendingNEX: 3 }));
  const page = await directPage({ api: { policy: vi.fn().mockResolvedValue(policyFixture()), snapshot: vi.fn().mockResolvedValue(snapshotFixture(events)) } }); await flush();
  for (const status of ["cooling", "Ready", "Frozen", "Reversed", "Rejected", "Recovery pending"]) expect(text(page.root)).toContain(status);
  expect(text(page.root)).toContain("2 USDT + 3 NEX");
});
