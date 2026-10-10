import { expect, test, vi } from "vitest";
import { directPage, deferred, flush, text, click, policyFixture, snapshotFixture } from "./direct-referral.test-support";
test("loads direct rules independently and keeps history when policy is unavailable", async () => {
  const rules = deferred<ReturnType<typeof policyFixture>>();
  const api = { policy: vi.fn().mockReturnValueOnce(rules.promise), snapshot: vi.fn().mockResolvedValue(snapshotFixture()) };
  const page = await directPage({ api }); await flush();
  expect(text(page.root)).toContain("Member one"); expect(text(page.root)).toContain("Loading");
  rules.reject(new Error("policy failed")); await flush();
  expect(text(page.root)).toContain("Reward rules could not be loaded"); expect(text(page.root)).toContain("4,000 NEX");
  api.policy.mockResolvedValueOnce(policyFixture());
  await click(page.root, "Retry"); expect(text(page.root)).toContain("12.3456%");
});
test("unconfigured and disabled policies never manufacture old royalty values", async () => {
  const p = policyFixture(); p.configured = false; p.purchase.enabled = false; p.deviceEarning.enabled = false;
  const page = await directPage({ api: { policy: vi.fn().mockResolvedValue(p), snapshot: vi.fn().mockResolvedValue(snapshotFixture([])) } }); await flush();
  expect(text(page.root)).toContain("reward rules are unavailable"); expect(text(page.root)).not.toContain("10%"); expect(text(page.root)).not.toContain("L7");
});
