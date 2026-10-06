import { expect, test, vi } from "vitest";
import { directPage, eventFixture, snapshotFixture, policyFixture, flush, text, click } from "./direct-referral.test-support";
test("source filters keep each settlement as one paired event and preserve whole-period totals", async () => {
  const events = [eventFixture("purchase"), eventFixture("device", "direct_device_earning")];
  const page = await directPage({ api: { policy: vi.fn().mockResolvedValue(policyFixture()), snapshot: vi.fn().mockResolvedValue(snapshotFixture(events)) } }); await flush();
  expect(text(page.root)).toContain("60"); expect(text(page.root)).toContain("4,000");
  await click(page.root, "Device earnings reward");
  expect(text(page.root)).toContain("Member device");
  expect(text(page.root)).toContain("0.3"); expect(text(page.root)).toContain("20");
});
test("empty list retains the invitation and rules exits", async () => {
  const page = await directPage({ api: { policy: vi.fn().mockResolvedValue(policyFixture()), snapshot: vi.fn().mockResolvedValue(snapshotFixture([])) } }); await flush();
  expect(text(page.root)).toContain("No matching rewards");
  await click(page.root, "Go to invitations"); expect(page.navTo).toHaveBeenLastCalledWith("/pages/team/team");
  await click(page.root, "Rules"); expect(page.navTo).toHaveBeenLastCalledWith("/pages/team/unilevel-how");
});
