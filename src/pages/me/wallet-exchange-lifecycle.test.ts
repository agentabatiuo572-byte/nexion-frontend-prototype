import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import ts from "typescript";
import { parse } from "@vue/compiler-sfc";
import page from "./wallet-exchange.vue?raw";
import { canShowExchangeToast } from "@/lib/exchange-scope-toast";

const source = ts.createSourceFile("exchange.ts", parse(page).descriptor.scriptSetup!.content,
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function functionSource(name: string) {
  const node = source.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === name);
  if (!node) throw new Error(`Missing actual page function: ${name}`);
  return node.getText(source);
}
const lifecycle = source.statements.filter(s => ts.isExpressionStatement(s) && ts.isCallExpression(s.expression)
  && ["onShow", "onHide", "onUnmounted"].includes(s.expression.expression.getText(source)))
  .map(s => s.getText(source)).join("\n");
const code = ts.transpileModule(`
  let exchangeMounted = true, exchangePageEpoch = 0, pendingRecoveryGeneration = 0;
  let rateTimer = null, agoTimer = null;
  ${functionSource("captureExchangeScope")}
  ${functionSource("remoteScopeCurrent")}
  ${functionSource("toastIfRemoteScopeCurrent")}
  ${functionSource("refreshExchangeScope")}
  ${lifecycle}
  return { captureExchangeScope, remoteScopeCurrent, refreshExchangeScope,
    timers: () => [rateTimer, agoTimer] };
`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function setup() {
  const show: (() => void)[] = [], hide: (() => void)[] = [], unmount: (() => void)[] = [];
  const account = { accountKey: "user-7", epoch: 1 }, runtime = { epoch: 1 };
  const state = ref<unknown>({ wallet: { usdtAvailable: 10 } });
  const deps = {
    captureAccountScope: () => ({ ...account }),
    isCurrentAccountScope: (scope: typeof account) => scope.accountKey === account.accountKey && scope.epoch === account.epoch,
    captureRuntimeRevision: () => ({ ...runtime }), isCurrentRuntimeRevision: (scope: typeof runtime) => scope.epoch === runtime.epoch,
    canShowExchangeToast, app: account, remoteApiEnabled: true,
    onShow: (fn: () => void) => show.push(fn), onHide: (fn: () => void) => hide.push(fn),
    onUnmounted: (fn: () => void) => unmount.push(fn),
    setInterval, clearInterval, pendingExchangeRevision: ref(0), recoveringExchange: ref(false),
    remoteSnapshotReceivedAt: ref(100), secsAgo: ref(0), remoteError: ref<string | null>(null),
    syncRemoteState: vi.fn().mockResolvedValue(true), invalidateRemoteReads: vi.fn(),
    commitRemoteSnapshot: vi.fn((value: unknown) => { state.value = value; }),
    unsubscribeExchangeRuntime: vi.fn(), toast: { error: vi.fn() },
    t: ref({ exchange: { remoteUnavailableToast: "unavailable" } }),
  };
  const actual = new Function(...Object.keys(deps), code)(...Object.values(deps)) as {
    captureExchangeScope(): typeof account & { pageEpoch: number };
    remoteScopeCurrent(scope: typeof account & { pageEpoch: number }, run: typeof runtime): boolean;
    refreshExchangeScope(): void; timers(): unknown[];
  };
  return { actual, deps, state, account, runtime, show: () => show.forEach(fn => fn()),
    hide: () => hide.forEach(fn => fn()), unmount: () => unmount.forEach(fn => fn()) };
}

afterEach(() => vi.useRealTimers());
describe("actual exchange page visibility lifecycle", () => {
  it("stops polling on hide and restarts one timer pair with a fresh read on show", () => {
    vi.useFakeTimers(); const s = setup();
    s.show(); expect(vi.getTimerCount()).toBe(2); expect(s.deps.syncRemoteState).toHaveBeenCalledTimes(1);
    s.hide(); expect(vi.getTimerCount()).toBe(0); expect(s.state.value).toBeNull();
    vi.advanceTimersByTime(30_000); expect(s.deps.syncRemoteState).toHaveBeenCalledTimes(1);
    s.show(); expect(vi.getTimerCount()).toBe(2); expect(s.deps.syncRemoteState).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(15_000); expect(s.deps.syncRemoteState).toHaveBeenCalledTimes(3);
    s.unmount(); expect(vi.getTimerCount()).toBe(0); expect(s.deps.unsubscribeExchangeRuntime).toHaveBeenCalledOnce();
  });
  it("permanently invalidates a prompt or read captured before hiding, even after returning", () => {
    vi.useFakeTimers(); const s = setup(); s.show();
    const scope = s.actual.captureExchangeScope(), run = { ...s.runtime };
    expect(s.actual.remoteScopeCurrent(scope, run)).toBe(true);
    s.hide(); expect(s.actual.remoteScopeCurrent(scope, run)).toBe(false);
    s.show(); expect(s.actual.remoteScopeCurrent(scope, run)).toBe(false);
    expect(s.actual.remoteScopeCurrent(s.actual.captureExchangeScope(), run)).toBe(true);
    s.unmount(); expect(s.actual.remoteScopeCurrent(s.actual.captureExchangeScope(), run)).toBe(false);
  });
  it("clears stale wallet authority on account/runtime changes and only refreshes a visible page", () => {
    vi.useFakeTimers(); const s = setup(); s.show(); const old = s.actual.captureExchangeScope();
    s.account.epoch++; s.runtime.epoch++; s.actual.refreshExchangeScope();
    expect(s.actual.remoteScopeCurrent(old, { epoch: 1 })).toBe(false);
    expect(s.state.value).toBeNull(); expect(s.deps.syncRemoteState).toHaveBeenCalledTimes(2);
    s.hide(); s.actual.refreshExchangeScope(); expect(s.deps.syncRemoteState).toHaveBeenCalledTimes(2);
    s.unmount();
  });
});
