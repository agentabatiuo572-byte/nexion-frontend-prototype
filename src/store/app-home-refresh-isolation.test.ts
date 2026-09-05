// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./app.ts", import.meta.url), "utf8");
const ledgerSource = readFileSync(new URL("../components/home/earnings-ledger-card.vue", import.meta.url), "utf8");
const gridSource = readFileSync(new URL("../components/home/on-grid-section.vue", import.meta.url), "utf8");
const marketSource = readFileSync(new URL("../components/home/market-board-card.vue", import.meta.url), "utf8");

describe("App Home authority refresh isolation", () => {
  it("refreshes Home independently with account fencing and single-flight reuse", () => {
    expect(appSource).toContain("function refreshHomeTruth(request: RemoteAccountRequest");
    expect(appSource).toContain("if (homeTruthRefreshInFlight?.key === key) return homeTruthRefreshInFlight.request;");
    expect(appSource).toContain("if (!remoteAccountEpoch.isCurrent(request)) throw new Error(\"REMOTE_ACCOUNT_CHANGED\")");
  });

  it("starts Home independently before fleet and task-assignment reads", () => {
    const homeStart = appSource.indexOf("const homeRefresh = refreshHomeTruth(request);");
    const fleetStart = appSource.indexOf("Promise.all([deviceE3Api.fleet(), taskAssignmentApi.state()])", homeStart);
    expect(homeStart).toBeGreaterThan(-1);
    expect(fleetStart).toBeGreaterThan(homeStart);
  });

  it("gives every Home retry action the narrow Home-only refresh", () => {
    for (const source of [ledgerSource, gridSource, marketSource]) {
      expect(source).toContain("app.refreshHomeTruth()");
    }
  });
});
