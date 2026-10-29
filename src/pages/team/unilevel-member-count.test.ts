import { expect, test, vi } from "vitest";
import { directPage, eventFixture, snapshotFixture, policyFixture, flush, text, click } from "./direct-referral.test-support";
test("source filters keep each settlement as one paired event and preserve whole-period totals", async () => {
  const events = [eventFixture("purchase"), eventFixture("device", "direct_device_earning")];
  const page = await directPage({ api: { policy: vi.fn().mockResolvedValue(policyFixture()), snapshot: vi.fn().mockResolvedValue(snapshotFixture(events)) } }); await flush();
  expect(text(page.root)).toContain("$60.004000.00UVT");
  await click(page.root, "Friends' device earnings");
  expect(text(page.root)).toContain("Member device");
  expect(text(page.root)).toContain("$0.3020.00UVT");
});
test("empty list retains the invitation and rules exits", async () => {
  const page = await directPage({ api: { policy: vi.fn().mockResolvedValue(policyFixture()), snapshot: vi.fn().mockResolvedValue(snapshotFixture([])) } }); await flush();
  expect(text(page.root)).toContain("No matching rewards");
  await click(page.root, "Invite friends"); expect(page.navTo).toHaveBeenLastCalledWith("/pages/team/team");
  await click(page.root, "How it works"); expect(page.navTo).toHaveBeenLastCalledWith("/pages/team/unilevel-how");
});
