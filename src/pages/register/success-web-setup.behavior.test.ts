import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as Vue from "vue";
import ts from "typescript";
import source from "./success.vue?raw";
import { ApiError } from "@/api/errors";
import { remoteAccountScope } from "@/lib/remote-account-epoch";
import { calibrationBelongsTo } from "@/lib/phone-calibration-flow";
import { confirmInitialWebPhoneDeferral } from "@/lib/defer-phone-activation";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";

const api = vi.hoisted(() => ({ result: vi.fn(), defer: vi.fn(), fleet: vi.fn() }));
vi.mock("@/api/runtime", () => ({ onboardingCalibrationApi: api, deviceE3Api: { fleet: api.fleet } }));
const persisted = () => ({ userId: 42, deviceId: "browser-install-42", serverCanonical: true, source: "server",
  sourceEnvironment: "PRODUCTION", runId: "", revision: 0, configRevision: 0, activationStatus: "DEFERRED",
  calibrationAvailable: false, score: null, tier: null, tierName: null, tops: null, baseRateUsdt: null,
  baseRateNex: null, signals: null, comparisonConfig: [], userDeviceId: null });
const missing = () => new ApiError({ kind: "http", status: 404, code: 404, message: "ONBOARDING_CALIBRATION_NOT_FOUND" });
const h5 = source.split('<script setup lang="ts">')[1].split("</script>")[0]
  .replace(/\/\/ #ifdef H5\r?\n([\s\S]*?)\/\/ #endif/g, (_all, body: string) => body)
  .replace(/\/\/ #ifndef H5\r?\n([\s\S]*?)\/\/ #endif/g, "");
const ast = ts.createSourceFile("success.ts", h5, ts.ScriptTarget.ES2022, true);
const names = ["webSetupAvailable", "setupBusy", "setupError", "setupGeneration", "setupCommand", "deferForWeb"];
const selected = ast.statements.filter(statement => ts.isFunctionDeclaration(statement)
  ? statement.name?.text === "deferForWeb"
  : ts.isVariableStatement(statement) ? statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(ast)))
  : ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) && statement.expression.expression.getText(ast) === "onHide");
const script = ts.transpileModule(selected.map(statement => statement.getText(ast)).join("\n")
  + "\nreturn { webSetupAvailable, setupBusy, setupError, deferForWeb };", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
type State = { webSetupAvailable: Vue.ComputedRef<boolean>; setupBusy: Vue.Ref<boolean>; setupError: Vue.Ref<string>; deferForWeb: () => Promise<void> };
function page(messages = zh, setup = true, download = false) {
  const auth = Vue.reactive({ isAuthenticated: true, accountId: "user:42", completeOnboarding: vi.fn(() => true) });
  let deviceId = "browser-install-42";
  const navBack = vi.fn(), navReset = vi.fn(), secureKey = vi.fn(() => "fixed-page-command");
  let hide!: () => void;
  const context = { ref: Vue.ref, computed: Vue.computed, remoteApiEnabled: true, auth,
    downloadOnly: Vue.ref(download), setupOnly: Vue.ref(setup), successVisible: Vue.ref(true),
    t: Vue.ref(messages), remoteAccountScope, getDeviceId: () => deviceId,
    sessionVault: { read: () => ({ user: { userId: Number(auth.accountId.slice(5)) } }) },
    calibrationBelongsTo, confirmInitialWebPhoneDeferral, requireCryptoUuid: secureKey,
    navBack, navReset, onHide: (callback: () => void) => { hide = callback; } };
  const state = new Function("context", `const { ${Object.keys(context).join(", ")} } = context;\n${script}`)(context) as State;
  return { state, auth, navBack, navReset, secureKey, hide: () => hide(), changeDevice: () => { deviceId = "other-install"; } };
}
beforeEach(() => { vi.resetAllMocks(); remoteAccountScope.bind("user:42");
  api.fleet.mockResolvedValue({ serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", devices: [] }); });
afterEach(() => vi.restoreAllMocks());

test("ordinary loading/download guide does not write or complete setup", async () => {
  const view = page();
  expect(view.state.webSetupAvailable.value).toBe(true);
  expect(api.result).not.toHaveBeenCalled(); expect(api.defer).not.toHaveBeenCalled();
  expect(view.auth.completeOnboarding).not.toHaveBeenCalled();
  const download = page(zh, false, true);
  await download.state.deferForWeb();
  expect(api.result).not.toHaveBeenCalled(); expect(api.defer).not.toHaveBeenCalled();
  expect(source).toContain('@click="deferForWeb"');
  expect(source).toContain("webSetupAvailable ? t.register.webSetupBrowse");
});
test("double click writes one command and completes only after persistent GET, returning to the same funds page", async () => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  api.result.mockRejectedValueOnce(missing()).mockImplementationOnce(async () => { await wait; return persisted(); });
  api.defer.mockResolvedValue(persisted());
  const view = page();
  const pending = view.state.deferForWeb();
  await view.state.deferForWeb();
  await vi.waitFor(() => expect(api.result).toHaveBeenCalledTimes(2));
  expect(view.state.setupBusy.value).toBe(true);
  expect(view.auth.completeOnboarding).not.toHaveBeenCalled(); expect(view.navBack).not.toHaveBeenCalled();
  release(); await pending;
  expect(api.defer).toHaveBeenCalledExactlyOnceWith("browser-install-42", 0, "web-initial-defer:fixed-page-command");
  expect(view.auth.completeOnboarding).toHaveBeenCalledOnce();
  expect(view.navBack).toHaveBeenCalledExactlyOnceWith("/pages/me/wallet-topup");
  expect(view.navReset).not.toHaveBeenCalled();
});
test("normal registration and refresh restore existing DEFERRED without another write", async () => {
  api.result.mockResolvedValue(persisted());
  for (let refresh = 0; refresh < 2; refresh++) {
    const view = page(zh, false); await view.state.deferForWeb();
    expect(view.auth.completeOnboarding).toHaveBeenCalledOnce();
    expect(view.navReset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: "/pages/index/index" }));
  }
  expect(api.defer).not.toHaveBeenCalled();
});
test.each([zh, en, vietnamese])("a failed readback stays incomplete with translated retry guidance", async messages => {
  api.result.mockRejectedValueOnce(missing()).mockRejectedValueOnce(new ApiError({ kind: "http", status: 503, message: "NO_READBACK" }));
  api.defer.mockResolvedValueOnce(persisted());
  const view = page(messages); await view.state.deferForWeb();
  expect(view.state.setupError.value).toBe(messages.register.webSetupFailed);
  expect(view.auth.completeOnboarding).not.toHaveBeenCalled(); expect(view.navBack).not.toHaveBeenCalled();
  api.result.mockResolvedValueOnce(persisted());
  await view.state.deferForWeb();
  expect(view.auth.completeOnboarding).toHaveBeenCalledOnce(); expect(api.defer).toHaveBeenCalledOnce();
});
test.each(["account", "same-account-epoch", "device", "hide"])("late readback after %s does not complete or navigate", async change => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  api.result.mockImplementation(async () => { await wait; return persisted(); });
  const view = page(); const pending = view.state.deferForWeb();
  if (change === "account") { view.auth.accountId = "user:7"; remoteAccountScope.bind("user:7"); }
  if (change === "same-account-epoch") remoteAccountScope.bind("user:42");
  if (change === "device") view.changeDevice();
  if (change === "hide") view.hide();
  release(); await pending;
  expect(view.state.setupBusy.value).toBe(false);
  expect(view.auth.completeOnboarding).not.toHaveBeenCalled();
  expect(view.navBack).not.toHaveBeenCalled(); expect(view.navReset).not.toHaveBeenCalled(); expect(api.defer).not.toHaveBeenCalled();
});
test("lost uncommitted reply retries the same explicit command, never on its own", async () => {
  api.result.mockRejectedValue(missing()); api.defer.mockRejectedValueOnce(new ApiError({ kind: "network", message: "LOST_REPLY" }));
  const view = page(); await view.state.deferForWeb();
  expect(api.defer).toHaveBeenCalledOnce(); expect(view.auth.completeOnboarding).not.toHaveBeenCalled();
  api.result.mockRejectedValueOnce(missing()).mockResolvedValueOnce(persisted()); api.defer.mockResolvedValueOnce(persisted());
  await view.state.deferForWeb();
  expect(api.defer).toHaveBeenCalledTimes(2);
  expect(api.defer.mock.calls[1]).toEqual(api.defer.mock.calls[0]);
  expect(view.secureKey).toHaveBeenCalledOnce(); expect(view.auth.completeOnboarding).toHaveBeenCalledOnce();
});
test.each([zh, en, vietnamese])("an already ACTIVE phone displays read-only guidance without stopping it", async messages => {
  api.result.mockResolvedValue({ ...persisted(), activationStatus: "ACTIVE", userDeviceId: 12 });
  const view = page(messages); await view.state.deferForWeb();
  expect(view.state.setupError.value).toBe(messages.register.webSetupReadOnly);
  expect(api.defer).not.toHaveBeenCalled(); expect(view.auth.completeOnboarding).not.toHaveBeenCalled();
});
