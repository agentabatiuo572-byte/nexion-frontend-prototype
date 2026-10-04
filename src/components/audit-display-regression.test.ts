import { expect, test } from "vitest";
import security from "../pages/me/security.vue?raw";
import market from "./earn/market-board.vue?raw";
import notifications from "../pages/me/notifications.vue?raw";
const sources: Record<string, string> = { "../pages/me/security.vue": security, "./earn/market-board.vue": market,
  "../pages/me/notifications.vue": notifications };
const source = (path: string) => sources[path];

test("single-session action names that session, never the all-session action", () => {
  const view = source("../pages/me/security.vue");
  expect(view).toContain(':aria-label="`${t.security.sessionRevoke} · ${sessionDeviceLabel(s)}`"');
});
test("earnings rank is visible, absent best-for is not a placeholder row", () => {
  const view = source("./earn/market-board.vue");
  expect(view).toContain("#{{ d.rank }}");
  expect(view).not.toContain('d.bestFor ?? "—"');
});
test("full-page center exposes remaining pages and server notifications respect no-navigation", () => {
  expect(source("../pages/me/notifications.vue")).toContain('notifs.loadMoreRemote()');
  expect(source("../pages/me/notifications.vue")).not.toContain("const href = KIND_META[n.kind].href;");
});
