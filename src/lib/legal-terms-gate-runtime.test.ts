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

describe("legal terms runtime gate", () => {
  it("retains unfinished login work when another legal verification starts in flight", async () => {
    const runtime = await loadRuntime();
    let resolve!: (done: boolean) => void;
    const resumed = vi.fn().mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done; }))
      .mockResolvedValueOnce(true);
    runtime.afterLegalTermsAcknowledged(resumed);
    runtime.recordLegalTermsAcknowledged(snapshot(true));
    await settleGate();
    state.current.mockResolvedValue(snapshot(false));
    await runtime.scheduleLegalTermsGate("/pages/index/index");
    resolve(false);
    await settleGate();
    runtime.recordLegalTermsAcknowledged(snapshot(true));
    await settleGate();
    expect(resumed).toHaveBeenCalledTimes(2);
  });
  it("resumes login once after Terms acknowledgement and fences a later login", async () => {
    const runtime = await loadRuntime();
    const resumed = vi.fn(async () => {});
    runtime.afterLegalTermsAcknowledged(resumed);
    state.current.mockResolvedValue(snapshot(false));
    await runtime.scheduleLegalTermsGate("/pages/index/index");
    expect(resumed).not.toHaveBeenCalled();
    runtime.recordLegalTermsAcknowledged(snapshot(true));
    await settleGate();
    runtime.recordLegalTermsAcknowledged(snapshot(true));
    await settleGate();
    expect(resumed).toHaveBeenCalledTimes(1);
    runtime.afterLegalTermsAcknowledged(resumed);
    state.session = { accessToken: "another-login", user: { userId: 7 } };
    state.sessionRevision++;
    runtime.recordLegalTermsAcknowledged(snapshot(true));
    await settleGate();
    expect(resumed).toHaveBeenCalledTimes(1);
  });
  it("retries a verification failure instead of treating it as a known unacknowledged version", async () => {
    state.current.mockRejectedValueOnce(new Error("network"));
    const runtime=await loadRuntime();await runtime.scheduleLegalTermsGate("/pages/me/me");
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    state.current.mockResolvedValue(snapshot(true));await runtime.scheduleLegalTermsGate("/pages/store/store");
    expect(state.current).toHaveBeenCalledTimes(2);expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
  });
  it("retains an unresolved obligation across only token rotation until a fresh acknowledgement", async () => {
    state.current.mockResolvedValue(snapshot(false));const runtime=await loadRuntime();
    await runtime.scheduleLegalTermsGate("/pages/me/me");
    state.session={accessToken:"rotated",user:{userId:7}};state.sessionRevision++;state.refreshContinuation=true;
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    runtime.recordLegalTermsAcknowledged(snapshot(true));expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
  });
  beforeEach(() => {
    vi.useRealTimers();
    state.session = { accessToken: "token-a", user: { userId: 7 } };
    state.revision = { epoch: 1, runId: "" };
    state.sessionRevision = 1;
    state.refreshContinuation = false;
    state.locale = "en";
    state.loading = false;
    state.current.mockReset();
    state.acknowledge.mockReset();
    state.retryProfileLocale.mockReset();
    vi.stubGlobal("uni", {
      reLaunch: vi.fn(),
      showLoading: vi.fn(() => { state.loading = true; }),
      hideLoading: vi.fn(() => { state.loading = false; }),
      showModal: vi.fn(),
    });
  });

  it.each([true, false])("retries one transient terms read while gated; next version acknowledged=%s", async (acknowledged) => {
    const runtime = await loadRuntime();
    const { ApiError } = await import("@/api/errors");
    state.current.mockResolvedValueOnce(snapshot(true));
    await runtime.scheduleLegalTermsGate("/pages/me/me");
    state.current.mockRejectedValueOnce(new ApiError({ kind: "network", message: "REQUEST_TIMEOUT", retryable: true }))
      .mockResolvedValueOnce({ ...snapshot(acknowledged), version: "v5", acknowledgedAt: acknowledged ? "2026-08-30T00:00:01" : null });
    const check = runtime.scheduleLegalTermsGate("/pages/support/tickets");
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    await check;
    expect(state.current).toHaveBeenCalledTimes(3);
    expect(uni.showModal).not.toHaveBeenCalled();
    expect(uni.reLaunch).toHaveBeenCalledTimes(acknowledged ? 0 : 1);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(!acknowledged);
  });

  it.each([true, false])("recovers a real HTML 429 on an ordinary Earn read; next version acknowledged=%s", async (acknowledged) => {
    vi.useFakeTimers();
    state.locale = "zh";
    const runtime = await loadRuntime();
    const { createApiClient } = await import("@/api/api-client");
    const { createSessionVault } = await import("@/api/session-vault");
    const { createLegalTermsApi } = await import("@/api/legal-terms-api");
    const vault = createSessionVault();
    vault.save({ accessToken: "token-a", refreshToken: "refresh-a", tokenType: "Bearer",
      user: { userId: 7, countryCode: "+86", phone: "13800000007", nickname: "Fixture", onboardingComplete: true } });
    const acknowledgedV6 = { ...snapshot(true), requestedLocale: "zh", resolvedLocale: "zh", version: "v6",
      sections: [{ key: "fixture", title: "Fixture", body: "Fixture only", sortOrder: 0 }] };
    const next = { ...acknowledgedV6, acknowledged, version: acknowledged ? "v6" : "v7",
      acknowledgedAt: acknowledged ? acknowledgedV6.acknowledgedAt : null };
    const request = vi.fn().mockResolvedValueOnce({ status: 200, data: { code: 0, message: "success", data: acknowledgedV6 }, headers: {} })
      .mockResolvedValueOnce({ status: 429, data: "<html><title>429 Too Many Requests</title></html>", headers: { "content-type": "text/html" } })
      .mockResolvedValueOnce({ status: 200, data: { code: 0, message: "success", data: next }, headers: {} });
    const api = createLegalTermsApi(createApiClient({ baseUrl: "https://fixture.invalid", vault, transport: { request } }));
    state.current.mockImplementation(() => api.current("zh", "GLOBAL", true));
    await runtime.scheduleLegalTermsGate("/pages/me/me");
    const read = runtime.scheduleLegalTermsGate("/pages/earn/earn");
    await settleGate();
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(runtime.enforcePendingLegalTermsGate("/pages/earn/earn")).toBe(true);
    expect(uni.showLoading).toHaveBeenLastCalledWith({ title: "", mask: true });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(request).toHaveBeenCalledTimes(2);
    expect(uni.showModal).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await read;
    expect(request).toHaveBeenCalledTimes(3);
    for (const [sent] of request.mock.calls) {
      expect(sent).toMatchObject({ method: "GET", headers: { Authorization: "Bearer token-a" } });
      expect(sent.url).toContain("/api/legal/terms/current?locale=zh&jurisdiction=GLOBAL");
    }
    expect(state.acknowledge).not.toHaveBeenCalled();
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(!acknowledged);
    expect(uni.showModal).not.toHaveBeenCalled();
    expect(uni.reLaunch).toHaveBeenCalledTimes(acknowledged ? 0 : 1);
  });

  it("bounds repeated 429 reads and keeps the existing explicit retry without inventing acknowledgement", async () => {
    vi.useFakeTimers();
    const runtime = await loadRuntime();
    const { ApiError } = await import("@/api/errors");
    state.current.mockResolvedValueOnce(snapshot(true));
    await runtime.scheduleLegalTermsGate("/pages/me/me");
    state.current.mockRejectedValue(new ApiError({ kind: "http", status: 429, message: "HTTP_429" }));
    const read = runtime.scheduleLegalTermsGate("/pages/earn/earn");
    await settleGate();
    await vi.advanceTimersByTimeAsync(5_000);
    await read;
    expect(state.current).toHaveBeenCalledTimes(3);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(uni.showModal).toHaveBeenCalledOnce();
    expect(uni.reLaunch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.current).toHaveBeenCalledTimes(3);
    state.current.mockResolvedValueOnce(snapshot(true));
    vi.mocked(uni.showModal).mock.calls[0][0]!.success?.({ confirm: true, cancel: false, errMsg: "showModal:ok" });
    await settleGate();
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
    expect(state.current).toHaveBeenCalledTimes(4);
    expect(state.acknowledge).not.toHaveBeenCalled();
  });

  it.each(["account", "relogin", "locale"])("does not let a 429 backoff cross a new %s fence or release its gate", async (change) => {
    vi.useFakeTimers();
    const runtime = await loadRuntime();
    const { ApiError } = await import("@/api/errors");
    state.current.mockResolvedValueOnce(snapshot(true));
    await runtime.scheduleLegalTermsGate("/pages/me/me");
    let resolveNew!: (value: LegalTermsCurrent) => void;
    state.current.mockRejectedValueOnce(new ApiError({ kind: "http", status: 429, message: "HTTP_429" }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; }));
    const old = runtime.scheduleLegalTermsGate("/pages/earn/earn");
    await settleGate();
    if (change === "locale") state.locale = "zh";
    else {
      state.session = { accessToken: "token-new", user: { userId: change === "account" ? 8 : 7 } };
      state.sessionRevision++;
    }
    const current = runtime.scheduleLegalTermsGate("/pages/earn/earn");
    await settleGate();
    vi.mocked(uni.hideLoading).mockClear();
    await vi.advanceTimersByTimeAsync(5_000);
    await old;
    expect(state.current).toHaveBeenCalledTimes(3);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(uni.hideLoading).not.toHaveBeenCalled();
    expect(uni.showModal).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
    resolveNew({ ...snapshot(false), requestedLocale: state.locale, resolvedLocale: state.locale, version: "v7" });
    await current;
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(uni.reLaunch).toHaveBeenCalledOnce();
    expect(state.acknowledge).not.toHaveBeenCalled();
  });

  it.each(["logout-login", "terms-unacknowledged", "terms-acknowledged"])("cancels the obsolete 429 timer and mask immediately for %s", async (destination) => {
    vi.useFakeTimers();
    const runtime = await loadRuntime();
    const { ApiError } = await import("@/api/errors");
    const { legalTermsApi } = await import("@/api/runtime");
    const { navReset } = await import("@/lib/route");
    state.current.mockResolvedValueOnce({ ...snapshot(true), version: "v6" });
    await runtime.scheduleLegalTermsGate("/pages/me/me");
    state.current.mockRejectedValueOnce(new ApiError({ kind: "http", status: 429, message: "HTTP_429" }));
    const old = runtime.scheduleLegalTermsGate("/pages/earn/earn");
    await settleGate();
    expect(state.loading).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    const termsReturn = "/pages/onboarding/terms?return=%2Fpages%2Fme%2Fme";
    if (destination === "logout-login") {
      state.session = null;
      state.sessionRevision++;
      void navReset("/pages/login/login");
      await runtime.scheduleLegalTermsGate("/pages/login/login");
    } else {
      void navReset(termsReturn);
      await runtime.scheduleLegalTermsGate(termsReturn);
      const acknowledged = destination === "terms-acknowledged";
      state.current.mockResolvedValueOnce({ ...snapshot(acknowledged), version: acknowledged ? "v6" : "v7" });
      const pageSnapshot = await legalTermsApi.current("en", "GLOBAL", true);
      if (pageSnapshot.acknowledged) runtime.recordLegalTermsAcknowledged(pageSnapshot);
    }
    expect(state.loading).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await old;
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(destination === "terms-unacknowledged");
    const requests = destination === "logout-login" ? 2 : 3;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.current).toHaveBeenCalledTimes(requests);
    expect(state.acknowledge).not.toHaveBeenCalled();
    expect(uni.showModal).not.toHaveBeenCalled();
    expect(vi.mocked(uni.reLaunch).mock.calls.map(([options]) => options.url))
      .toEqual([destination === "logout-login" ? "/pages/login/login" : termsReturn]);
  });

  it.each(["auth-required", "login", "terms"])("releases an obsolete 429 without a new global read through the %s guard", async (destination) => {
    vi.useFakeTimers();
    const runtime = await loadRuntime();
    const { ApiError } = await import("@/api/errors");
    state.current.mockResolvedValueOnce(snapshot(true));
    await runtime.scheduleLegalTermsGate("/pages/me/me");
    state.current.mockRejectedValueOnce(new ApiError({ kind: "http", status: 429, message: "HTTP_429" }));
    const old = runtime.scheduleLegalTermsGate("/pages/earn/earn");
    await settleGate();
    if (destination === "auth-required") {
      state.session = null;
      expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
    } else {
      expect(runtime.enforcePendingLegalTermsGate(destination === "terms" ? "/pages/onboarding/terms" : "/pages/login/login")).toBe(false);
      expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    }
    expect(state.loading).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await old;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.current).toHaveBeenCalledTimes(2);
    expect(uni.reLaunch).not.toHaveBeenCalled();
    expect(uni.showModal).not.toHaveBeenCalled();
  });

  it("shows the retry prompt after a second transient failure", async () => {
    const runtime = await loadRuntime();
    const { ApiError } = await import("@/api/errors");
    state.current.mockResolvedValueOnce(snapshot(true));
    await runtime.scheduleLegalTermsGate("/pages/me/me");
    state.current.mockRejectedValue(new ApiError({ kind: "http", message: "HTTP_503", status: 503, retryable: true }));
    await runtime.scheduleLegalTermsGate("/pages/support/tickets");
    expect(state.current).toHaveBeenCalledTimes(3);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(uni.showModal).toHaveBeenCalledOnce();
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it.each([true, false])("cold session retries before deciding whether server acknowledgement exists; second read succeeds=%s", async (succeeds) => {
    const runtime = await loadRuntime();
    const { ApiError } = await import("@/api/errors");
    const timeout = new ApiError({ kind: "network", message: "REQUEST_TIMEOUT", retryable: true });
    state.current.mockRejectedValueOnce(timeout);
    if (succeeds) state.current.mockResolvedValueOnce(snapshot(true));
    else state.current.mockRejectedValueOnce(timeout);
    await runtime.scheduleLegalTermsGate("/pages/support/tickets");
    expect(state.current).toHaveBeenCalledTimes(2);
    expect(uni.reLaunch).toHaveBeenCalledTimes(succeeds ? 0 : 1);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(!succeeds);
  });

  it("does not retry a transient read for a different account", async () => {
    const runtime = await loadRuntime();
    const { ApiError } = await import("@/api/errors");
    state.current.mockRejectedValueOnce(new ApiError({ kind: "network", message: "REQUEST_TIMEOUT", retryable: true }));
    const check = runtime.scheduleLegalTermsGate("/pages/support/tickets");
    await settleGate();
    state.session = { accessToken: "token-b", user: { userId: 8 } };
    state.sessionRevision++;
    await check;
    expect(state.current).toHaveBeenCalledOnce();
    expect(uni.showModal).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it("rechecks with the renewed token instead of retrying the old session during backoff", async () => {
    const runtime = await loadRuntime();
    const { ApiError } = await import("@/api/errors");
    state.current.mockRejectedValueOnce(new ApiError({ kind: "network", message: "REQUEST_TIMEOUT", retryable: true }))
      .mockResolvedValueOnce(snapshot(true));
    const check = runtime.scheduleLegalTermsGate("/pages/support/tickets");
    await settleGate();
    state.session = { accessToken: "token-b", user: { userId: 7 } };
    state.sessionRevision++;
    state.refreshContinuation = true;
    await check;
    expect(state.current).toHaveBeenCalledTimes(2);
    expect(uni.showLoading).toHaveBeenCalledTimes(2);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
    expect(uni.showModal).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it.each(["network", "HTTP_503", "LEGAL_TERMS_RESPONSE_INVALID"])("keeps an acknowledged user on the current page after %s, gated until retry succeeds", async (failure) => {
    const runtime = await loadRuntime();
    state.current.mockResolvedValueOnce(snapshot(true));
    await runtime.scheduleLegalTermsGate("/pages/me/rewards");
    state.current.mockRejectedValueOnce(new Error(failure));
    await runtime.scheduleLegalTermsGate("/pages/tx/usdt");
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/rewards")).toBe(true);
    expect(uni.reLaunch).not.toHaveBeenCalled();
    expect(uni.showModal).toHaveBeenCalledOnce();
    const prompt = vi.mocked(uni.showModal).mock.calls[0][0]!;
    expect(prompt.showCancel).toBe(false);
    state.current.mockResolvedValueOnce(snapshot(true));
    prompt.success?.({ confirm: true, cancel: false, errMsg: "showModal:ok" });
    await settleGate();
    expect(state.current).toHaveBeenCalledTimes(3);
    expect(state.retryProfileLocale).not.toHaveBeenCalled();
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it("does not redirect after another navigation fails, but a confirmed new unacknowledged version still redirects", async () => {
    const runtime = await loadRuntime();
    state.current.mockResolvedValueOnce(snapshot(true));await runtime.scheduleLegalTermsGate("/pages/me/rewards");
    state.current.mockRejectedValueOnce(new Error("network"));await runtime.scheduleLegalTermsGate("/pages/tx/usdt");
    state.current.mockRejectedValueOnce(new Error("network"));await runtime.scheduleLegalTermsGate("/pages/tx/nex");
    expect(runtime.enforcePendingLegalTermsGate("/pages/tx/nex")).toBe(true);
    expect(uni.reLaunch).not.toHaveBeenCalled();
    state.current.mockResolvedValueOnce({...snapshot(false),version:"v5"});await runtime.scheduleLegalTermsGate("/pages/me/rewards");
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);expect(uni.reLaunch).toHaveBeenCalledOnce();
  });

  it("retries the latest ordinary route from one open prompt and allows deliberate Terms entry", async () => {
    const runtime=await loadRuntime();state.current.mockResolvedValueOnce(snapshot(true));await runtime.scheduleLegalTermsGate("/pages/me/me");
    state.current.mockRejectedValue(new Error("network"));await runtime.scheduleLegalTermsGate("/pages/tx/usdt");
    await runtime.scheduleLegalTermsGate("/pages/me/rewards");
    expect(uni.showModal).toHaveBeenCalledOnce();expect(uni.reLaunch).not.toHaveBeenCalled();
    expect(runtime.enforcePendingLegalTermsGate("/pages/onboarding/terms")).toBe(false);
    expect(runtime.enforcePendingLegalTermsGate("/pages/onboarding/privacy")).toBe(false);
    state.current.mockResolvedValueOnce({...snapshot(false),version:"v5"});
    vi.mocked(uni.showModal).mock.calls[0][0]!.success?.({confirm:true,cancel:false,errMsg:"showModal:ok"});await settleGate();
    expect(uni.reLaunch).toHaveBeenLastCalledWith(expect.objectContaining({url:"/pages/onboarding/terms?return=%2Fpages%2Fme%2Frewards"}));
  });

  it.each(["refresh","relogin","other-account","language"])("scopes an earlier acknowledgement correctly across %s",async(change)=>{
    const runtime=await loadRuntime();state.current.mockResolvedValueOnce(snapshot(true));await runtime.scheduleLegalTermsGate("/pages/me/me");
    if(change==="language")state.locale="zh";
    else{state.session={accessToken:"token-new",user:{userId:change==="other-account"?8:7}};state.sessionRevision++;state.refreshContinuation=change==="refresh";}
    state.current.mockRejectedValueOnce(new Error("network"));await runtime.scheduleLegalTermsGate("/pages/me/rewards");
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(uni.reLaunch).toHaveBeenCalledTimes(change==="refresh"?0:1);
    expect(uni.showModal).toHaveBeenCalledTimes(change==="refresh"?1:0);
  });

  it("never lets an old retry prompt request with a new same-user login",async()=>{
    const runtime=await loadRuntime();state.current.mockResolvedValueOnce(snapshot(true));await runtime.scheduleLegalTermsGate("/pages/me/me");
    state.current.mockRejectedValueOnce(new Error("network"));await runtime.scheduleLegalTermsGate("/pages/me/rewards");
    const prompt=vi.mocked(uni.showModal).mock.calls[0][0]!;
    state.sessionRevision+=2;state.refreshContinuation=false;
    prompt.success?.({confirm:true,cancel:false,errMsg:"showModal:ok"});await settleGate();
    expect(state.current).toHaveBeenCalledTimes(2);expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
  });

  it("a page-owned acknowledged response supersedes a failing global recheck without a new prompt",async()=>{
    const runtime=await loadRuntime();let reject!:(error:Error)=>void;
    state.current.mockReturnValueOnce(new Promise((_ok,fail)=>{reject=fail;}));
    const read=runtime.scheduleLegalTermsGate("/pages/me/rewards");await settleGate();
    runtime.recordLegalTermsAcknowledged(snapshot(true));reject(new Error("late global failure"));await read;
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);expect(uni.reLaunch).not.toHaveBeenCalled();expect(uni.showModal).not.toHaveBeenCalled();
    state.current.mockRejectedValueOnce(new Error("network"));await runtime.scheduleLegalTermsGate("/pages/me/me");
    expect(uni.showModal).toHaveBeenCalledOnce();expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it("keeps the replacement retry prompt when the old modal completes after another failure", async () => {
    const runtime = await loadRuntime();
    state.current.mockResolvedValueOnce(snapshot(true));
    await runtime.scheduleLegalTermsGate("/pages/me/me");
    state.current.mockRejectedValue(new Error("network"));
    await runtime.scheduleLegalTermsGate("/pages/me/rewards");
    const first = vi.mocked(uni.showModal).mock.calls[0][0]!;
    first.success?.({ confirm: true, cancel: false, errMsg: "showModal:ok" });
    await settleGate();
    expect(uni.showModal).toHaveBeenCalledTimes(2);
    first.complete?.({ errMsg: "showModal:ok" });
    runtime.enforcePendingLegalTermsGate("/pages/me/rewards");
    expect(uni.showModal).toHaveBeenCalledTimes(2);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it("does not let a previous-language retry prompt issue a request", async () => {
    const runtime = await loadRuntime();
    state.current.mockResolvedValueOnce(snapshot(true));
    await runtime.scheduleLegalTermsGate("/pages/me/me");
    state.current.mockRejectedValueOnce(new Error("network"));
    await runtime.scheduleLegalTermsGate("/pages/me/rewards");
    state.locale = "zh";
    vi.mocked(uni.showModal).mock.calls[0][0]!.success?.({ confirm: true, cancel: false, errMsg: "showModal:ok" });
    await settleGate();
    expect(state.current).toHaveBeenCalledTimes(2);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
  });

  it("re-enforces an unacknowledged requirement after leaving Terms", async () => {
    state.current.mockResolvedValue(snapshot(false));
    const runtime = await loadRuntime();

    runtime.scheduleLegalTermsGate("/pages/me/me");
    await settleGate();

    expect(uni.reLaunch).toHaveBeenCalledTimes(1);
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/me")).toBe(true);
    expect(uni.reLaunch).toHaveBeenLastCalledWith(expect.objectContaining({
      url: "/pages/onboarding/terms?return=%2Fpages%2Fme%2Fme",
    }));
    expect(runtime.enforcePendingLegalTermsGate("/pages/onboarding/terms")).toBe(false);
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/risk-disclosure")).toBe(false);
    expect(runtime.enforcePendingLegalTermsGate("/pages/onboarding/privacy")).toBe(false);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
  });

  it.each(["/pages/register/success", "/pages/onboarding/estimator"])("preserves registration return %s on failed reads without changing public or business routes", async (destination) => {
    state.current.mockRejectedValue(new Error("Terms unavailable"));
    const runtime = await loadRuntime();
    await runtime.scheduleLegalTermsGate(destination);
    expect(runtime.enforcePendingLegalTermsGate("/pages/register/register")).toBe(true);
    expect(uni.reLaunch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      url: `/pages/onboarding/terms?return=${encodeURIComponent(destination)}`,
    }));
    expect(runtime.enforcePendingLegalTermsGate("/pages/onboarding/privacy")).toBe(false);
    expect(runtime.enforcePendingLegalTermsGate("/pages/onboarding/terms")).toBe(false);
    expect(uni.reLaunch).toHaveBeenCalledOnce();
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/me")).toBe(true);
    expect(uni.reLaunch).toHaveBeenLastCalledWith(expect.objectContaining({
      url: "/pages/onboarding/terms?return=%2Fpages%2Fme%2Fme",
    }));
  });

  it.each(["PROFILE_LANGUAGE_LOAD_FAILED", "PROFILE_LANGUAGE_SYNC_FAILED"])("recovers %s through the same-session native Retry before reading Terms", async (message) => {
    const runtime = await loadRuntime();
    const { trackProfileLocaleHydration, pendingProfileLocaleHydration } = await import("./locale-profile-hydration");
    const scope = { accountId: "user:7", revision: 1 };
    runtime.recordLegalTermsAcknowledged(snapshot(true));
    const failed = Promise.reject(new Error(message));
    trackProfileLocaleHydration(scope, failed);
    await expect(failed).rejects.toThrow(message);
    state.current.mockResolvedValue(snapshot(true));
    await runtime.scheduleLegalTermsGate("/pages/me/rewards");
    expect(state.current).not.toHaveBeenCalled();
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(pendingProfileLocaleHydration(scope)).toBe(failed);
    const prompt = vi.mocked(uni.showModal).mock.calls[0][0]!;
    state.retryProfileLocale.mockImplementation(() => trackProfileLocaleHydration(scope, Promise.resolve()));
    prompt.success?.({ confirm: true, cancel: false, errMsg: "showModal:ok" });
    await settleGate();
    expect(state.retryProfileLocale).toHaveBeenCalledOnce();
    expect(state.current).toHaveBeenCalledOnce();
    expect(state.acknowledge).not.toHaveBeenCalled();
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
    expect(pendingProfileLocaleHydration(scope)).toBeNull();
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it.each(["language-failed", "terms-failed", "acknowledgement-required"])("keeps business gated after locale Retry when %s", async (outcome) => {
    const runtime = await loadRuntime();
    const { trackProfileLocaleHydration } = await import("./locale-profile-hydration");
    const scope = { accountId: "user:7", revision: 1 };
    const resumed = vi.fn(async () => {});
    runtime.recordLegalTermsAcknowledged(snapshot(true));
    runtime.afterLegalTermsAcknowledged(resumed);
    const failed = Promise.reject(new Error("PROFILE_LANGUAGE_LOAD_FAILED"));
    trackProfileLocaleHydration(scope, failed);
    await expect(failed).rejects.toThrow("PROFILE_LANGUAGE_LOAD_FAILED");
    await runtime.scheduleLegalTermsGate("/pages/me/rewards");
    state.retryProfileLocale.mockImplementation(() => trackProfileLocaleHydration(scope,
      outcome === "language-failed" ? Promise.reject(new Error("PROFILE_LANGUAGE_LOAD_FAILED")) : Promise.resolve()));
    if (outcome === "terms-failed") state.current.mockRejectedValue(new Error("LEGAL_TERMS_RESPONSE_INVALID"));
    else state.current.mockResolvedValue(snapshot(false));
    vi.mocked(uni.showModal).mock.calls[0][0]!.success?.({ confirm: true, cancel: false, errMsg: "showModal:ok" });
    await settleGate();
    expect(state.retryProfileLocale).toHaveBeenCalledOnce();
    expect(state.current).toHaveBeenCalledTimes(outcome === "language-failed" ? 0 : 1);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(resumed).not.toHaveBeenCalled();
    expect(state.acknowledge).not.toHaveBeenCalled();
    expect(uni.reLaunch).toHaveBeenCalledTimes(outcome === "acknowledgement-required" ? 1 : 0);
    if (outcome === "acknowledgement-required") {
      runtime.recordLegalTermsAcknowledged(snapshot(false));
      await settleGate();
      expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
      expect(resumed).not.toHaveBeenCalled();
      runtime.recordLegalTermsAcknowledged(snapshot(true));
      await settleGate();
      expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
      expect(resumed).toHaveBeenCalledOnce();
      expect(state.acknowledge).not.toHaveBeenCalled();
    }
  });

  it("waits for account language before presenting Terms and never shows the earlier default", async () => {
    const runtime = await loadRuntime();
    const { trackProfileLocaleHydration } = await import("./locale-profile-hydration");
    let resolve!: () => void;
    trackProfileLocaleHydration({ accountId: "user:7", revision: 1 }, new Promise<void>((done) => { resolve = done; }));
    state.current.mockResolvedValue({ ...snapshot(false), requestedLocale: "zh", resolvedLocale: "zh" });
    const first = runtime.scheduleLegalTermsGate("/pages/onboarding/estimator");
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(state.current).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
    state.locale = "zh";
    resolve();
    await first;
    expect(state.current).toHaveBeenCalledOnce();
    expect(uni.reLaunch).toHaveBeenCalledOnce();
  });

  it("does not send an old account's Terms read when its language finishes after sign-out", async () => {
    const runtime = await loadRuntime();
    const { trackProfileLocaleHydration } = await import("./locale-profile-hydration");
    let resolve!: () => void;
    trackProfileLocaleHydration({ accountId: "user:7", revision: 1 }, new Promise<void>((done) => { resolve = done; }));
    const first = runtime.scheduleLegalTermsGate("/pages/onboarding/estimator");
    state.session = null;
    resolve();
    await first;
    expect(state.current).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it("keeps the public privacy policy readable through an async unacknowledged Terms result", async () => {
    state.current.mockResolvedValue(snapshot(false));
    const runtime = await loadRuntime();

    await runtime.scheduleLegalTermsGate("/pages/onboarding/privacy?return=%2Fpages%2Fonboarding%2Fintro");

    expect(state.current).toHaveBeenCalledOnce();
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(runtime.enforcePendingLegalTermsGate("/pages/onboarding/privacy")).toBe(false);
    expect(uni.showLoading).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();

    expect(runtime.enforcePendingLegalTermsGate("/pages/me/me")).toBe(true);
    expect(uni.reLaunch).toHaveBeenLastCalledWith(expect.objectContaining({
      url: "/pages/onboarding/terms?return=%2Fpages%2Fme%2Fme",
    }));
  });

  it("does not redirect to Terms when a prior business-route check resolves after privacy becomes current", async () => {
    let resolveCurrent!: (value: LegalTermsCurrent) => void;
    state.current.mockReturnValueOnce(new Promise((resolve) => { resolveCurrent = resolve; }));
    const runtime = await loadRuntime();

    runtime.scheduleLegalTermsGate("/pages/me/me");
    runtime.scheduleLegalTermsGate("/pages/onboarding/privacy");
    resolveCurrent(snapshot(false));
    await settleGate();

    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(runtime.enforcePendingLegalTermsGate("/pages/onboarding/privacy")).toBe(false);
    expect(uni.reLaunch).not.toHaveBeenCalled();
    expect(uni.hideLoading).toHaveBeenCalled();

    expect(runtime.enforcePendingLegalTermsGate("/pages/team/team")).toBe(true);
    expect(uni.reLaunch).toHaveBeenLastCalledWith(expect.objectContaining({
      url: "/pages/onboarding/terms?return=%2Fpages%2Fteam%2Fteam",
    }));
  });

  it("keeps the obligation and permits a later retry after both reset attempts fail", async () => {
    vi.useFakeTimers();
    state.current.mockResolvedValue(snapshot(false));
    const showToast = vi.fn();
    vi.stubGlobal("uni", {
      reLaunch: vi.fn((options: { fail?: () => void }) => options.fail?.()),
      showLoading: vi.fn(), hideLoading: vi.fn(), showToast,
    });
    const runtime = await loadRuntime();
    runtime.scheduleLegalTermsGate("/pages/me/me");
    await settleGate();
    expect(uni.reLaunch).toHaveBeenCalledTimes(2);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/me")).toBe(true);
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/me")).toBe(true);
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/me")).toBe(true);
    expect(uni.reLaunch).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/me")).toBe(true);
    expect(uni.reLaunch).toHaveBeenCalledTimes(4);
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    vi.useRealTimers();
  });

  it("fails closed synchronously while a fresh session is still being verified", async () => {
    let resolveCurrent!: (value: LegalTermsCurrent) => void;
    state.current.mockReturnValue(new Promise((resolve) => { resolveCurrent = resolve; }));
    const runtime = await loadRuntime();

    runtime.scheduleLegalTermsGate("/pages/store/store");

    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(runtime.enforcePendingLegalTermsGate("/pages/store/store")).toBe(true);
    expect(uni.showLoading).toHaveBeenCalledWith({ title: "", mask: true });
    expect(uni.reLaunch).not.toHaveBeenCalled();

    resolveCurrent(snapshot(true));
    await settleGate();

    expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
    expect(uni.hideLoading).toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it("also pauses an already-verified session during a later authoritative recheck", async () => {
    state.current.mockResolvedValueOnce(snapshot(true));
    const runtime = await loadRuntime();
    runtime.scheduleLegalTermsGate("/pages/index/index");
    await settleGate();

    let resolveRecheck!: (value: LegalTermsCurrent) => void;
    state.current.mockReturnValueOnce(new Promise((resolve) => { resolveRecheck = resolve; }));
    runtime.scheduleLegalTermsGate("/pages/store/store");

    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(runtime.enforcePendingLegalTermsGate("/pages/store/store")).toBe(true);
    expect(uni.reLaunch).not.toHaveBeenCalled();

    resolveRecheck(snapshot(true));
    await settleGate();
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
  });

  it("verifies a direct risk-disclosure entry but preserves an existing acknowledgement gate", async () => {
    let resolveCurrent!: (value: LegalTermsCurrent) => void;
    state.current.mockReturnValueOnce(new Promise((resolve) => { resolveCurrent = resolve; }));
    const runtime = await loadRuntime();

    runtime.scheduleLegalTermsGate("/pages/me/risk-disclosure");
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/risk-disclosure")).toBe(true);

    resolveCurrent(snapshot(false));
    await settleGate();
    expect(uni.reLaunch).toHaveBeenLastCalledWith(expect.objectContaining({
      url: "/pages/onboarding/terms?return=%2Fpages%2Fme%2Frisk-disclosure",
    }));

    runtime.scheduleLegalTermsGate("/pages/me/risk-disclosure");
    expect(state.current).toHaveBeenCalledTimes(1);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
  });

  it("clears the pending requirement only after an authoritative acknowledgement", async () => {
    state.current.mockResolvedValue(snapshot(false));
    const runtime = await loadRuntime();
    runtime.scheduleLegalTermsGate("/pages/me/me");
    await settleGate();

    runtime.recordLegalTermsAcknowledged(snapshot(false));
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/me")).toBe(true);

    runtime.recordLegalTermsAcknowledged(snapshot(true));
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/me")).toBe(false);
  });

  it("fails closed after the current-terms request fails", async () => {
    state.current.mockRejectedValue(new Error("offline"));
    const runtime = await loadRuntime();
    runtime.scheduleLegalTermsGate("/pages/index/index");
    await settleGate();

    expect(runtime.enforcePendingLegalTermsGate("/pages/team/team")).toBe(true);
    expect(uni.reLaunch).toHaveBeenLastCalledWith(expect.objectContaining({
      url: "/pages/onboarding/terms?return=%2Fpages%2Fteam%2Fteam",
    }));

    state.current.mockClear();
    runtime.scheduleLegalTermsGate("/pages/team/team");
    expect(state.current).not.toHaveBeenCalled();
    expect(runtime.enforcePendingLegalTermsGate("/pages/team/team")).toBe(true);
  });

  it("does not carry an account obligation into another session", async () => {
    state.current.mockResolvedValue(snapshot(false));
    const runtime = await loadRuntime();
    runtime.scheduleLegalTermsGate("/pages/me/me");
    await settleGate();

    state.session = { accessToken: "token-b", user: { userId: 8 } };
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/me")).toBe(false);
  });

  it("ignores a late response after the session changes", async () => {
    let resolveCurrent!: (value: LegalTermsCurrent) => void;
    state.current.mockReturnValue(new Promise((resolve) => { resolveCurrent = resolve; }));
    const runtime = await loadRuntime();
    runtime.scheduleLegalTermsGate("/pages/me/me");

    state.session = { accessToken: "token-b", user: { userId: 8 } };
    resolveCurrent(snapshot(false));
    await settleGate();

    expect(uni.reLaunch).not.toHaveBeenCalled();
    expect(runtime.enforcePendingLegalTermsGate("/pages/me/me")).toBe(false);
  });

  it("does not invalidate authenticated terms when the product catalog refreshes mid-request", async () => {
    let resolveOld!: (value: LegalTermsCurrent) => void;
    state.current
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(snapshot(true));
    const runtime = await loadRuntime();
    runtime.scheduleLegalTermsGate("/pages/index/index");

    state.revision = { epoch: 2, runId: "" };
    resolveOld(snapshot(true));
    await settleGate();
    await settleGate();

    expect(state.current).toHaveBeenCalledTimes(1);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it("rejects a late acknowledgement after logout and same-credential re-login", async () => {
    let resolveOld!: (value: LegalTermsCurrent) => void;
    state.current.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(snapshot(false));
    const runtime = await loadRuntime();
    const pending = runtime.scheduleLegalTermsGate("/pages/index/index");
    await settleGate();
    state.sessionRevision += 2;
    resolveOld(snapshot(true));
    await pending;
    expect(state.current).toHaveBeenCalledTimes(2);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
  });

  it("rechecks the same user after an access-token rotation during verification", async () => {
    let resolveOld!: (value: LegalTermsCurrent) => void;
    state.current
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(snapshot(true));
    const runtime = await loadRuntime();

    runtime.scheduleLegalTermsGate("/pages/index/index");
    await settleGate();
    state.session = { accessToken: "token-b", user: { userId: 7 } };
    resolveOld(snapshot(true));
    await settleGate();
    await settleGate();

    expect(state.current).toHaveBeenCalledTimes(2);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
  });

  it.each(["resolve", "reject"])("ignores an old locale %s without releasing the current loading gate", async (completion) => {
    let resolveOld!: (value: LegalTermsCurrent) => void;
    let rejectOld!: (reason: Error) => void;
    let resolveNew!: (value: LegalTermsCurrent) => void;
    state.current
      .mockImplementationOnce(() => new Promise((ok, fail) => { resolveOld = ok; rejectOld = fail; }))
      .mockImplementationOnce(() => new Promise((ok) => { resolveNew = ok; }));
    const runtime = await loadRuntime();
    const old = runtime.scheduleLegalTermsGate("/pages/me/language");
    await settleGate();
    state.locale = "zh";
    const current = runtime.scheduleLegalTermsGate("/pages/me/language");
    await settleGate();
    expect(state.current).toHaveBeenCalledTimes(2);
    if (completion === "resolve") resolveOld(snapshot(true));
    else rejectOld(new Error("OLD_LANGUAGE_FAILURE"));
    await old;
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(uni.hideLoading).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
    resolveNew({ ...snapshot(false), requestedLocale: "zh", resolvedLocale: "zh" });
    await current;
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
    expect(uni.reLaunch).toHaveBeenCalledOnce();
  });

  it("replaces an older language obligation with the selected language's authoritative check", async () => {
    state.current.mockResolvedValueOnce(snapshot(false))
      .mockResolvedValueOnce({ ...snapshot(true), requestedLocale: "zh", resolvedLocale: "zh" });
    const runtime = await loadRuntime();
    await runtime.scheduleLegalTermsGate("/pages/me/language");
    state.locale = "zh";
    await runtime.scheduleLegalTermsGate("/pages/me/language");
    expect(state.current).toHaveBeenCalledTimes(2);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
  });

  it("rechecks the current language if it changed before the pending response returns", async () => {
    let resolveOld!: (value: LegalTermsCurrent) => void;
    state.current.mockImplementationOnce(() => new Promise((ok) => { resolveOld = ok; }))
      .mockResolvedValueOnce({ ...snapshot(false), requestedLocale: "zh", resolvedLocale: "zh" });
    const runtime = await loadRuntime();
    const old = runtime.scheduleLegalTermsGate("/pages/me/language");
    await settleGate();
    state.locale = "zh";
    resolveOld(snapshot(true));
    await old;
    expect(state.current).toHaveBeenCalledTimes(2);
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
  });

  it("does not clear the current locale obligation with another language's acknowledgement", async () => {
    state.locale = "zh";
    state.current.mockResolvedValue({ ...snapshot(false), requestedLocale: "zh", resolvedLocale: "zh" });
    const runtime = await loadRuntime();
    await runtime.scheduleLegalTermsGate("/pages/me/me");
    runtime.recordLegalTermsAcknowledged(snapshot(true));
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
  });

  it("accepts the acknowledged fallback document only in the selected request locale", async () => {
    state.locale = "vi";
    state.current.mockResolvedValue({ ...snapshot(false), requestedLocale: "vi" });
    const runtime = await loadRuntime();
    await runtime.scheduleLegalTermsGate("/pages/me/me");
    runtime.recordLegalTermsAcknowledged(snapshot(true), "vi");
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(false);
  });

  it("releases the business loading mask immediately on a privacy entry with a new locale", async () => {
    let resolveOld!: (value: LegalTermsCurrent) => void;
    let resolveNew!: (value: LegalTermsCurrent) => void;
    state.current
      .mockImplementationOnce(() => new Promise((ok) => { resolveOld = ok; }))
      .mockImplementationOnce(() => new Promise((ok) => { resolveNew = ok; }));
    const runtime = await loadRuntime();
    const old = runtime.scheduleLegalTermsGate("/pages/me/me");
    await settleGate();
    state.locale = "zh";
    const current = runtime.scheduleLegalTermsGate("/pages/onboarding/privacy");
    await settleGate();
    expect(state.current).toHaveBeenCalledTimes(2);
    expect(uni.hideLoading).toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
    expect(runtime.enforcePendingLegalTermsGate("/pages/onboarding/privacy")).toBe(false);
    resolveOld(snapshot(true));
    await old;
    resolveNew({ ...snapshot(false), requestedLocale: "zh", resolvedLocale: "zh" });
    await current;
    expect(uni.reLaunch).not.toHaveBeenCalled();
    expect(runtime.hasPendingLegalTermsRequirement()).toBe(true);
  });
});
