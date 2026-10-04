// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./app.ts", import.meta.url), "utf8");
const ledgerSource = readFileSync(new URL("../components/home/earnings-ledger-card.vue", import.meta.url), "utf8");
const gridSource = readFileSync(new URL("../components/home/on-grid-section.vue", import.meta.url), "utf8");
const marketSource = readFileSync(new URL("../components/home/market-board-card.vue", import.meta.url), "utf8");
const taskCenterSource = readFileSync(new URL("../components/earn/task-center.vue", import.meta.url), "utf8");

describe("App Home authority refresh isolation", () => {
  it("refreshes Home independently with account fencing and single-flight reuse", () => {
    expect(appSource).toContain("function refreshHomeTruth(request: RemoteAccountRequest");
    expect(appSource).toContain("if (homeTruthRefreshInFlight?.key === key) return homeTruthRefreshInFlight.request;");
    expect(appSource).toContain("if (!remoteAccountEpoch.isCurrent(request)) throw new Error(\"REMOTE_ACCOUNT_CHANGED\")");
  });

  it("keeps Home independent from fleet and task-assignment failures", () => {
    const fleetStart = appSource.indexOf("async function refreshRemoteFleet(");
    const fleetEnd = appSource.indexOf("function bindAccount(", fleetStart);
    const fleetRefresh = appSource.slice(fleetStart, fleetEnd);
    expect(fleetRefresh).toContain("Promise.allSettled([");
    expect(fleetRefresh).toContain("if (!remoteAccountEpoch.isCurrent(request)) return false");
    expect(fleetRefresh).toContain("refreshSequence = ++remoteFleetRefreshSequence");
    expect(fleetRefresh).toContain("refreshSequence !== remoteFleetRefreshSequence");
    expect(fleetRefresh).not.toContain("appHomeApi.fetch()");
    expect(fleetRefresh).not.toContain("homeTruth.value = null");
    expect(fleetRefresh).not.toContain("homeTruthStatus.value = \"error\"");
    expect(fleetRefresh).toContain("remoteAssignmentStatus.value = \"error\"");
    expect(fleetRefresh).toContain("lastConfirmedAssignments?.request.accountKey === request.accountKey");
    expect(fleetRefresh).toContain("applyRemoteAssignments(canonicalDevices, confirmedAssignments)");
  });

  it("coalesces only explicit lifecycle reads within one account and runtime scope", () => {
    const fleetStart = appSource.indexOf("async function refreshRemoteFleet(");
    const fleetEnd = appSource.indexOf("function bindAccount(", fleetStart);
    const fleetRefresh = appSource.slice(fleetStart, fleetEnd);

    expect(fleetRefresh).toContain("captureRuntimeRevision()");
    expect(fleetRefresh).toContain("accountEpoch: request.epoch");
    expect(fleetRefresh).toContain("mode: expectedApiEnvironment");
    expect(fleetRefresh).toContain("runId: runScope.runId");
    expect(fleetRefresh).toContain("remoteFleetRefreshCoordinator.refresh(scope");
    expect(appSource).toContain("refreshRemoteFleet(request, { coalesce: true })");
    expect(fleetRefresh).toContain("isCurrentRuntimeRevision(runScope)");
    expect(fleetRefresh).toContain("remoteFleetRefreshCoordinator.isCurrent(lease)");
    expect(appSource).toContain("function invalidateRemoteFleet(request?: RemoteAccountRequest)");
    expect(appSource).toContain("invalidateRemoteFleet(receiptScope);");
    expect(appSource).toContain("invalidateRemoteFleet(fleetRequest);");
  });

  it("gives every Home retry action the narrow Home-only refresh", () => {
    for (const source of [ledgerSource, gridSource, marketSource]) {
      expect(source).toContain("app.refreshHomeTruth()");
    }
  });

  it("renders assignment failures as retryable unavailable state instead of an empty history", () => {
    expect(taskCenterSource).toContain("app.remoteAssignmentStatus === 'error'");
    expect(taskCenterSource).toContain("@click=\"retryAssignments\"");
    expect(taskCenterSource).toContain("v-else-if=\"allRecent.length === 0\"");
  });

  it("renders grid clients only from the Java Home projection", () => {
    expect(gridSource).not.toContain("Pocket Studios");
    expect(gridSource).not.toContain("Helix Labs");
    expect(gridSource).not.toContain("Echo Earbuds");
    expect(gridSource).not.toContain("const GRID_CLIENTS");
    expect(gridSource).toContain("app.homeTruth?.onGrid.clients ?? []");
  });

  it("uses the company name as the grid row heading and hides the technical client id", () => {
    expect(gridSource).toContain("companyInitial(c.name)");
    expect(gridSource).toContain('{{ c.name ?? "—" }}');
    expect(gridSource).toContain('{{ c.model ?? "—" }}');
    expect(gridSource).not.toContain("{{ c.id }}</text>");
  });
});
