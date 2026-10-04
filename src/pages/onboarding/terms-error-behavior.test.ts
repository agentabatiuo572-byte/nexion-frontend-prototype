import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./terms.vue?raw";
import { sameLegalTermsSession, sameLegalTermsRun, shouldBlockLegalTermsExit } from "@/lib/legal-terms-gate";
import { createLegalTermsRequestFence } from "@/lib/legal-terms-request-fence";
import { isProfileLocaleHydrationError } from "@/lib/locale-profile-hydration";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as viMessages } from "@/i18n/messages/vi";

const compiled = ts.transpileModule(
  source.slice(source.indexOf("function showTermsPage()"), source.indexOf("onMounted(showTermsPage)"))
    + source.slice(source.indexOf("async function loadTerms("), source.indexOf("</script>"))
    + "\nreturn { loadTerms, confirmTerms, showTermsPage, hideTermsPage, retryTerms };",
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function harness(messages = en) {
  const t = ref(messages);
  const errorKey = ref<"loadFailed" | "ackFailed" | "sessionChanged" | "runChanged" | "loginRequired" | "languageSyncFailed" | null>(null);
  const current = { accessToken: "test-session", userId: 1, sessionRevision: 1, runEpoch: 1 };
  const snapshot = { source: "server", sourceEnvironment: "PRODUCTION", runId: "", version: "v1",
    requestedLocale: "en", resolvedLocale: "en", requestedJurisdiction: "GLOBAL", resolvedJurisdiction: "GLOBAL",
    acknowledged: false };
  const deps = {
    remoteApiEnabled: true, loaded: ref(false), loadingTerms: ref(false), loadErrorKey: errorKey, serverTerms: ref<any>(snapshot),
    t, confirming: ref(false), locale: { code: "en" }, returnTo: ref("/pages/me/me"), explicitReturn: ref(false),
    termsRequests: createLegalTermsRequestFence(), termsPageVisible: true, confirmationGeneration: 0,
    currentSessionFence: () => ({ ...current }), sameLegalTermsSession, sameLegalTermsRun,
    sessionVault: { isRefreshContinuation: vi.fn(() => false) },
    captureRuntimeRevision: () => ({ runId: "", epoch: current.runEpoch }),
    legalTermsApi: { current: vi.fn().mockResolvedValue(snapshot), acknowledge: vi.fn().mockResolvedValue(snapshot) },
    recordLegalTermsAcknowledged: vi.fn(), shouldBlockLegalTermsExit,
    pendingProfileLocaleHydration: vi.fn<() => Promise<void> | null>(() => null), isProfileLocaleHydrationError,
    retryCurrentProfileLocale: vi.fn(),
    navTo: vi.fn(), navBack: vi.fn(), buildLegalTermsLoginRoute: vi.fn(), buildLegalTermsRoute: vi.fn(),
    uni: { showToast: vi.fn() },
  };
  const handlers = new Function(...Object.keys(deps), compiled)(...Object.values(deps)) as {
    loadTerms(): Promise<void>; confirmTerms(): Promise<void>; showTermsPage(): void; hideTermsPage(): void; retryTerms(): void;
  };
  return { ...deps, ...handlers, current, snapshot, error: computed(() => errorKey.value ? t.value.terms[errorKey.value] : null) };
}

describe("terms localized failure behavior", () => {
  it("automatically re-reads acknowledged v6 after same-authentication token rotation", async () => {
    const h=harness(); h.sessionVault.isRefreshContinuation.mockReturnValue(true);
    h.legalTermsApi.current.mockImplementationOnce(async () => {
      h.current.accessToken="rotated";h.current.sessionRevision++;
      return {...h.snapshot,version:"v6",acknowledged:true};
    }).mockResolvedValue({...h.snapshot,version:"v6",acknowledged:true});
    await h.loadTerms();
    expect(h.legalTermsApi.current).toHaveBeenCalledTimes(2);
    expect(h.error.value).toBeNull(); expect(h.serverTerms.value?.version).toBe("v6");
    expect(h.recordLegalTermsAcknowledged).toHaveBeenCalledOnce();
  });
  it("does not recover an old result through logout and same-user re-login", async () => {
    const h=harness(); h.sessionVault.isRefreshContinuation.mockReturnValue(false);
    h.legalTermsApi.current.mockImplementationOnce(async () => {
      h.current.accessToken="new-login";h.current.sessionRevision+=2;
      return {...h.snapshot,acknowledged:true};
    });
    await h.loadTerms();
    expect(h.legalTermsApi.current).toHaveBeenCalledTimes(1);
    expect(h.error.value).toBe(en.terms.sessionChanged); expect(h.serverTerms.value).toBeNull();
  });
  it("bounds automatic rotation recovery and retains explicit retry after repeated races", async () => {
    const h=harness(); h.sessionVault.isRefreshContinuation.mockReturnValue(true);
    h.legalTermsApi.current.mockImplementation(async () => {
      h.current.accessToken+="-rotated";h.current.sessionRevision++;
      return {...h.snapshot,acknowledged:true};
    });
    await h.loadTerms();
    expect(h.legalTermsApi.current).toHaveBeenCalledTimes(2);
    expect(h.error.value).toBe(en.terms.sessionChanged); expect(h.serverTerms.value).toBeNull();
    expect(h.loadingTerms.value).toBe(false);
  });
  it.each(["/pages/register/success", "/pages/onboarding/estimator"])("returns an acknowledged registration to its explicit target %s", async (returnTo) => {
    const h = harness();
    h.returnTo.value = returnTo;
    h.explicitReturn.value = true;
    h.legalTermsApi.acknowledge.mockResolvedValue({ ...h.snapshot, acknowledged: true });
    await h.confirmTerms();
    expect(h.recordLegalTermsAcknowledged).toHaveBeenCalledOnce();
    expect(h.navTo).toHaveBeenCalledExactlyOnceWith(returnTo);
    expect(h.navBack).not.toHaveBeenCalled();
  });

  it("renders the effective date and version from the same server snapshot", () => {
    expect(source).toContain("`${serverTerms.effectiveAt} · ${serverTerms.version}`");
    expect(source).not.toContain("`${t.terms.effectiveLabel} · ${serverTerms.version}`");
    expect(source).not.toContain("`${serverTerms.summary} · ${serverTerms.effectiveAt}`");
  });

  it.each([en, zh, viMessages])("never exposes the server exception on load or acknowledge", async (messages) => {
    const h = harness(messages);
    h.legalTermsApi.current.mockRejectedValue(new Error("internal SQL token=do-not-show"));
    await h.loadTerms();
    expect(h.error.value).toBe(messages.terms.loadFailed);
    expect(h.loaded.value).toBe(true);
    expect(h.serverTerms.value).toBeNull();
    h.serverTerms.value = h.snapshot;
    h.legalTermsApi.acknowledge.mockRejectedValue(new Error("internal SQL token=do-not-show"));
    await h.confirmTerms();
    expect(h.error.value).toBe(messages.terms.ackFailed);
    expect(h.confirming.value).toBe(false);
    expect(h.navBack).not.toHaveBeenCalled();
  });

  it("changes an existing error with the selected locale", async () => {
    const h = harness();
    h.legalTermsApi.current.mockRejectedValue(new Error("load failed"));
    await h.loadTerms();
    expect(h.error.value).toBe(en.terms.loadFailed);
    h.t.value = zh;
    expect(h.error.value).toBe(zh.terms.loadFailed);
  });

  it("rejects a response from an expired session and keeps duplicate confirmations single-flight", async () => {
    const h = harness();
    let resolve!: (value: any) => void;
    h.legalTermsApi.acknowledge.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const pending = h.confirmTerms();
    await h.confirmTerms();
    expect(h.legalTermsApi.acknowledge).toHaveBeenCalledOnce();
    h.current.sessionRevision += 1;
    resolve({ ...h.snapshot, acknowledged: true });
    await pending;
    expect(h.error.value).toBe(en.terms.sessionChanged);
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
    expect(h.navBack).not.toHaveBeenCalled();
  });

  it("keeps retry loading single-flight while the first request is pending", async () => {
    const h = harness();
    let resolve!: (value: any) => void;
    h.legalTermsApi.current.mockImplementation(() => new Promise((r) => { resolve = r; }));

    const first = h.loadTerms();
    await h.loadTerms();
    expect(h.legalTermsApi.current).toHaveBeenCalledOnce();

    resolve(h.snapshot);
    await first;
    expect(h.loadingTerms.value).toBe(false);
  });

  it("starts the new locale while an old request is pending and ignores the old acknowledgement", async () => {
    const h = harness();
    let resolveEnglish!: (value: any) => void;
    let resolveChinese!: (value: any) => void;
    h.legalTermsApi.current
      .mockImplementationOnce(() => new Promise((resolve) => { resolveEnglish = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveChinese = resolve; }));

    const english = h.loadTerms();
    await Promise.resolve();
    h.locale.code = "zh";
    const chinese = h.loadTerms();
    await Promise.resolve();
    expect(h.legalTermsApi.current).toHaveBeenCalledTimes(2);

    resolveChinese({ ...h.snapshot, requestedLocale: "zh", acknowledged: false });
    await chinese;
    expect(h.serverTerms.value?.requestedLocale).toBe("zh");

    resolveEnglish({ ...h.snapshot, requestedLocale: "en", acknowledged: true });
    await english;
    expect(h.serverTerms.value?.requestedLocale).toBe("zh");
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
  });

  it("keeps a same-session Terms response through an unrelated catalog refresh", async () => {
    const h = harness();
    h.legalTermsApi.current.mockImplementation(async () => {
      h.current.runEpoch += 1;
      return { ...h.snapshot, acknowledged: true };
    });
    await h.loadTerms();
    expect(h.error.value).toBeNull();
    expect(h.recordLegalTermsAcknowledged).toHaveBeenCalledOnce();
  });

  it.each(["resolve", "reject"])("keeps the current read loading when an old locale %s arrives first", async (completion) => {
    const h = harness();
    let resolveOld!: (value: any) => void;
    let rejectOld!: (reason: Error) => void;
    let resolveCurrent!: (value: any) => void;
    h.legalTermsApi.current
      .mockImplementationOnce(() => new Promise((ok, fail) => { resolveOld = ok; rejectOld = fail; }))
      .mockImplementationOnce(() => new Promise((ok) => { resolveCurrent = ok; }));
    const oldRead = h.loadTerms();
    await Promise.resolve();
    h.locale.code = "zh";
    const currentRead = h.loadTerms();
    await Promise.resolve();
    if (completion === "resolve") resolveOld({ ...h.snapshot, acknowledged: true });
    else rejectOld(new Error("OLD_READ_FAILURE"));
    await oldRead;
    expect(h.loadingTerms.value).toBe(true);
    expect(h.loaded.value).toBe(false);
    expect(h.serverTerms.value).toBeNull();
    expect(h.error.value).toBeNull();
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
    resolveCurrent({ ...h.snapshot, requestedLocale: "zh", resolvedLocale: "zh" });
    await currentRead;
    expect(h.loadingTerms.value).toBe(false);
    expect(h.serverTerms.value?.requestedLocale).toBe("zh");
  });

  it("leaves a mismatched response locale closed and retryable", async () => {
    const h = harness();
    h.legalTermsApi.current.mockResolvedValue({ ...h.snapshot, requestedLocale: "zh", acknowledged: true });
    await h.loadTerms();
    expect(h.serverTerms.value).toBeNull();
    expect(h.error.value).toBe(en.terms.loadFailed);
    expect(h.loadingTerms.value).toBe(false);
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
    h.legalTermsApi.current.mockResolvedValue(h.snapshot);
    await h.loadTerms();
    expect(h.error.value).toBeNull();
    expect(h.serverTerms.value?.requestedLocale).toBe("en");
  });

  it.each(["resolve", "reject"])("ignores a late acknowledgement %s after a new locale read", async (completion) => {
    const h = harness();
    let resolve!: (value: any) => void;
    let reject!: (reason: Error) => void;
    h.legalTermsApi.acknowledge.mockImplementation(() => new Promise((ok, fail) => { resolve = ok; reject = fail; }));
    const oldAcknowledgement = h.confirmTerms();
    h.locale.code = "zh";
    h.legalTermsApi.current.mockResolvedValue({ ...h.snapshot, requestedLocale: "zh", resolvedLocale: "zh" });
    await h.loadTerms();
    if (completion === "resolve") resolve({ ...h.snapshot, acknowledged: true });
    else reject(new Error("OLD_ACK_FAILURE"));
    await oldAcknowledgement;
    expect(h.serverTerms.value?.requestedLocale).toBe("zh");
    expect(h.error.value).toBeNull();
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
    expect(h.navBack).not.toHaveBeenCalled();
    expect(h.confirming.value).toBe(false);
  });

  it("ignores an old acknowledgement after switching away and back to the same language", async () => {
    const h = harness();
    let resolve!: (value: any) => void;
    h.legalTermsApi.acknowledge.mockImplementation(() => new Promise((ok) => { resolve = ok; }));
    const oldAcknowledgement = h.confirmTerms();
    h.locale.code = "zh";
    h.legalTermsApi.current.mockResolvedValue({ ...h.snapshot, requestedLocale: "zh", resolvedLocale: "zh" });
    await h.loadTerms();
    h.locale.code = "en";
    h.legalTermsApi.current.mockResolvedValue({ ...h.snapshot, version: "v2" });
    await h.loadTerms();
    resolve({ ...h.snapshot, acknowledged: true });
    await oldAcknowledgement;
    expect(h.serverTerms.value?.version).toBe("v2");
    expect(h.serverTerms.value?.acknowledged).toBe(false);
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
  });

  it.each(["resolvedLocale", "resolvedJurisdiction"])("rejects an acknowledgement for a different %s", async (field) => {
    const h = harness();
    h.legalTermsApi.acknowledge.mockResolvedValue({ ...h.snapshot, acknowledged: true,
      [field]: field === "resolvedLocale" ? "zh" : "VN" });
    await h.confirmTerms();
    expect(h.serverTerms.value?.acknowledged).toBe(false);
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
    expect(h.navBack).not.toHaveBeenCalled();
  });

  it("records a matching acknowledgement of the displayed fallback document", async () => {
    const h = harness();
    h.locale.code = "vi";
    h.serverTerms.value = { ...h.snapshot, requestedLocale: "vi", resolvedLocale: "en" };
    h.legalTermsApi.acknowledge.mockResolvedValue({ ...h.snapshot, acknowledged: true });
    await h.confirmTerms();
    expect(h.recordLegalTermsAcknowledged).toHaveBeenCalledOnce();
    expect(h.error.value).toBeNull();
    expect(h.navBack).toHaveBeenCalledWith("/pages/me/me");
  });

  it.each(["resolve", "reject"])("discards acknowledgement %s after leaving the page", async (completion) => {
    const h = harness();
    let resolve!: (value: any) => void;
    let reject!: (reason: Error) => void;
    h.legalTermsApi.acknowledge.mockImplementation(() => new Promise((ok, fail) => { resolve = ok; reject = fail; }));
    const acknowledgement = h.confirmTerms();
    h.hideTermsPage();
    if (completion === "resolve") resolve({ ...h.snapshot, acknowledged: true });
    else reject(new Error("HIDDEN_ACK_FAILURE"));
    await acknowledgement;
    expect(h.serverTerms.value).toBeNull();
    expect(h.error.value).toBeNull();
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
    expect(h.navBack).not.toHaveBeenCalled();
  });

  it("discards a hidden read and starts a fresh read when shown again", async () => {
    const h = harness();
    let resolve!: (value: any) => void;
    h.legalTermsApi.current.mockImplementationOnce(() => new Promise((ok) => { resolve = ok; }));
    const read = h.loadTerms();
    await Promise.resolve();
    h.hideTermsPage();
    await h.loadTerms();
    expect(h.legalTermsApi.current).toHaveBeenCalledOnce();
    resolve({ ...h.snapshot, acknowledged: true });
    await read;
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
    expect(h.serverTerms.value).toBeNull();
    h.legalTermsApi.current.mockResolvedValue({ ...h.snapshot, version: "v2" });
    h.showTermsPage();
    await vi.waitFor(() => expect(h.loadingTerms.value).toBe(false));
    expect(h.legalTermsApi.current).toHaveBeenCalledTimes(2);
    expect(h.serverTerms.value?.version).toBe("v2");
    expect(source).toContain("onHide(hideTermsPage)");
    expect(source).toContain("onUnmounted(hideTermsPage)");
    expect(source).toContain("onShow(showTermsPage)");
  });

  it("permits a fresh confirmation after returning while the old command is pending", async () => {
    const h = harness();
    let resolveOld!: (value: any) => void;
    let resolveNew!: (value: any) => void;
    h.legalTermsApi.acknowledge
      .mockImplementationOnce(() => new Promise((ok) => { resolveOld = ok; }))
      .mockImplementationOnce(() => new Promise((ok) => { resolveNew = ok; }));
    const oldAcknowledgement = h.confirmTerms();
    h.hideTermsPage();
    h.legalTermsApi.current.mockResolvedValue({ ...h.snapshot, version: "v2" });
    h.showTermsPage();
    await vi.waitFor(() => expect(h.loadingTerms.value).toBe(false));
    const newAcknowledgement = h.confirmTerms();
    expect(h.legalTermsApi.acknowledge).toHaveBeenCalledTimes(2);
    resolveOld({ ...h.snapshot, acknowledged: true });
    await oldAcknowledgement;
    expect(h.confirming.value).toBe(true);
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
    resolveNew({ ...h.snapshot, version: "v2", acknowledged: true });
    await newAcknowledgement;
    expect(h.confirming.value).toBe(false);
    expect(h.recordLegalTermsAcknowledged).toHaveBeenCalledOnce();
    expect(h.navBack).toHaveBeenCalledOnce();
  });

  it("permits confirmation of a new language while the previous language command is pending", async () => {
    const h = harness();
    let resolveOld!: (value: any) => void;
    let resolveNew!: (value: any) => void;
    h.legalTermsApi.acknowledge
      .mockImplementationOnce(() => new Promise((ok) => { resolveOld = ok; }))
      .mockImplementationOnce(() => new Promise((ok) => { resolveNew = ok; }));
    const oldAcknowledgement = h.confirmTerms();
    h.locale.code = "zh";
    const chinese = { ...h.snapshot, requestedLocale: "zh", resolvedLocale: "zh" };
    h.legalTermsApi.current.mockResolvedValue(chinese);
    await h.loadTerms();
    const newAcknowledgement = h.confirmTerms();
    expect(h.legalTermsApi.acknowledge).toHaveBeenCalledTimes(2);
    resolveOld({ ...h.snapshot, acknowledged: true });
    await oldAcknowledgement;
    expect(h.confirming.value).toBe(true);
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
    resolveNew({ ...chinese, acknowledged: true });
    await newAcknowledgement;
    expect(h.confirming.value).toBe(false);
    expect(h.recordLegalTermsAcknowledged).toHaveBeenCalledOnce();
    expect(h.navBack).toHaveBeenCalledOnce();
  });

  it.each([en, zh, viMessages])("blocks consent until a failed account language write is retried", async (messages) => {
    const h = harness(messages);
    const failed = Promise.reject(new Error("PROFILE_LANGUAGE_SYNC_FAILED"));
    h.pendingProfileLocaleHydration.mockReturnValue(failed);
    await h.loadTerms();
    expect(h.error.value).toBe(messages.terms.languageSyncFailed);
    expect(h.serverTerms.value).toBeNull();
    await h.confirmTerms();
    expect(h.legalTermsApi.current).not.toHaveBeenCalled();
    expect(h.legalTermsApi.acknowledge).not.toHaveBeenCalled();
    expect(h.navBack).not.toHaveBeenCalled();

    let saved!: () => void;
    h.retryCurrentProfileLocale.mockImplementation(() => {
      h.pendingProfileLocaleHydration.mockReturnValue(new Promise<void>((resolve) => { saved = resolve; }));
    });
    h.retryTerms();
    await Promise.resolve();
    expect(h.retryCurrentProfileLocale).toHaveBeenCalledOnce();
    expect(h.legalTermsApi.current).not.toHaveBeenCalled();
    saved();
    await vi.waitFor(() => expect(h.loadingTerms.value).toBe(false));
    expect(h.error.value).toBeNull();
    expect(h.legalTermsApi.current).toHaveBeenCalledExactlyOnceWith("en", "GLOBAL", true);
    h.legalTermsApi.acknowledge.mockResolvedValue({ ...h.snapshot, acknowledged: true });
    await h.confirmTerms();
    expect(h.legalTermsApi.acknowledge).toHaveBeenCalledOnce();
    expect(h.navBack).toHaveBeenCalledOnce();
  });

  it("passes keyboard events to every activation handler and rejects repeat events", () => {
    for (const handler of ["goBack", "retryTerms", "goRisk", "confirmTerms"]) {
      expect(source).toContain(`@keydown.enter.prevent="${handler}($event)"`);
    }
    expect(source).toContain('@keydown.space.prevent="goBack($event)"');
    expect(source).toContain('@keydown.space.prevent="retryTerms($event)"');
    expect(source).toContain('@keydown.space.prevent="confirmTerms($event)"');
    expect(source).toContain("function repeatedKeyboardActivation(event?: Event)");
  });
});
