import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LegalTermsCurrent } from "@/api/legal-terms-api";

const state = vi.hoisted(() => ({
  session: {
    accessToken: "token-a",
    user: { userId: 7 },
  } as { accessToken: string; user: { userId: number } } | null,
  revision: { epoch: 1, runId: "" },
  sessionRevision: 1,
  refreshContinuation: false,
  locale: "en",
  loading: false,
  current: vi.fn<() => Promise<LegalTermsCurrent>>(),
  acknowledge: vi.fn<() => Promise<LegalTermsCurrent>>(),
  retryProfileLocale: vi.fn<() => void>(),
}));

vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  sessionVault: { read: () => state.session, revision: () => state.sessionRevision, isRefreshContinuation: () => state.refreshContinuation },
  legalTermsApi: { current: () => state.current(), acknowledge: () => state.acknowledge() },
}));

vi.mock("./locale-profile-sync-runtime", () => ({
  retryCurrentProfileLocale: () => state.retryProfileLocale(),
}));

vi.mock("@/store/locale", () => ({
  useLocaleStore: () => ({ code: state.locale }),
}));
vi.mock("@/i18n/use-t", () => ({ getT: () => ({ terms: { navTitle: "服务条款", loadFailed: "暂时无法核验，请重试" }, ui: { retry: "重试" } }) }));

vi.mock("@/api/order-api", () => ({
  captureRuntimeRevision: () => state.revision,
}));

const snapshot = (acknowledged: boolean): LegalTermsCurrent => ({
  source: "server",
  sourceEnvironment: "PRODUCTION",
  runId: "",
  requestedLocale: "en",
  resolvedLocale: "en",
  requestedJurisdiction: "GLOBAL",
  resolvedJurisdiction: "GLOBAL",
  provenance: "exact:en/GLOBAL",
  version: "v4",
  effectiveAt: "2026-08-30T00:00:00",
  title: "Terms",
  summary: "Summary",
  sections: [],
  acknowledged,
  acknowledgedAt: acknowledged ? "2026-08-30T00:00:01" : null,
});

async function loadRuntime() {
  vi.resetModules();
  return import("./legal-terms-gate-runtime");
}

async function settleGate(): Promise<void> {
  if (vi.isFakeTimers()) { await vi.advanceTimersByTimeAsync(0); return; }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("registration-only consent", () => {
  beforeEach(() => {
    state.session = { accessToken: "token-a", user: { userId: 7 } };
    state.sessionRevision = 1; state.refreshContinuation = false;
    state.current.mockReset(); state.acknowledge.mockReset();
    vi.stubGlobal("uni", { showLoading: vi.fn(), hideLoading: vi.fn(), reLaunch: vi.fn() });
  });

  it("never reads terms, masks input or redirects on repeated routes, language changes and resume", async () => {
    const runtime = await loadRuntime();
    state.current.mockRejectedValue(new Error("unavailable terms service"));
    for (const locale of ["en", "zh", "vi"]) {
      state.locale = locale;
      for (const page of ["index/index", "earn/earn", "store/store", "team/team", "me/me", "index/index"]) {
        await runtime.scheduleLegalTermsGate(`/pages/${page}`);
        expect(runtime.enforcePendingLegalTermsGate(`/pages/${page}`)).toBe(false);
        expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
      }
    }
    expect(state.current).not.toHaveBeenCalled();
    expect(state.acknowledge).not.toHaveBeenCalled();
    expect(uni.showLoading).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it("starts login work once without waiting for agreement state", async () => {
    const runtime = await loadRuntime(); const resume = vi.fn().mockResolvedValue(true);
    runtime.afterLegalTermsAcknowledged(resume); await settleGate();
    expect(resume).toHaveBeenCalledOnce();
    runtime.recordLegalTermsAcknowledged(snapshot(true)); await settleGate();
    expect(resume).toHaveBeenCalledOnce(); expect(state.current).not.toHaveBeenCalled();
  });

  it.each(["logout", "another-account", "same-account-new-login"])("drops queued login work after %s", async change => {
    const runtime = await loadRuntime(); const resume = vi.fn();
    runtime.afterLegalTermsAcknowledged(resume);
    state.sessionRevision++;
    state.session = change === "logout" ? null : {accessToken:"new-token",user:{userId:change === "another-account" ? 8 : 7}};
    await settleGate(); expect(resume).not.toHaveBeenCalled();
  });
});
