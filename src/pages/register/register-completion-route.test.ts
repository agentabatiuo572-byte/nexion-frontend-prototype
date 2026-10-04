import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import registerSource from "./register.vue?raw";
import completionSource from "@/auth/complete-sign-in.ts?raw";
import { resolvePostSignInRoute } from "@/auth/post-sign-in-route";

const state = vi.hoisted(() => ({ current: vi.fn(), nav: vi.fn() }));
vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  sessionVault: { read: () => ({ accessToken: "fixture", user: { userId: 7 } }), revision: () => 1 },
  legalTermsApi: { current: (...args: unknown[]) => state.current(...args) },
}));
vi.mock("@/store/locale", () => ({ useLocaleStore: () => ({ code: "zh" }) }));
vi.mock("@/api/order-api", () => ({ captureRuntimeRevision: () => ({ epoch: 1, runId: "" }) }));
vi.mock("@/lib/route", () => ({ navReset: (...args: unknown[]) => state.nav(...args) }));

function functionSource(source: string, names: string[]): string {
  const script = source.includes("<script") ? source.slice(source.indexOf(">", source.indexOf("<script")) + 1, source.indexOf("</script>")) : source;
  const ast = ts.createSourceFile("fixture.ts", script, ts.ScriptTarget.Latest, true);
  return names.map((name) => {
    const node = ast.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
    if (!node) throw new Error(`Missing production function ${name}`);
    return node.getText(ast).replace(/^export\s+/, "");
  }).join("\n");
}

function compile(source: string, dependencies: Record<string, unknown>, result: string) {
  const js = ts.transpileModule(`${source}\nreturn ${result};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(dependencies), js)(...Object.values(dependencies));
}

const unacknowledged = {
  source: "server", sourceEnvironment: "PRODUCTION", runId: "", requestedLocale: "zh", resolvedLocale: "zh",
  requestedJurisdiction: "GLOBAL", resolvedJurisdiction: "GLOBAL", provenance: "fixture",
  version: "v6", acknowledged: false, acknowledgedAt: null,
};

describe("remote registration completion owns its legal return target", () => {
  beforeEach(() => {
    vi.resetModules();
    state.current.mockReset();
    state.nav.mockReset();
    vi.stubGlobal("uni", { showLoading: vi.fn(), hideLoading: vi.fn() });
  });

  it.each([
    [true, false, "/pages/register/success"], [true, true, "/pages/register/success"],
    [false, false, "/pages/onboarding/estimator"], [false, true, "/pages/onboarding/estimator"],
  ])("H5=%s delayed Terms=%s returns to %s even before navigation renders", async (h5, delayed, expected) => {
    const gate = await import("@/lib/legal-terms-gate-runtime");
    let resolve!: (value: typeof unacknowledged) => void;
    if (delayed) state.current.mockReturnValue(new Promise((done) => { resolve = done; }));
    else state.current.mockResolvedValue(unacknowledged);
    const auth = { signIn: vi.fn(() => true), onboardingComplete: false };
    const session = { sessionId: "session", claim: () => ({ requiresRecalibration: false }) };
    const app = { bindAccount: vi.fn(), projectServerIdentity: vi.fn(), refreshHomeTruth: vi.fn(),
      setRemoteTaskForeground: vi.fn() };
    // Execute the production completion body and real Terms runtime. Persistence
    // and account bootstrap are controlled here; route completion is withheld.
    const completeSignIn = compile(functionSource(completionSource, ["completeSignIn"]), {
      useAuth: () => auth, useApp: () => app, useSession: () => session, remoteApiEnabled: true,
      authApi: {}, completedSignIns: new Map(), IDEMPOTENCY_TTL_MS: 600_000,
      rebindAccountScopedStores: vi.fn(), readAccountSessionRecords: () => [{ sessionId: "session" }],
      useProfile: () => ({ projectServerIdentity: vi.fn() }), hydrateCurrentProfileLocale: vi.fn(),
      scheduleLegalTermsGate: gate.scheduleLegalTermsGate, hasPendingLegalTermsRequirement: gate.hasPendingLegalTermsRequirement,
      afterLegalTermsAcknowledged: gate.afterLegalTermsAcknowledged,
      sessionVault: { read: () => ({ user: { userId: 7 } }) }, refreshRemoteFleetAfterCatalog: vi.fn(),
      refreshEarningsReleaseStatus: vi.fn(), resolvePostSignInRoute, navReset: state.nav,
    }, "completeSignIn");
    const conditionalSource = registerSource
      .replace(/\/\/ #ifdef H5\r?\n([\s\S]*?)\/\/ #endif/g, (_all, body) => h5 ? body : "")
      .replace(/\/\/ #ifndef H5\r?\n([\s\S]*?)\/\/ #endif/g, (_all, body) => h5 ? "" : body);
    const registration = { kind: "authenticated", user: { userId: 7, onboardingComplete: false }, vaultRevision: 1 };
    const finish = compile(functionSource(conditionalSource, ["finish", "registrationCompletionDestination", "launchRegistrationSuccess"]), {
      completing: ref(false), error: ref(null), pwdOk: ref(true), pwdMatch: ref(true), remoteApiEnabled: true,
      otpRequestId: ref("challenge"), otpFlowVersion: 1, fullPhone: ref("+8619900009112"), country: ref("+86"),
      phoneClean: ref("19900009112"), codeStr: ref("123456"), password: ref("fixture-only"), authApi: {},
      currentSponsorCode: () => null, isCurrentRemoteRegistrationAttempt: () => true,
      registerAndLogin: vi.fn().mockResolvedValue(registration), completeSignIn, useLocaleStore: () => ({ code: "zh" }),
      stageRemoteRegistrationReceipt: vi.fn(), toast: { success: vi.fn() }, t: ref({ register: { registrationSignedIn: "OK" } }),
      navReset: state.nav,
    }, "finish");
    await finish();
    expect(app.setRemoteTaskForeground).toHaveBeenCalledWith(true);
    expect(state.nav).toHaveBeenCalledWith(expect.objectContaining({ url: expected }));
    await vi.waitFor(() => expect(state.current).toHaveBeenCalledOnce());
    if (delayed) resolve(unacknowledged);
    const termsUrl = `/pages/onboarding/terms?return=${encodeURIComponent(expected)}`;
    await vi.waitFor(() => expect(state.nav).toHaveBeenCalledWith(termsUrl));
    // Reproduce App's one-second tick after the read's finally has run, while
    // native page rendering still reports the old registration form route.
    expect(gate.enforcePendingLegalTermsGate("/pages/register/register")).toBe(true);
    expect(state.nav.mock.calls.filter(([route]) => typeof route === "string")).toEqual([[termsUrl]]);
    expect(state.nav.mock.calls.some(([route]) => typeof route === "string" && route.includes("index%2Findex"))).toBe(false);
    expect(gate.hasPendingLegalTermsRequirement()).toBe(true);
  });
});
