// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import * as Vue from "vue";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { advanceMonotonicHighWater, projectServerNow, readTrustedMonotonicNowMs } from "@/lib/server-deadline-clock";

const source = readFileSync(new URL("./wallet-address-rebind.vue", import.meta.url), "utf8");
const start = source.indexOf("const mockNow = ref(mockServerNow());");
const end = source.indexOf("const freezeLeftMs = computed", start);
if (start < 0 || end <= start) throw new Error("Address page clock implementation missing");
const implementation = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const scopes: Vue.EffectScope[] = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function deferred() {
  let resolve!: (value: boolean) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<boolean>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function setup() {
  const hooks = { mount: [] as Array<() => void>, show: [] as Array<() => void>,
    hide: [] as Array<() => void>, unmount: [] as Array<() => void> };
  const clock = { now: 1000 };
  vi.stubGlobal("performance", { now: () => clock.now });
  const app = Vue.reactive({ accountKey: "A", accountBindingEpoch: 1 });
  const payout = Vue.reactive({
    serverClock: { serverNowEpochMs: 1_800_000_000_000, receivedMonotonicAt: 1000 } as
      { serverNowEpochMs: number; receivedMonotonicAt: number } | null,
    refreshRemote: vi.fn().mockResolvedValue(true),
  });
  const toast = { error: vi.fn() };
  const runtime = { epoch: 1 };
  let tick = () => {};
  const clear = vi.fn();
  const dependencies = {
    ref: Vue.ref, computed: Vue.computed, watch: Vue.watch, payout, app, toast,
    ui: useUI(), confirmationOwner: "clock-fixture",
    t: Vue.ref({ addrRebind: { startFailed: "Read failed" } }), payoutAddressServerEnabled: true,
    mockServerNow: () => Date.now(), readTrustedMonotonicNowMs, advanceMonotonicHighWater, projectServerNow,
    captureRuntimeRevision: () => runtime.epoch, isCurrentRuntimeRevision: (epoch: number) => epoch === runtime.epoch,
    onMounted: (fn: () => void) => hooks.mount.push(fn), onShow: (fn: () => void) => hooks.show.push(fn),
    onHide: (fn: () => void) => hooks.hide.push(fn), onUnmounted: (fn: () => void) => hooks.unmount.push(fn),
    setInterval: (fn: () => void) => { tick = fn; return 7; }, clearInterval: clear, resendTimer: undefined,
  };
  const execute = new Function(...Object.keys(dependencies), `${implementation}; return { projectedServerNow, retryRemoteSnapshot, remoteRefreshPending };`);
  const scope = Vue.effectScope(); scopes.push(scope);
  const page = scope.run(() => execute(...Object.values(dependencies))) as {
    projectedServerNow: Vue.ComputedRef<number | null>; retryRemoteSnapshot: () => Promise<void>;
    remoteRefreshPending: Vue.Ref<boolean>;
  };
  return { page, hooks, clock, app, payout, toast, runtime, tick: () => tick(), clear };
}

describe("address page server clock and read recovery", () => {
  it("renders retry instead of a change entry while time is unknown", async () => {
    const templateStart = source.indexOf('<view v-if="changeBlock === \'withdrawal-in-flight\'"');
    const templateEnd = source.indexOf("<" + "!-- 历史地址", templateStart);
    expect(templateStart).toBeGreaterThan(0);
    expect(templateEnd).toBeGreaterThan(templateStart);
    const render = new Function("Vue", compile(source.slice(templateStart, templateEnd), {
      mode: "function", prefixIdentifiers: true,
    }).code)(Vue);
    for (const pending of [false, true]) {
      const html = await renderToString(Vue.createSSRApp({ render, setup: () => ({
        changeBlock: "time-unknown", remoteRefreshPending: pending,
        t: { addrRebind: { timeStatusUnavailable: "Time unavailable", refreshingStatus: "Refreshing", refreshTimeStatusCta: "Refresh time" } },
        blockBoxStyle: {}, warnTextStyle: {}, retryRemoteSnapshot() {},
      }) }));
      expect(html).toContain("Time unavailable");
      expect(html).toContain("nx-rebind-refresh-time");
      expect(html).toContain(`aria-disabled="${pending}"`);
      expect(html).toContain(pending ? "Refreshing" : "Refresh time");
      expect(html).not.toContain("nx-rebind-change-cta");
    }
  });

  it("executes the SFC clock independent of forward and backward device wall time", async () => {
    const s = setup(); s.hooks.mount[0](); await Promise.resolve();
    vi.spyOn(Date, "now").mockReturnValue(9_000_000_000_000);
    s.clock.now = 6000; s.tick();
    expect(s.page.projectedServerNow.value).toBe(1_800_000_005_000);
    vi.spyOn(Date, "now").mockReturnValue(0);
    s.clock.now = 2000; s.tick();
    expect(s.page.projectedServerNow.value).toBe(1_800_000_005_000);
  });

  it.each([undefined, { now: () => NaN }, { now: () => { throw new Error("clock lost"); } }])(
    "closes after clock loss and requires a new anchor to recover (%s)", async (broken) => {
      const s = setup(); s.hooks.mount[0](); await Promise.resolve();
      vi.stubGlobal("performance", broken); s.tick();
      expect(s.page.projectedServerNow.value).toBeNull();
      vi.stubGlobal("performance", { now: () => 50 }); s.tick();
      expect(s.page.projectedServerNow.value).toBeNull();
      s.payout.serverClock = { serverNowEpochMs: 1_800_000_010_000, receivedMonotonicAt: 50 };
      expect(s.page.projectedServerNow.value).toBe(1_800_000_010_000);
    },
  );

  it("resets the high-water mark when a fresh snapshot has a new clock origin", async () => {
    const s = setup(); s.hooks.mount[0](); await Promise.resolve();
    s.clock.now = 1_000_000; s.tick();
    s.clock.now = 10;
    s.payout.serverClock = { serverNowEpochMs: 1_800_000_001_000, receivedMonotonicAt: 10 };
    expect(s.page.projectedServerNow.value).toBe(1_800_000_001_000);
    s.clock.now = 9; s.tick();
    expect(s.page.projectedServerNow.value).toBeNull();
  });

  it("deduplicates reads and restores retry after false or rejected failures", async () => {
    const s = setup(); const first = deferred();
    s.payout.refreshRemote.mockReturnValueOnce(first.promise);
    s.hooks.show[0](); s.hooks.mount[0]();
    expect(s.payout.refreshRemote).toHaveBeenCalledTimes(1);
    expect(s.page.remoteRefreshPending.value).toBe(true);
    first.resolve(false); await first.promise; await Promise.resolve();
    expect(s.toast.error).toHaveBeenCalledTimes(1);
    expect(s.page.remoteRefreshPending.value).toBe(false);
    s.payout.refreshRemote.mockRejectedValueOnce(new Error("network"));
    await s.page.retryRemoteSnapshot();
    expect(s.toast.error).toHaveBeenCalledTimes(2);
    expect(s.page.remoteRefreshPending.value).toBe(false);
  });

  it("ignores a hidden page's failure without clearing the new visible request", async () => {
    const s = setup(); const old = deferred(); const fresh = deferred();
    s.payout.refreshRemote.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    s.hooks.mount[0](); s.hooks.hide[0](); s.hooks.show[0]();
    old.resolve(false); await old.promise; await Promise.resolve();
    expect(s.toast.error).not.toHaveBeenCalled();
    expect(s.page.remoteRefreshPending.value).toBe(true);
    fresh.resolve(true); await fresh.promise; await Promise.resolve();
    expect(s.page.remoteRefreshPending.value).toBe(false);
  });

  it.each(["account", "runtime", "unmount"] as const)("drops late read errors after %s changes", async (boundary) => {
    const s = setup(); const old = deferred(); s.payout.refreshRemote.mockReturnValueOnce(old.promise);
    s.hooks.mount[0]();
    if (boundary === "account") s.app.accountBindingEpoch += 1;
    if (boundary === "runtime") s.runtime.epoch += 1;
    if (boundary === "unmount") s.hooks.unmount[0]();
    old.reject(new Error("stale")); await old.promise.catch(() => {}); await Promise.resolve();
    expect(s.toast.error).not.toHaveBeenCalled();
    expect(s.page.remoteRefreshPending.value).toBe(false);
    if (boundary === "unmount") expect(s.clear).toHaveBeenCalledWith(7);
  });
});


import { createPinia, setActivePinia } from 'pinia';
import { createPayoutAddressApi } from '@/api/payout-address-api';
import { asApiError } from '@/api/errors';
import { formatClock, isChainAddressValid, maskAddressMid } from '@/store/payout-address-core';
import { deadlineRemainingMs } from '@/lib/server-deadline-clock';

const boundary = vi.hoisted(() => ({ app: null as any, runtimeEpoch: 1, payoutAddressApi: {} as any }));
vi.mock('@/api/runtime', () => ({ payoutAddressServerEnabled: true, payoutAddressApi: boundary.payoutAddressApi }));
vi.mock('@/store/app', () => ({ useApp: () => boundary.app }));
vi.mock('@/store/account-scoped-storage', () => ({ readAccountRow: () => null, writeAccountRow: () => true }));
vi.mock('@/store/risk-identity', () => ({ recordWithdrawAddressUse: vi.fn() }));
vi.mock('@/lib/money-receipt', () => ({ postMoneyBillsOnce: () => { throw new Error('FUNDS_NOT_ALLOWED'); } }));
vi.mock('@/api/order-api', () => ({ captureRuntimeRevision: () => boundary.runtimeEpoch, isCurrentRuntimeRevision: (v: number) => v === boundary.runtimeEpoch }));
const { usePayoutAddress } = await import('@/store/payout-address');
const { useUI, confirm: uiConfirm, toast } = await import('@/store/ui');

const rawScript = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
if (!rawScript) throw new Error('REAL_SFC_SCRIPT_MISSING');
const ast = ts.createSourceFile('wallet-address-rebind.ts', rawScript, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const script = ast.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(ast)).join('\n');
const addressScopeImplementation = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const effects: Vue.EffectScope[] = [];
const proof = { source: 'server', sourceEnvironment: 'PRODUCTION', runId: '', serverCanonical: true };
const address = (letter: string) => `T${letter.repeat(33)}`;
function row(letter = 'A') { return { ...proof, network: 'USDT-TRC20', address: address(letter), status: 'ACTIVE', createdAt: '2026-01-01T00:00:00', effectiveAt: '2026-01-01T00:00:00', nextChangeAllowedAt: '2026-01-01T00:00:00', changePending: false }; }
function snapshot() { return { ...proof, addresses: [row()], serverNowEpochMs: 1_800_000_000_000, changeCooldownDays: 7, effectiveDelayHours: 24, inFlightWithdrawalBlocked: true }; }
function addressScopeDeferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
async function flush() { for (let i=0;i<8;i++) await Promise.resolve(); await Vue.nextTick(); }

beforeEach(() => { setActivePinia(createPinia()); boundary.runtimeEpoch=1; boundary.app=Vue.reactive({ accountKey: 'A', accountBindingEpoch: 1, inFlightWithdrawals: [] }); vi.stubGlobal('performance', { now: () => 100 }); vi.stubGlobal('fetch', () => { throw new Error('NETWORK_NOT_ALLOWED'); }); });
afterEach(() => { effects.splice(0).forEach(s => s.stop()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function addressScopeSetup() {
  const writes: any[] = [];
  const request = vi.fn(async (input: any) => {
    if(input.method === 'GET') return snapshot();
    if(input.method === 'PUT') { writes.push({ account: boundary.app.accountKey, epoch: boundary.app.accountBindingEpoch, ...input }); return row('B'); }
    throw new Error('UNEXPECTED_CONTROLLED_REQUEST');
  });
  Object.assign(boundary.payoutAddressApi, createPayoutAddressApi({ request } as any, 'prod'));
  const payout = usePayoutAddress(); payout.bindAccount('A'); await flush();
  const hooks = { hide: [] as Function[], show: [] as Function[], unmount: [] as Function[] };
  const dict = { changeConfirmTitle: 'Change', changeConfirmBody: 'Cooldown {days}', changeConfirmYes: 'Yes', startFailed: 'Failed', inFlightBlocked: 'Blocked' };
  const dependencies = {
    computed: Vue.computed, ref: Vue.ref, watch: Vue.watch, nextTick: Vue.nextTick, getCurrentInstance: () => ({ uid: 17 }),
    onLoad: () => {}, onMounted: () => {}, onUnmounted: (f: Function) => hooks.unmount.push(f), onHide: (f: Function) => hooks.hide.push(f), onShow: (f: Function) => hooks.show.push(f),
    captureRuntimeRevision: () => boundary.runtimeEpoch, isCurrentRuntimeRevision: (v: number) => v===boundary.runtimeEpoch,
    payoutAddressServerEnabled: true, asApiError, useT: () => Vue.ref({ addrRebind: dict }), fmt: (s: string, values: any) => s?.replace(/\{(\w+)\}/g, (_,k) => String(values[k] ?? '')),
    useApp: () => boundary.app, usePayoutAddress: () => payout, useUI, useConfig: () => ({ config: { withdrawRules: { rebindCooldownDays: 7, newAddressHoldHours: 24 } } }),
    uiConfirm, toast, navBack: vi.fn(), navTo: vi.fn(), mockServerNow: () => 1_800_000_000_000,
    otpSend: () => { throw new Error('OTP_NOT_ALLOWED'); }, otpVerify: () => { throw new Error('OTP_NOT_ALLOWED'); },
    formatClock, isChainAddressValid, maskAddressMid, advanceMonotonicHighWater, deadlineRemainingMs, projectServerNow, readTrustedMonotonicNowMs,
    setInterval: () => 5, clearInterval: () => {},
  };
  const execute = new Function(...Object.keys(dependencies), `${addressScopeImplementation}; return { confirmOtp, applyAfterOtp, startChange, otpCode, otpRequestId, otpCommandKey, otpVerifying, newAddress, explicitStep, mode };`);
  const effect = Vue.effectScope(); effects.push(effect);
  const page = effect.run(() => execute(...Object.values(dependencies))) as any;
  page.startChange(); expect(page.mode.value).toBe('change');
  page.newAddress.value=address('B'); page.otpRequestId.value='PAYOUT-FIXTURE1'; page.otpCode.value='123456'; page.otpCommandKey.value='payout-address:original-fixture-key';
  return { page, payout, hooks, writes, request, ui: useUI() };
}
function accept(ui: ReturnType<typeof useUI>, ok=true) { const queued=ui.confirmQueue[0]; expect(queued).toBeDefined(); ui.resolveConfirm(queued.id,ok); }
function rebind(s: Awaited<ReturnType<typeof addressScopeSetup>>, account: string) { boundary.app.accountKey=account; boundary.app.accountBindingEpoch++; s.payout.bindAccount(account); }
describe('real address SFC + real store/parser controlled boundary', () => {
  it('page cancellation settles only its owner and preserves a foreign draft', async () => {
    const s=await addressScopeSetup(); const pending=s.page.confirmOtp();
    const foreign=s.ui.confirm({ title:'Foreign', owner:'other-page' });
    s.hooks.hide.forEach(f=>f()); await pending;
    expect(s.writes).toHaveLength(0); expect(s.ui.confirmQueue).toHaveLength(1);
    expect(s.ui.confirmQueue[0].owner).toBe('other-page');
    s.ui.resolveConfirm(s.ui.confirmQueue[0].id,false); await expect(foreign).resolves.toBe(false);
  });
  it.each(['hide','same-account-rebind','runtime'])(`rejects a confirmed microtask after %s`, async boundaryName => {
    const s=await addressScopeSetup(); const pending=s.page.confirmOtp(); accept(s.ui);
    if(boundaryName==='hide') s.hooks.hide.forEach(f=>f());
    if(boundaryName==='same-account-rebind') rebind(s,'A');
    if(boundaryName==='runtime') boundary.runtimeEpoch++;
    await pending; expect(s.writes).toHaveLength(0);
  });
  it('double click makes one confirmation and one command', async () => {
    const s=await addressScopeSetup(); const first=s.page.confirmOtp(); const second=s.page.confirmOtp();
    expect(s.ui.confirmQueue).toHaveLength(1); accept(s.ui); await Promise.all([first,second]);
    expect(s.writes).toHaveLength(1);
  });
  it('unknown retry sends the same original key and exact body', async () => {
    const s=await addressScopeSetup(); let call=0;
    s.request.mockImplementation(async(input:any)=> { if(input.method==='GET') return snapshot(); s.writes.push(input); if(++call===1) throw new Error('CONTROLLED_TIMEOUT'); return row('B'); });
    const first=s.page.confirmOtp(); accept(s.ui); await first;
    const second=s.page.confirmOtp(); accept(s.ui); await second;
    expect(s.writes).toHaveLength(2); expect(s.writes[1]).toEqual(s.writes[0]);
    expect(s.writes[0].idempotencyKey).toBe('payout-address:original-fixture-key');
    expect(s.page.explicitStep.value).toBe('success');
  });
  it.each(['ack','unknown'])(`late dispatched %s keeps the new page free of feedback and retains original key`, async outcome => {
    const s=await addressScopeSetup(); const response=addressScopeDeferred<any>();
    s.request.mockImplementation(async(input:any)=> { if(input.method==='GET') return snapshot(); s.writes.push(input); return response.promise; });
    const pending=s.page.confirmOtp(); accept(s.ui); await flush(); expect(s.writes).toHaveLength(1);
    s.hooks.hide.forEach(f=>f()); s.hooks.show.forEach(f=>f());
    if(outcome==='ack') response.resolve(row('B')); else response.reject(new Error('CONTROLLED_TIMEOUT'));
    await pending; expect(s.ui.toasts).toHaveLength(0); expect(s.page.explicitStep.value).not.toBe('success');
    expect(s.page.otpCommandKey.value).toBe('payout-address:original-fixture-key');
  });
  it.each(['account','same-account-rebind','hide','hide-show','unmount'])(`rejects old confirmation after %s`, async boundaryName => {
    const s=await addressScopeSetup(); const pending=s.page.confirmOtp(); expect(s.ui.confirmQueue).toHaveLength(1);
    if(boundaryName==='account') rebind(s,'B');
    if(boundaryName==='same-account-rebind') rebind(s,'A');
    if(boundaryName==='hide'||boundaryName==='hide-show') s.hooks.hide.forEach(f=>f());
    if(boundaryName==='hide-show') s.hooks.show.forEach(f=>f());
    if(boundaryName==='unmount') s.hooks.unmount.forEach(f=>f());
    if(s.ui.confirmQueue.length) accept(s.ui); await pending; await flush();
    console.log(JSON.stringify({ boundaryName, dispatched: s.writes.map(w=>({ account:w.account,epoch:w.epoch,key:w.idempotencyKey })), step:s.page.explicitStep.value }));
    expect(s.writes).toHaveLength(0);
  });
  it('normal same generation dispatches once using original key', async () => {
    const s=await addressScopeSetup(); const pending=s.page.confirmOtp(); accept(s.ui); await pending;
    expect(s.writes).toHaveLength(1); expect(s.writes[0]).toMatchObject({ account:'A', epoch:1, idempotencyKey:'payout-address:original-fixture-key' }); expect(s.page.explicitStep.value).toBe('success');
  });
  it('ordinary cancel sends no command and preserves retry key', async () => {
    const s=await addressScopeSetup(); const pending=s.page.confirmOtp(); accept(s.ui,false); await pending;
    expect(s.writes).toHaveLength(0); expect(s.page.otpCommandKey.value).toBe('payout-address:original-fixture-key');
  });
  it('unknown save keeps original key for retry', async () => {
    const s=await addressScopeSetup(); s.request.mockImplementation(async(input:any)=> { if(input.method==='GET') return snapshot(); s.writes.push(input); throw new Error('CONTROLLED_TIMEOUT'); });
    const pending=s.page.confirmOtp(); accept(s.ui); await pending;
    expect(s.writes).toHaveLength(1); expect(s.page.otpCommandKey.value).toBe('payout-address:original-fixture-key'); expect(s.page.explicitStep.value).not.toBe('success');
  });
  it('already dispatched store request refuses stale readback after account switch', async () => {
    const s=await addressScopeSetup(); const ack=addressScopeDeferred<any>(); s.request.mockImplementation(async(input:any)=> { if(input.method==='GET') return snapshot(); s.writes.push(input); return ack.promise; });
    const pending=s.page.confirmOtp(); accept(s.ui); await flush(); expect(s.writes).toHaveLength(1);
    rebind(s,'B'); await flush(); const readsBefore=s.request.mock.calls.filter(([r]:any[])=>r.method==='GET').length; ack.resolve(row('B')); await pending;
    expect(s.request.mock.calls.filter(([r]:any[])=>r.method==='GET')).toHaveLength(readsBefore); expect(s.page.explicitStep.value).not.toBe('success');
  });
});
