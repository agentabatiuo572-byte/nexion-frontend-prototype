// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("remote fleet refresh callsite safety", () => {
  it("allows sharing only on established read-only lifecycle paths", () => {
    const appLifecycle = source("../App.vue");
    expect(appLifecycle).toContain("syncRemoteTaskAssignments()");
    expect(appLifecycle).not.toContain("refreshRemoteFleet(undefined, { coalesce: true })");
    expect(source("../lib/e3-fleet-bootstrap.ts")).toContain("refreshRemoteFleet(undefined, { coalesce: true })");
    expect(source("./app.ts")).toContain("refreshRemoteFleet(request, { coalesce: true })");

    const earn = source("../pages/earn/earn.vue");
    expect(earn).toContain("app.refreshRemoteFleet(undefined, { coalesce: true })");
    expect(earn).toContain("function retryFleet() { void app.refreshRemoteFleet()");
  });

  it("keeps every existing mutation, recovery, and retry readback fresh by default", () => {
    const mutationOrRecoveryCallers = [
      "../pages/compute-share/download.vue",
      "../pages/me/wallet.vue",
      "../pages/me/wallet-withdraw.vue",
      "../pages/onboarding/connect.vue",
      "../pages/me/devices.vue",
      "../pages/store/checkout.vue",
      "../components/tradein-sheets.vue",
      "../components/earn/task-center.vue",
      "../pages/me/security.vue",
      "../pages/me/wallet-exchange.vue",
    ];

    for (const path of mutationOrRecoveryCallers) {
      expect(source(path)).toContain("refreshRemoteFleet(");
      expect(source(path)).not.toContain("refreshRemoteFleet(undefined, { coalesce: true })");
      expect(source(path)).not.toContain("refreshRemoteFleet(request, { coalesce: true })");
    }
  });
});
