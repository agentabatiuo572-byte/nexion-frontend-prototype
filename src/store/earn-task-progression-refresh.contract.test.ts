import { describe, expect, it } from "vitest";
import appSource from "./app.ts?raw";
import earnSource from "../pages/earn/earn.vue?raw";

describe("Earn server task progression refresh", () => {
  it("keeps every client environment read-only while refreshing task and earnings projections", () => {
    const start = appSource.indexOf("async function syncRemoteTaskAssignments()");
    const end = appSource.indexOf("// \u6743\u5a01\u4e0d\u53ef\u8fbe\u662f\u5e38\u6001\u8f93\u5165", start);
    const sync = appSource.slice(start, end);

    expect(sync).not.toContain("taskAssignmentApi.claim");
    expect(sync).not.toContain("taskAssignmentApi.complete");
    expect(sync).not.toContain("trustedTaskProof");
    expect(sync).not.toContain("taskMutationKey");
    expect(sync).toContain("readRemoteTaskAssignments(request)");
    expect(sync).toContain("refreshRemoteFleet(request, { coalesce: true })");
    expect(sync).toContain("refreshHomeTruth(request)");

    const fleetStart = appSource.indexOf("async function refreshRemoteFleet");
    const fleetEnd = appSource.indexOf("function bindAccount", fleetStart);
    const fleet = appSource.slice(fleetStart, fleetEnd);
    expect(fleet).toContain("readRemoteTaskAssignments(request)");
    expect(fleet).not.toContain("taskAssignmentApi.state()");
    expect(appSource).toContain("receivedAt + TASK_ASSIGNMENT_CACHE_MS");
  });

  it("refreshes both device tasks and today earnings whenever Earn becomes visible", () => {
    const showStart = earnSource.indexOf("onShow(() => {");
    const showEnd = earnSource.indexOf("});", showStart);
    const onShow = earnSource.slice(showStart, showEnd);

    expect(onShow).toContain("app.refreshRemoteFleet(undefined, { coalesce: true })");
    expect(onShow).toContain("app.refreshHomeTruth()");
  });
});
