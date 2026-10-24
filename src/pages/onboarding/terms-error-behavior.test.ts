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
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
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

  it("renders the effective date and version from the same server snapshot", () => {
    expect(source).toContain("`${serverTerms.effectiveAt} · ${serverTerms.version}`");
    expect(source).not.toContain("`${t.terms.effectiveLabel} · ${serverTerms.version}`");
    expect(source).not.toContain("`${serverTerms.summary} · ${serverTerms.effectiveAt}`");
  });

  it("changes an existing error with the selected locale", async () => {
    const h = harness();
    h.legalTermsApi.current.mockRejectedValue(new Error("load failed"));
    await h.loadTerms();
    expect(h.error.value).toBe(en.terms.loadFailed);
    h.t.value = zh;
    expect(h.error.value).toBe(zh.terms.loadFailed);
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
    expect(h.recordLegalTermsAcknowledged).not.toHaveBeenCalled();
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

it.each([false,true])('document return never posts an acknowledgement (previous=%s)', async acknowledged => {
 const h=harness(); h.serverTerms.value={...h.snapshot,acknowledged};
 await h.confirmTerms(); expect(h.navBack).toHaveBeenCalledWith('/pages/me/me');
 expect(h.legalTermsApi.acknowledge).not.toHaveBeenCalled();
});
it('a failed document read does not trap the user',async()=>{const h=harness();h.legalTermsApi.current.mockRejectedValue(new Error('unavailable'));await h.loadTerms();await h.confirmTerms();expect(h.navBack).toHaveBeenCalledOnce();expect(h.legalTermsApi.acknowledge).not.toHaveBeenCalled();});
