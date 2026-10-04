// @ts-expect-error Node is intentionally excluded from the App tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

describe("server state presentation regressions", () => {
  it("keeps history sync failures separate from the product unavailable screen", () => {
    const page = source("../pages/me/wallet-repurchase.vue");
    expect(page).toContain('repurchase.historyLoading || repurchase.historyError');
    expect(page).toContain('@click="repurchase.refreshHistory()"');
    expect(page).not.toMatch(/const remoteReady = computed\([^;]+repurchase\.history/);
  });
  it("does not render a child-page unread dot without unread notifications", () => {
    expect(source("./app-chassis.vue")).toContain('v-if="unread > 0" class="nx-nav-belldot"');
  });
  it("places the idle/loading branch ahead of the task-history empty state", () => {
    const template = source("./earn/task-center.vue");
    expect(template).toContain("app.remoteAssignmentStatus === 'idle'");
    expect(template).toContain("app.remoteAssignmentStatus === 'loading' && !app.remoteAssignmentHasSnapshot");
    expect(template.indexOf("t.taskHistory.loading")).toBeGreaterThan(0);
    expect(template.indexOf("t.taskHistory.loading")).toBeLessThan(template.indexOf("t.taskHistory.historyEmpty"));
  });
  it.each(["./events/events-card.vue", "./events/events-featured-hero.vue"])("does not offer claims outside an ongoing event in %s", (path) => {
    expect(source(path)).toMatch(/const showClaim = computed\([^;]+props\.ev\.status === "ongoing"/);
  });
});
