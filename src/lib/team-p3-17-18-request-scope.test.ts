import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireAmbassadorCommandKey } from "./ambassador-command-key";
import {
  ambassadorSubmitErrorRecovery,
  isCurrentTeamP31718Request,
  parseAmbassadorApplicationDraft,
  successfulAmbassadorApplicationState,
} from "./team-p3-17-18-request-scope";

const agentSource = (import.meta.glob("../pages/team/agent.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["../pages/team/agent.vue"] ?? "") as string;

const quotaSource = (import.meta.glob("../pages/team/quota.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["../pages/team/quota.vue"] ?? "") as string;

const today = new Date("2026-08-31T15:59:59.000Z"); // Asia/Shanghai: 2026-08-31.

describe("P3-17 ambassador application client contract", () => {
  it("keeps the Shanghai today through one-year-inclusive date boundary", () => {
    expect(parseAmbassadorApplicationDraft({ eventDate: "2026-08-31", city: "  Tokyo  ", budgetText: "100.000000", bucket: "venue" }, today))
      .toEqual({ eventDate: "2026-08-31", city: "Tokyo", budgetUsdt: 100, bucket: "venue" });
    expect(parseAmbassadorApplicationDraft({ eventDate: "2027-08-31", city: "Tokyo", budgetText: "10000", bucket: "dev" }, today))
      .not.toBeNull();
    expect(parseAmbassadorApplicationDraft({ eventDate: "2026-08-30", city: "Tokyo", budgetText: "100", bucket: "venue" }, today)).toBeNull();
    expect(parseAmbassadorApplicationDraft({ eventDate: "2027-09-01", city: "Tokyo", budgetText: "100", bucket: "venue" }, today)).toBeNull();
  });

  it("rejects invalid city controls, exact budget precision/range, and bucket before a request", () => {
    for (const draft of [
      { city: "T", budgetText: "100", bucket: "venue" },
      { city: "To\u0000kyo", budgetText: "100", bucket: "venue" },
      { city: "Tokyo", budgetText: "99.999999", bucket: "venue" },
      { city: "Tokyo", budgetText: "10000.000001", bucket: "venue" },
      { city: "Tokyo", budgetText: "100.0000001", bucket: "venue" },
      { city: "Tokyo", budgetText: "1e3", bucket: "venue" },
      { city: "Tokyo", budgetText: "100", bucket: "other" },
    ]) {
      expect(parseAmbassadorApplicationDraft({ eventDate: "2026-09-01", ...draft }, today)).toBeNull();
    }
  });

  it("uses LocalDate plusYears behavior for the Shanghai leap-day boundary", () => {
    const leapDayInShanghai = new Date("2024-02-29T00:00:00.000Z");
    expect(parseAmbassadorApplicationDraft({ eventDate: "2025-02-28", city: "Tokyo", budgetText: "100", bucket: "kol" }, leapDayInShanghai))
      .not.toBeNull();
    expect(parseAmbassadorApplicationDraft({ eventDate: "2025-03-01", city: "Tokyo", budgetText: "100", bucket: "kol" }, leapDayInShanghai))
      .toBeNull();
  });

  it("clears only the successful form while retaining the authoritative pending receipt", () => {
    const receipt = {
      applicationId: 73,
      status: "PENDING" as const,
      city: "Tokyo",
      eventDate: "2026-09-01",
      budgetUsdt: 100.25,
      bucket: "venue" as const,
      submittedAt: "2026-08-31T16:00:00.000Z",
      source: "server" as const,
      sourceEnvironment: "PRODUCTION" as const,
      runId: "",
    };
    expect(successfulAmbassadorApplicationState(receipt)).toEqual({
      receipt,
      form: { date: "", city: "", budgetText: "3000", bucketId: "", bucketTitle: "" },
    });
  });
});

describe("P3-17/P3-18 team page request fence", () => {
  const request = { accountKey: "user:7", accountEpoch: 4, generation: 9 };

  it("rejects same-key rebinds and page teardown", () => {
    expect(isCurrentTeamP31718Request(request, { mounted: true, ...request })).toBe(true);
    expect(isCurrentTeamP31718Request(request, { mounted: true, ...request, accountEpoch: 5 })).toBe(false);
    expect(isCurrentTeamP31718Request(request, { mounted: false, ...request })).toBe(false);
  });

  it("reuses the same business command key after a same-key account rebind", () => {
    const storage = new Map<string, unknown>();
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    });
    const payload = JSON.stringify(["2026-09-01", "Tokyo", 100, "venue"]);
    const beforeRebind = acquireAmbassadorCommandKey("user:7", payload);
    // Same account key, different binding epoch: page fencing changes, command identity must not.
    const afterRebind = acquireAmbassadorCommandKey("user:7", payload);

    expect(afterRebind).toBe(beforeRebind);
    expect(agentSource).toContain("acquireAmbassadorCommandKey(requestScope.accountKey, identity)");
    expect(agentSource).toContain("finishAmbassadorCommand(requestScope.accountKey, identity)");
    expect(agentSource).not.toContain("commandIdentity");
    vi.unstubAllGlobals();
  });

  it("does not treat a matching historical latest record as an unknown POST success", () => {
    const recovery = ambassadorSubmitErrorRecovery(false);

    expect(recovery.finishCommand).toBe(false);
    expect(recovery.toastSubmitSuccess).toBe(false);
    expect(recovery.refreshLatestForDisplay).toBe(true);
    const submitCatch = agentSource.slice(agentSource.indexOf("} catch (error)"), agentSource.indexOf("} finally"));
    expect(submitCatch).toContain("refreshLatest(requestScope)");
    expect(submitCatch).not.toContain("matches(input");
  });

  it("drops an earlier latest read before submit while keeping the submit scope for catch readback", () => {
    let generation = 9;
    const initialRead = { ...request, generation };
    generation += 1; // submit invalidates the initial page read before its POST begins.
    const submitScope = { ...request, generation };
    let renderedStatus = "PENDING";

    if (isCurrentTeamP31718Request(initialRead, { mounted: true, ...submitScope })) {
      renderedStatus = "NONE";
    }

    expect(renderedStatus).toBe("PENDING");
    expect(isCurrentTeamP31718Request(submitScope, { mounted: true, ...submitScope })).toBe(true);
    const identityOffset = agentSource.indexOf("const identity = payloadIdentity(input);");
    const invalidationOffset = agentSource.indexOf("invalidateAgentRequests();", identityOffset);
    const submitScopeOffset = agentSource.indexOf("const requestScope = captureAgentRequest();", invalidationOffset);
    expect(identityOffset).toBeGreaterThanOrEqual(0);
    expect(invalidationOffset).toBeGreaterThan(identityOffset);
    expect(submitScopeOffset).toBeGreaterThan(invalidationOffset);
    expect(agentSource).toContain("refreshLatest(requestScope)");
  });

  it("makes both pages reset account-bound state and gate late responses by the shared fence", () => {
    for (const source of [agentSource, quotaSource]) {
      expect(source).toContain("team-p3-17-18-request-scope");
      expect(source).toContain("app.accountBindingEpoch");
      // Order catalogue refreshes advance the commerce epoch, not the account
      // scope. Tying team finally blocks to it would leave loading/busy stuck.
      expect(source).not.toContain("captureRuntimeRevision");
      expect(source).toContain("onHide(() =>");
      expect(source).toContain("onUnload(() =>");
    }
    expect(agentSource).toContain("parseAmbassadorApplicationDraft");
    expect(agentSource).toContain("t.value.agent.invalidFormTitle");
    expect(agentSource).toContain("t.value.agent.invalidFormBody");
    expect(agentSource).not.toContain("toastMissingFields");
    expect(agentSource).toContain("resetAgentPageState");
    expect(agentSource).toContain("clearAgentFormState");
    expect(agentSource).toContain("acquireAmbassadorCommandKey(requestScope.accountKey, identity)");
    expect(quotaSource).toContain("resetQuotaPageState");
  });
});

afterEach(() => vi.unstubAllGlobals());
