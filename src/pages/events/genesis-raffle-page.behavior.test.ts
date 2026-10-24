import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import source from "./genesis-raffle.vue?raw";
import { genesisRaffleCopy } from "@/i18n/genesis-raffle";
import * as entries from "@/lib/genesis-raffle-entry";
import { formatAmount } from "@/lib/amount-display";
import { displayDeadline } from "@/lib/promotion-display";
import { isAmbiguousEnvelopeOutcome } from "@/api/errors";
vi.mock("@/lib/secure-command-id", () => ({ requireCryptoUuid: () => "fixed-raffle-key" }));
const script = compileScript(parse(source).descriptor, { id: "genesis-raffle-behavior" });
const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const draw = { id: "draw-1", titleZh: "抽奖", titleEn: "Raffle", titleVi: "Quay thưởng", startsAt: "2000-01-01T00:00:00Z", drawAt: "2100-01-01T00:00:00Z", status: "OPEN", revision: 1, prizes: [], myEntries: 0, totalEntries: 0, myResults: [] };
const disposals: Array<() => void> = [];
beforeEach(() => { const storage = new Map<string, unknown>(); vi.stubGlobal("uni", { getStorageSync: (key: string) => structuredClone(storage.get(key) ?? ""), setStorageSync: (key: string, value: unknown) => storage.set(key, structuredClone(value)) }); });
afterEach(() => { disposals.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); });
const flush = async () => { await Promise.resolve(); await Vue.nextTick(); };
function mount() {
  const account = Vue.reactive({ accountKey: "user:a", accountBindingEpoch: 0 }), locale = Vue.reactive({ code: "zh" }), runtime = { epoch: 0 };
  const read = vi.fn().mockResolvedValue({ availableTickets: 5, draws: [draw] }), enter = vi.fn().mockResolvedValue({ drawId: draw.id, enteredTickets: 2, availableTickets: 3 });
  const hooks: Record<string, () => void> = {};
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onUnmounted: (fn: () => void) => { hooks.unmount = fn; } },
    "@dcloudio/uni-app": { onShow: (fn: () => void) => { hooks.show = fn; }, onHide: (fn: () => void) => { hooks.hide = fn; } },
    "@/components/app-chassis.vue": {}, "@/components/sub-page-header.vue": {},
    "@/api/runtime": { apiClient: {}, apiRuntimeConfig: { baseUrl: "https://test" } },
    "@/api/order-api": { captureRuntimeRevision: () => runtime, subscribeRuntimeRevision: (fn: () => void) => { hooks.runtime = fn; return () => {}; } },
    "@/api/genesis-raffle-api": { createGenesisRaffleApi: () => ({ state: read, enter }) },
    "@/api/errors": { isAmbiguousEnvelopeOutcome }, "@/lib/genesis-raffle-entry": entries,
    "@/store/app": { useApp: () => account }, "@/store/locale": { useLocaleStore: () => locale },
    "@/i18n/genesis-raffle": { genesisRaffleCopy }, "@/lib/promotion-display": { displayDeadline }, "@/lib/amount-display": { formatAmount },
  };
  const output: any = {}; new Function("require", "exports", code)((id: string) => modules[id], output);
  const scope = Vue.effectScope(), state = scope.run(() => output.default.setup({}, { expose() {} }));
  disposals.push(() => { hooks.unmount(); scope.stop(); }); hooks.show();
  return { state, account, locale, runtime, hooks, read, enter };
}
it("never enters on load; double taps submit once and a reload retries the immutable ticket intent", async () => {
  const page = mount(); await flush(); expect(page.enter).not.toHaveBeenCalled();
  page.state.tickets.value[draw.id] = "2";
  let reject!: (cause: unknown) => void;
  page.enter.mockReturnValueOnce(new Promise((_yes, no) => { reject = no; }));
  const submitting = page.state.enter(draw); await page.state.enter(draw); expect(page.enter).toHaveBeenCalledTimes(1);
  reject(new Error("response lost")); await submitting;
  expect(page.state.pending.value[draw.id].tickets).toBe(2);
  const resumed = mount(); await flush(); resumed.state.tickets.value[draw.id] = "5";
  resumed.read.mockResolvedValue({ availableTickets: 3, draws: [{ ...draw, myEntries: 2, totalEntries: 2 }] });
  await resumed.state.enter(draw);
  expect(resumed.enter).toHaveBeenCalledWith(draw.id, 2, page.enter.mock.calls[0][2]);
  expect(resumed.state.snapshot.value.availableTickets).toBe(3); expect(resumed.state.pending.value[draw.id]).toBeNull();
});
it("invalid quantities and closed rounds make no entry requests", async () => {
  const page = mount(); await flush();
  for (const tickets of ["0", "-1", "1.5", "6", "invalid"]) { page.state.tickets.value[draw.id] = tickets; await page.state.enter(draw); }
  page.state.tickets.value[draw.id] = "1"; await page.state.enter({ ...draw, status: "DRAWN" });
  await page.state.enter({ ...draw, status: "PROCESSING" });
  expect(page.enter).not.toHaveBeenCalled();
});
it.each(["account", "language", "runtime", "hide"])("drops stale raffle snapshots after %s changes", async kind => {
  const page = mount(); await flush(); let resolve!: (value: unknown) => void;
  page.read.mockReturnValueOnce(new Promise(done => { resolve = done; })); const pending = page.state.load();
  page.read.mockResolvedValue({ availableTickets: 0, draws: [] });
  if (kind === "account") page.account.accountKey = "user:b";
  if (kind === "language") page.locale.code = "vi";
  if (kind === "runtime") { page.runtime.epoch += 1; page.hooks.runtime(); }
  if (kind === "hide") page.hooks.hide();
  await flush(); resolve({ availableTickets: 999, draws: [draw] }); await pending;
  expect(page.state.snapshot.value?.availableTickets).toBe(kind === "hide" ? undefined : 0);
});
