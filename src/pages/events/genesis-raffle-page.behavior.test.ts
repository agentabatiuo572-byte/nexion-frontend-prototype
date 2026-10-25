import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import source from "./genesis-raffle.vue?raw";
import { genesisRaffleCopy } from "@/i18n/genesis-raffle";
import * as entries from "@/lib/genesis-raffle-entry";
import { formatAmount } from "@/lib/amount-display";
import { formatUsd } from "@/lib/usd-display";
import { parseGenesisRaffleState, type GenesisRaffleDraw } from "@/api/genesis-raffle-api";
import { displayDeadline } from "@/lib/promotion-display";
import { isAmbiguousEnvelopeOutcome } from "@/api/errors";
vi.mock("@/lib/secure-command-id", () => ({ requireCryptoUuid: () => "fixed-raffle-key" }));
const script = compileScript(parse(source).descriptor, { id: "genesis-raffle-behavior" });
const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const draw: GenesisRaffleDraw = { id: "draw-1", titleZh: "抽奖", titleEn: "Raffle", titleVi: "Quay thưởng", startsAt: "2000-01-01T00:00:00Z", drawAt: "2100-01-01T00:00:00Z", status: "OPEN", revision: 1, prizes: [], myEntries: 0, totalEntries: 0, myResults: [] };
const disposals: Array<() => void> = [];
beforeEach(() => { const storage = new Map<string, unknown>(); vi.stubGlobal("uni", { getStorageSync: (key: string) => structuredClone(storage.get(key) ?? ""), setStorageSync: (key: string, value: unknown) => storage.set(key, structuredClone(value)) }); });
afterEach(() => { disposals.splice(0).forEach(stop => stop()); vi.useRealTimers(); vi.unstubAllGlobals(); });
const flush = async () => { await Promise.resolve(); await Vue.nextTick(); };
function mount(initialDraw = draw) {
  const account = Vue.reactive({ accountKey: "user:a", accountBindingEpoch: 0 }), locale = Vue.reactive({ code: "zh" }), runtime = { epoch: 0 };
  const read = vi.fn().mockResolvedValue({ availableTickets: 5, draws: [initialDraw] }), enter = vi.fn().mockResolvedValue({ drawId: draw.id, enteredTickets: 2, availableTickets: 3 });
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
    "@/lib/usd-display": { formatUsd },
  };
  const output: any = {}; new Function("require", "exports", code)((id: string) => modules[id], output);
  const scope = Vue.effectScope(), state = scope.run(() => output.default.setup({}, { expose() {} }));
  disposals.push(() => { hooks.unmount(); scope.stop(); }); hooks.show();
  return { state, account, locale, runtime, hooks, read, enter };
}

const renderRewards = new Function("Vue", compile(parse(source).descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag),
}).code)(Vue);
it.each(["zh", "en", "vi"] as const)("renders parser-confirmed monetary prizes and paid/pending results without changing asset types in %s", async language => {
  const rewards = [
    { rewardType: "USDT", amount: "0.00032", expected: "$0.0003" },
    { rewardType: "USDT", amount: "0.00005", expected: "<$0.0001" },
    { rewardType: "USDT", amount: "1234.56789", expected: "$1,234.5679" },
    { rewardType: "USDT", amount: "0", expected: "$0.00" },
    { rewardType: "NEX", amount: "20", expected: "20.00 UVT" },
    { rewardType: "DEVICE", amount: "2", expected: `2.00 ${genesisRaffleCopy[language].device}` },
  ];
  const parsed = parseGenesisRaffleState({ availableTickets: 5, draws: [{ ...draw, status: "DRAWN", myEntries: 3, totalEntries: 7,
    prizes: rewards.map((item, i) => ({ id: `p-${i}`, nameZh: `奖${i}`, nameEn: `Prize ${i}`, nameVi: `Giải ${i}`,
      rewardType: item.rewardType, amount: item.amount, quantity: 4 })),
    myResults: rewards.map((item, i) => ({ prizeId: `p-${i}`, rewardType: item.rewardType, amount: item.amount,
      receiptId: `receipt-${i}`, status: i % 2 ? "PENDING" : "PAID" })),
  }] });
  const original = JSON.stringify(parsed), page = mount(parsed.draws[0]);
  page.locale.code = language; await flush(); await page.state.load();
  const html = await renderToString(Vue.createSSRApp({ render: renderRewards, setup: () => ({ ...page.state }), components: {
    AppChassis: { props: ["active"], setup: (_props: unknown, { slots }: any) => () => slots.default?.() },
    SubPageHeader: { render: () => null },
  } }));
  for (const [i, item] of rewards.entries()) {
    expect(page.state.rewardText(parsed.draws[0].prizes[i])).toBe(item.expected);
    const escaped = item.expected.replace(/</g, "&lt;");
    expect(html.split(`${escaped} · `).length - 1).toBe(2); // exact amount in both prize and result
  }
  expect(html).toContain(genesisRaffleCopy[language].paid);
  expect(html).toContain(genesisRaffleCopy[language].rewardPending);
  expect(JSON.stringify(parsed)).toBe(original);
  expect(page.state.snapshot.value.draws[0]).toEqual(parsed.draws[0]);
  expect(page.state.snapshot.value.availableTickets).toBe(5);
  expect(page.enter).not.toHaveBeenCalled();
});
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

function timedDraw() {
  return { ...draw, startsAt: new Date(Date.now() + 1_000).toISOString(), drawAt: new Date(Date.now() + 2_000).toISOString() };
}
it('keeps the current cards and ticket draft through refresh, blocking entries until a successful read', async () => {
  const page = mount(); await flush();
  const shown = page.state.snapshot.value;
  page.state.tickets.value[draw.id] = '3';
  let reject!: (error: Error) => void;
  page.read.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
  const request = page.state.load();
  expect(page.state.snapshot.value).toBe(shown);
  expect(page.state.loading.value).toBe(true);
  expect(page.state.canEnter(draw)).toBe(false);
  reject(new Error('temporarily unavailable')); await request;
  expect(page.state.snapshot.value).toBe(shown);
  expect(page.state.tickets.value[draw.id]).toBe('3');
  expect(page.state.error.value).toBe(true);
  expect(page.state.canEnter(draw)).toBe(false);
  await page.state.enter(draw);
  expect(page.enter).not.toHaveBeenCalled();
  await page.state.load();
  expect(page.state.error.value).toBe(false);
  expect(page.state.canEnter(draw)).toBe(true);
});
it('reads back at start and close boundaries while visible and never treats time as server permission', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  const round = timedDraw(), page = mount(round); await flush();
  expect(page.state.canEnter(round)).toBe(false);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(page.read).toHaveBeenCalledTimes(2);
  expect(page.state.canEnter(round)).toBe(true);
  expect(page.state.canEnter({ ...round, status: 'PROCESSING' })).toBe(false);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(page.read).toHaveBeenCalledTimes(3);
  expect(page.state.canEnter(round)).toBe(false);
  expect(page.enter).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it.each(['hide', 'unmount', 'runtime', 'account'])('cleans boundary timers on %s and resumes with a fresh read', async kind => {
  vi.useFakeTimers();
  const page = mount(timedDraw()); await flush();
  expect(vi.getTimerCount()).toBe(1);
  page.read.mockResolvedValue({ availableTickets: 0, draws: [] });
  if (kind === 'account') page.account.accountKey = 'user:b';
  else page.hooks[kind]();
  await flush();
  expect(vi.getTimerCount()).toBe(0);
  const count = page.read.mock.calls.length;
  await vi.advanceTimersByTimeAsync(3_000);
  expect(page.read).toHaveBeenCalledTimes(count);
  if (kind === 'hide') { page.hooks.show(); await flush(); expect(page.read).toHaveBeenCalledTimes(count + 1); }
});
it('a boundary during submission preserves its callback and retries an uncertain entry with the same key after close', async () => {
  vi.useFakeTimers();
  const round = { ...timedDraw(), startsAt: new Date(Date.now() - 1).toISOString() };
  const page = mount(round); await flush(); page.state.tickets.value[round.id] = '2';
  let reject!: (error: Error) => void;
  page.enter.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
  const submission = page.state.enter(round);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(page.state.entryOpen(round)).toBe(false);
  expect(page.read).toHaveBeenCalledTimes(1);
  reject(new Error('lost response')); await submission;
  expect(page.state.busy.value).toBe('');
  expect(page.read).toHaveBeenCalledTimes(2);
  expect(page.state.canEnter(round)).toBe(true);
  page.state.tickets.value[round.id] = '5';
  await page.state.enter(round);
  expect(page.enter.mock.calls[1]).toEqual(page.enter.mock.calls[0]);
  expect(page.enter.mock.calls[1][1]).toBe(2);
  expect(page.state.pending.value[round.id]).toBeNull();
});
