import { formatAmount } from "@/lib/amount-display";
import { afterEach, expect, test, vi } from "vitest";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { createPinia, setActivePinia } from "pinia";
import ts from "typescript";
import qrcode from "qrcode-generator";
import Jimp from "jimp";
// @ts-expect-error Existing Node-only QR decoder has no published declarations.
import QrCode from "qrcode-reader";
// @ts-expect-error App TypeScript excludes Node declarations; this runs in Vitest's Node process.
import { Buffer } from "node:buffer";
import source from "./deposit-usdt-pane.vue?raw";
import { createCregisDepositApi } from "@/api/cregis-deposit-api";
import type { ApiClient } from "@/api/api-client";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import * as depositsCore from "@/store/deposits-core";
import type { VietQrIntentSnapshot } from "@/api/payment-api";
import { useDeposits } from "@/store/deposits";

const bankRuntime = vi.hoisted(() => ({ fundsServerEnabled: true, remoteApiEnabled: true,
  paymentApi: { listVietQrIntents: vi.fn(), listVietQrReceipts: vi.fn(), createVietQrIntent: vi.fn(), cancelVietQrIntent: vi.fn() } }));
vi.mock("@/api/runtime", () => bankRuntime);
vi.mock("@/store/app", () => ({ useApp: () => ({}) }));
vi.mock("@/store/fx", () => ({ useFx: vi.fn() }));
vi.mock("@/lib/money-receipt", () => ({ postReceiptOnce: vi.fn(), reportStuckFunds: vi.fn() }));

const descriptor = parse(source).descriptor;
const ast = ts.createSourceFile("deposit-usdt-pane.ts", descriptor.scriptSetup!.content, ts.ScriptTarget.ES2022, true);
const exposed = ast.statements.flatMap(statement => ts.isFunctionDeclaration(statement)
  ? statement.name ? [statement.name.text] : []
  : ts.isVariableStatement(statement) ? statement.declarationList.declarations.flatMap(declaration =>
    ts.isIdentifier(declaration.name) ? [declaration.name.text] : []) : []);
const script = ts.transpileModule(descriptor.scriptSetup!.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText + `;return { ${exposed.join(", ")} };`;
const render = new Function("Vue", compile(descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text", "image"].includes(tag),
}).code)(Vue) as Vue.RenderFunction;

// Mount the real template and setup; this host replaces only DOM I/O.
interface HostNode { kind: string; text: string; props: Record<string, unknown>; children: HostNode[]; parent: HostNode | null }
const node = (kind: string, text = ""): HostNode => ({ kind, text, props: {}, children: [], parent: null });
function remove(child: HostNode) {
  if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
  child.parent = null;
}
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: tag => node(tag), createText: text => node("#text", text), createComment: text => node("#comment", text),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, next) => { target.props[key] = next; },
  insert: (child, parent, anchor) => {
    remove(child); child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  }, remove, parentNode: target => target.parent,
  nextSibling: target => target.parent?.children[target.parent.children.indexOf(target) + 1] ?? null,
});
const textOf = (target: HostNode): string => (target.kind === "#comment" ? "" : target.text) + target.children.map(textOf).join("");
const nodesOf = (target: HostNode): HostNode[] => [target, ...target.children.flatMap(nodesOf)];
const controls = (root: HostNode, className: string) => nodesOf(root).filter(target => String(target.props.class).split(/\s+/).includes(className));
const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  vi.unstubAllGlobals();
});

const address = { enabled: true, network: "BEP20", address: "0x" + "a".repeat(40),
  minDepositUsdt: 10, feeUsdt: 1, confirmations: 15 };
const statuses = ["CONFIRMING", "CREDITED", "DUST_HOLD", "REVIEW_HOLD", "REORG_INVESTIGATING", "PROVIDER_CONFLICT_HOLD"];
const rows = statuses.map((status, index) => ({ depositId: `CR-${index + 1}`, status,
  txHash: "0x" + String(index + 1).repeat(64), address: address.address,
  grossAmountUsdt: status === "DUST_HOLD" ? 5 : 10.125,
  creditedUsdt: ["CREDITED", "REORG_INVESTIGATING", "PROVIDER_CONFLICT_HOLD"].includes(status) ? 9.125 : 0,
  confirmations: status === "CONFIRMING" ? 3 : 15,
  createdAt: 1_791_072_000_000 + index,
}));
type Messages = typeof zh | typeof en | typeof vietnamese;
type BankHistoryStore = Pick<ReturnType<typeof useDeposits>, "records" | "remoteReceiptInitialStatus"
  | "currentAccountKey" | "refreshRemoteVietQrDeposits">;
async function pane(response: object, records: unknown[] | Promise<unknown[]> = [], messages: Messages = zh,
  options: { dep?: BankHistoryStore; cold?: boolean } = {}) {
  const request = vi.fn(async ({ path }: { path: string }) => path.startsWith("/api/deposits/address") ? response : records);
  const api = createCregisDepositApi({ request } as unknown as ApiClient), navTo = vi.fn(), info = vi.fn();
  const app = Vue.reactive({ accountKey: options.cold ? "default" : "user:7", accountBindingEpoch: 1 });
  const auth = Vue.reactive({ isAuthenticated: !options.cold, accountId: "user:7" });
  const sessionUserId = Vue.ref<number | null>(options.cold ? null : 7);
  const dep: BankHistoryStore = options.dep ?? Vue.reactive({ records: [], remoteReceiptInitialStatus: "ready",
    currentAccountKey: () => app.accountKey, refreshRemoteVietQrDeposits: vi.fn(async () => {}) });
  const modules: Record<string, unknown> = {
    "@/lib/amount-display": { formatAmount },
    vue: Vue, "qrcode-generator": { default: qrcode },
    "@/api/runtime": { fundsServerEnabled: true, cregisDepositApi: api,
      sessionVault: { read: () => sessionUserId.value === null ? null : { user: { userId: sessionUserId.value } } } },
    "@/lib/binary-session-ready": { binarySessionReady },
    "@/store/app": { useApp: () => app }, "@/store/auth": { useAuth: () => auth },
    "@/i18n/use-t": { useT: () => Vue.ref(messages) }, "@/i18n/format": { fmt },
    "@/lib/route": { navTo }, "@/store/ui": { toast: { info } },
    "@/store/deposits": { useDeposits: () => dep },
    "@/store/server-time": { mockServerNow: () => 1_791_072_060_000 }, "@/store/deposits-core": depositsCore,
  };
  let state: Record<string, unknown> = {};
  const mounted = renderer.createApp({ render, setup: () => {
    state = new Function("require", "exports", script)((name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected deposit dependency: ${name}`);
      return modules[name];
    }, {});
    return { ...state, fmt, formatAmount, fundsServerEnabled: true, CHAIN_DEPOSIT_FEE_USDT: depositsCore.CHAIN_DEPOSIT_FEE_USDT };
  } });
  const root = node("root"); mounted.mount(root);
  cleanups.push(() => mounted.unmount());
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  await Vue.nextTick();
  return { root, navTo, info, request, state, app, auth, sessionUserId, dep, text: () => textOf(root) };
}

test.each([zh, en, vietnamese])("paused channel and disabled button use the same message without account allowlisting", async messages => {
  const h = await pane({ enabled: false, network: "BEP20", reason: "CREGIS_DEPOSIT_PAUSED" }, [], messages);
  expect(h.text()).toContain(messages.topupChrome.allNetworksPaused);
  (h.state.pickNet as (id: string) => void)("usdt-bep20");
  expect(h.info).toHaveBeenCalledWith(messages.topupChrome.allNetworksPaused);
  expect(nodesOf(h.root).filter(n => n.kind === "image")).toHaveLength(0);
});

test.each([undefined, "CREGIS_DEPOSIT_ACCOUNT_NOT_OPEN", "UNKNOWN_REASON"])("legacy or missing reason %s does not introduce account permission UI", async reason => {
  const h = await pane({ enabled: false, network: "BEP20", reason });
  expect(h.text()).toContain(zh.topupChrome.allNetworksPaused);
  expect(h.text()).not.toContain("当前账号暂未开放");
});

test("paused channel recovers after network failure and retry without retaining account data", async () => {
  const h = await pane({ enabled: false, network: "BEP20", reason: "CREGIS_DEPOSIT_PAUSED" });
  h.request.mockRejectedValueOnce(new Error("NETWORK_DOWN"));
  (h.state.load as () => void)();
  await vi.waitFor(() => expect(h.text()).toContain(zh.topupChrome.addrLoadFailed));
  h.request.mockImplementation(async ({ path }) => path.startsWith("/api/deposits/address") ? address : []);
  (controls(h.root, "nx-dep-retry-cta")[0].props.onClick as () => void)();
  await vi.waitFor(() => expect((h.state.serverEnabled as Vue.Ref<boolean>).value).toBe(true));
  expect(h.text()).not.toContain(zh.topupChrome.allNetworksPaused);
  h.auth.isAuthenticated = false;
  await Vue.nextTick();
  expect((h.state.serverAddress as Vue.Ref<string>).value).toBe("");
});

// Read the real store's canonical projection and generation fence; only transport is replaced.
const bankSnapshots: VietQrIntentSnapshot[] = [
  { intentNo: "VQR-2B323E8573164C17A836", usdtAmount: 1299, creditedUsdt: 1299, createdAt: "2026-10-06T03:56:11Z" },
  { intentNo: "VQR-CFF23F2E04BF4DF087C4", usdtAmount: 20, creditedUsdt: 20, createdAt: "2026-10-05T11:33:28Z" },
].map(row => ({ ...row, fxRate: 26000, vndAmount: row.usdtAmount * 26000, feeVnd: 0, feeUsdt: 0,
  status: "credited", paymentMode: "hosted", providerStatus: "rejected", version: 1, expiresAt: "2026-10-06T04:26:11Z" }));
async function bankStore(snapshots: VietQrIntentSnapshot[] = []) {
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn() });
  bankRuntime.paymentApi.listVietQrIntents.mockReset().mockResolvedValue([]);
  bankRuntime.paymentApi.listVietQrReceipts.mockReset().mockResolvedValue({ items: [], nextOffset: null });
  bankRuntime.paymentApi.createVietQrIntent.mockClear(); bankRuntime.paymentApi.cancelVietQrIntent.mockClear();
  setActivePinia(createPinia());
  const dep = useDeposits();
  await vi.waitFor(() => expect(dep.serverStatus).toBe("ready"));
  bankRuntime.paymentApi.listVietQrIntents.mockResolvedValue(snapshots);
  dep.bindAccount("user:7");
  await vi.waitFor(() => expect(dep.serverStatus).toBe("ready"));
  cleanups.push(() => {
    dep.$dispose();
    expect(bankRuntime.paymentApi.createVietQrIntent).not.toHaveBeenCalled();
    expect(bankRuntime.paymentApi.cancelVietQrIntent).not.toHaveBeenCalled();
  });
  return dep;
}

test.each([zh, en, vietnamese])("bank-only canonical history is visible with a disabled chain address and opens bills", async messages => {
  const dep = await bankStore(bankSnapshots);
  const h = await pane({ enabled: false, network: "BEP20" }, [], messages, { dep });
  const records = controls(h.root, "nx-dep-record-row");
  expect(records).toHaveLength(2);
  expect(h.text()).not.toContain(messages.topupChrome.noDepositsYet);
  expect(records.map(textOf)).toEqual(bankSnapshots.map(row => expect.stringContaining(row.intentNo)));
  expect(textOf(records[0])).toContain("1299"); expect(textOf(records[1])).toContain("20");
  for (const record of records) {
    expect(textOf(record)).toContain(messages.bankPane.bankDeposit);
    expect(textOf(record)).toContain(messages.topupChrome.depositCredited);
    (record.props.onClick as () => void)();
  }
  expect(h.navTo.mock.calls).toEqual([["/pages/me/wallet-bills"], ["/pages/me/wallet-bills"]]);
  expect(dep.intents.map(intent => intent.providerStatus)).toEqual(["rejected", "rejected"]);
});

test("bank and chain history share chronological order without pulling other local channels into formal history", async () => {
  const dep = await bankStore(bankSnapshots);
  const h = await pane(address, [{ ...rows[1], createdAt: Date.parse("2026-10-05T20:00:00Z") }], zh, { dep });
  dep.records.push({ ...dep.records[0], depositId: "LOCAL-CARD", channel: "card-intl" });
  await Vue.nextTick();
  expect(controls(h.root, "nx-dep-record-row").map(textOf)).toEqual([
    expect.stringContaining(bankSnapshots[0].intentNo), expect.stringContaining("CR-2"), expect.stringContaining(bankSnapshots[1].intentNo),
  ]);
  expect(h.text()).not.toContain("LOCAL-CARD");
});

for (const messages of [zh, en, vietnamese]) test.each([{ chainRows: [] }, { chainRows: [rows[1]] }])("bank read failure retains any chain rows, withholds empty history and recovers via retry", async ({ chainRows }) => {
  const dep = await bankStore();
  bankRuntime.paymentApi.listVietQrIntents.mockRejectedValue(new Error("BANK_READ_FAILED"));
  const h = await pane(address, chainRows, messages, { dep });
  expect(h.text()).not.toContain(messages.topupChrome.noDepositsYet);
  expect(h.text()).toContain(messages.topupChrome.depositOpFailedNote);
  expect(controls(h.root, "nx-dep-record-row")).toHaveLength(chainRows.length);
  bankRuntime.paymentApi.listVietQrIntents.mockResolvedValue(bankSnapshots);
  (controls(h.root, "nx-dep-history-retry")[0].props.onClick as () => void)();
  await vi.waitFor(() => expect(dep.remoteReceiptInitialStatus).toBe("ready")); await Vue.nextTick();
  expect(controls(h.root, "nx-dep-record-row")).toHaveLength(2 + chainRows.length);
  expect(h.text()).not.toContain(messages.topupChrome.depositOpFailedNote);
});

test("a receipt read failure retains canonical bank rows and its error clears on a complete retry", async () => {
  const dep = await bankStore(bankSnapshots);
  bankRuntime.paymentApi.listVietQrReceipts.mockRejectedValue(new Error("RECEIPT_READ_FAILED"));
  const h = await pane(address, [], zh, { dep });
  expect(controls(h.root, "nx-dep-record-row")).toHaveLength(2);
  expect(h.text()).toContain(zh.topupChrome.depositOpFailedNote);
  expect(h.text()).not.toContain(zh.topupChrome.noDepositsYet);
  bankRuntime.paymentApi.listVietQrReceipts.mockResolvedValue({ items: [], nextOffset: 50 });
  (controls(h.root, "nx-dep-history-retry")[0].props.onClick as () => void)();
  await vi.waitFor(() => expect(dep.remoteReceiptInitialStatus).toBe("ready")); await Vue.nextTick();
  expect(h.text()).not.toContain(zh.topupChrome.depositOpFailedNote);
  expect(dep.remoteReceiptNextOffset).toBe(50);
});

test("an unfinished bank read stays unknown while receipt-only pagination leaves completed history usable", async () => {
  const dep = await bankStore();
  let release!: (value: VietQrIntentSnapshot[]) => void;
  bankRuntime.paymentApi.listVietQrIntents.mockImplementationOnce(() => new Promise<VietQrIntentSnapshot[]>(resolve => { release = resolve; }));
  const h = await pane(address, [], zh, { dep });
  expect(h.text()).not.toContain(zh.topupChrome.noDepositsYet);
  expect(controls(h.root, "nx-dep-history-loading")).toHaveLength(1);
  expect(controls(h.root, "nx-dep-history-loading")[0].props["aria-label"]).toBe(zh.bankWithdrawal.loading);
  release(bankSnapshots);
  await vi.waitFor(() => expect(dep.remoteReceiptInitialStatus).toBe("ready")); await Vue.nextTick();
  dep.serverStatus = "loading"; dep.remoteReceiptMoreStatus = "loading";
  await Vue.nextTick();
  expect(controls(h.root, "nx-dep-record-row")).toHaveLength(2);
  expect(controls(h.root, "nx-dep-history-loading")).toHaveLength(0);
});

test("a kept-alive 30-second chain poll preserves appended bank receipts and their cursor", async () => {
  const dep = await bankStore(bankSnapshots);
  const receipt = (n: number) => ({ receiptNo: `R${n}`, intentNo: bankSnapshots[0].intentNo,
    viewType: "credited", status: "credited", creditedUsdt: 1299, createdAt: bankSnapshots[0].createdAt! });
  const first = receipt(1), second = receipt(2);
  bankRuntime.paymentApi.listVietQrReceipts.mockResolvedValue({ items: [first], nextOffset: 50 });
  let tick!: () => void;
  vi.stubGlobal("setInterval", (callback: () => void, delay: number) => {
    expect(delay).toBe(30_000); tick = callback; return 1;
  });
  vi.stubGlobal("clearInterval", vi.fn());
  const h = await pane(address, [], zh, { dep });
  (controls(h.root, "nx-dep-record-row")[0].props.onClick as () => void)();
  expect(h.navTo).toHaveBeenCalledWith("/pages/me/wallet-bills");
  // navigateTo keeps the preceding page mounted while receipts load another page.
  bankRuntime.paymentApi.listVietQrReceipts.mockResolvedValueOnce({ items: [second], nextOffset: 100 });
  await dep.loadMoreRemoteVietQrReceipts();
  expect(dep.remoteReceipts.map(row => row.receiptNo)).toEqual(["R1", "R2"]);
  const intentReads = bankRuntime.paymentApi.listVietQrIntents.mock.calls.length;
  const receiptReads = bankRuntime.paymentApi.listVietQrReceipts.mock.calls.length;
  h.request.mockImplementation(async ({ path }) => path.startsWith("/api/deposits/address") ? address : [rows[1]]);
  tick();
  await vi.waitFor(() => expect(controls(h.root, "nx-dep-record-row")).toHaveLength(3));
  expect({ receipts: dep.remoteReceipts, nextOffset: dep.remoteReceiptNextOffset }).toEqual({ receipts: [first, second], nextOffset: 100 });
  expect(bankRuntime.paymentApi.listVietQrIntents).toHaveBeenCalledTimes(intentReads);
  expect(bankRuntime.paymentApi.listVietQrReceipts).toHaveBeenCalledTimes(receiptReads);
});

test.each([false, true])("late old-account bank response (failure=%s) and chain response cannot reach the new account", async failBank => {
  const dep = await bankStore();
  let releaseBank!: () => void, releaseChain!: (value: unknown[]) => void;
  bankRuntime.paymentApi.listVietQrIntents.mockImplementationOnce(() => new Promise<VietQrIntentSnapshot[]>((resolve, reject) => {
    releaseBank = () => failBank ? reject(new Error("OLD_BANK_READ_FAILED")) : resolve(bankSnapshots);
  }));
  const oldChain = new Promise<unknown[]>(resolve => { releaseChain = resolve; });
  const h = await pane(address, oldChain, zh, { dep });
  h.request.mockImplementation(async ({ path }) => path.startsWith("/api/deposits/address") ? address : []);
  h.sessionUserId.value = 8; h.auth.accountId = "user:8"; h.app.accountKey = "user:8"; h.app.accountBindingEpoch++;
  dep.bindAccount("user:8");
  releaseBank(); releaseChain(rows);
  await vi.waitFor(() => expect(dep.serverStatus).toBe("ready")); await Vue.nextTick();
  expect(dep.records).toEqual([]);
  expect(controls(h.root, "nx-dep-record-row")).toHaveLength(0);
  expect(h.text()).toContain(zh.topupChrome.noDepositsYet);
  expect(h.text()).not.toContain("OLD_BANK_READ_FAILED");
});

test("cold or unbound account history never exposes cached bank records or starts an old-account refresh", async () => {
  const dep = await bankStore(bankSnapshots);
  const reads = bankRuntime.paymentApi.listVietQrIntents.mock.calls.length;
  const h = await pane(address, [], zh, { dep, cold: true });
  expect(h.request).not.toHaveBeenCalled();
  expect(bankRuntime.paymentApi.listVietQrIntents).toHaveBeenCalledTimes(reads);
  expect(controls(h.root, "nx-dep-record-row")).toHaveLength(0);
  h.sessionUserId.value = 8; h.auth.isAuthenticated = true; h.auth.accountId = "user:8";
  h.app.accountKey = "user:8"; h.app.accountBindingEpoch++;
  await new Promise<void>(resolve => setTimeout(resolve, 0)); await Vue.nextTick();
  expect(bankRuntime.paymentApi.listVietQrIntents).toHaveBeenCalledTimes(reads);
  expect(controls(h.root, "nx-dep-record-row")).toHaveLength(0);
  expect(h.text()).not.toContain(zh.topupChrome.noDepositsYet);
  bankRuntime.paymentApi.listVietQrIntents.mockResolvedValue([]);
  dep.bindAccount("user:8");
  await vi.waitFor(() => expect(dep.serverStatus).toBe("ready")); await Vue.nextTick();
  expect(h.text()).toContain(zh.topupChrome.noDepositsYet);
});

test.each([zh, en, vietnamese])("refunded and reversed deposits retain the address without showing a new credit", async messages => {
  const terminalRows = ["REFUNDED", "REORG_REVERSED"].map((status, index) => ({ ...rows[1],
    depositId: `CR-${index + 7}`, status, creditedUsdt: 0 }));
  const h = await pane({ ...address, creditEnabled: true }, terminalRows, messages);
  const records = controls(h.root, "nx-dep-record-row");
  expect(records).toHaveLength(2);
  expect(controls(h.root, "nx-dep-copy-address-cta")).toHaveLength(1);
  expect(h.text()).not.toContain(messages.topupChrome.addrLoadFailed);
  expect(textOf(records[0])).toContain(messages.topupChrome.depositReturned);
  expect(textOf(records[1])).toContain(messages.commissions.reversedTag);
  expect(textOf(records[1])).toContain("0.00");
  for (const record of records) expect(record.props.onClick).toBeUndefined();
  expect(h.navTo).not.toHaveBeenCalled();
});

test.each([zh, en, vietnamese])("a mixed six-state list stays visible and risk records preserve historical credit without confirmed details", async messages => {
  const h = await pane({ ...address, creditEnabled: true }, rows, messages);
  const records = controls(h.root, "nx-dep-record-row");
  expect(records).toHaveLength(6);
  expect(controls(h.root, "nx-dep-copy-address-cta")).toHaveLength(1);
  expect(h.text()).not.toContain(messages.topupChrome.addrLoadFailed);
  expect(h.text()).toContain(fmt(messages.topupChrome.confirmingProgress, { n: 3, total: 15 }));
  expect(h.text()).toContain(messages.topupChrome.dustHoldServerNote);
  expect(h.text()).toContain(messages.topupChrome.reviewHoldNote);
  for (const [id, label] of [["CR-5", messages.topupChrome.reorgInvestigating], ["CR-6", messages.topupChrome.providerConflictHold]]) {
    const record = records.find(record => textOf(record).includes(id))!;
    expect(textOf(record)).toContain(label);
    expect(textOf(record)).toContain(fmt(messages.topupChrome.riskHoldNote, { amount: "9.13" }));
    expect(record.props.onClick).toBeUndefined();
    expect(record.props.role).toBeUndefined();
    expect(record.props.tabindex).toBeUndefined();
  }
  const stored = (h.state.serverRecords as Vue.Ref<Array<{ depositId: string; creditedUsdt: number }>>).value;
  const goRecord = h.state.goRecord as (record: unknown) => void;
  for (const id of ["CR-5", "CR-6"]) {
    const risk = stored.find(record => record.depositId === id)!;
    expect(risk.creditedUsdt).toBe(9.125);
    goRecord(risk);
  }
  expect(h.navTo).not.toHaveBeenCalled();
  const credited = records.find(record => textOf(record).includes("CR-2"))!;
  expect(textOf(credited)).toContain(messages.topupChrome.depositCredited);
  (credited.props.onClick as () => void)();
  expect(h.navTo).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("/pages/tx/hash?"));
});

for (const messages of [zh, en, vietnamese]) {
  test.each([true, false, undefined])("credit capability %s controls the pilot notice beside the retained address", async creditEnabled => {
    const response = creditEnabled === undefined ? address : { ...address, creditEnabled };
    const h = await pane(response, [], messages);
    expect(controls(h.root, "nx-dep-credit-paused-note")).toHaveLength(creditEnabled === true ? 0 : 1);
    if (creditEnabled !== true) expect(h.text()).toContain(messages.topupChrome.creditPausedNote);
    expect(controls(h.root, "nx-dep-qr-box")).toHaveLength(1);
    expect(h.text()).toContain(messages.topupChrome.depositAddrNote);
    expect(h.text()).toContain(messages.topupChrome.amountAtSenderNote);
    expect(controls(h.root, "nx-dep-copy-address-cta")).toHaveLength(1);
    expect(h.text()).toContain("BEP20");
    expect(h.text()).toContain("$10.00");
    expect(h.text()).toContain("1.00 USDT");
    expect(h.text()).toContain("15");
  });
}

for (const messages of [zh, en, vietnamese]) {
  test.each([undefined, address.address])("a disabled address %s has no address promise, QR or transfer instructions", async retainedAddress => {
    const h = await pane({ enabled: false, creditEnabled: false, network: "BEP20", address: retainedAddress }, [], messages);
    expect(h.text()).toContain(messages.topupChrome.allNetworksPaused);
    expect(h.text()).not.toContain(messages.topupChrome.depositAddrNote);
    expect(h.text()).not.toContain(messages.topupChrome.scanOrCopy);
    expect(h.text()).not.toContain(messages.topupChrome.amountAtSenderNote);
    expect(controls(h.root, "nx-dep-qr-box")).toHaveLength(0);
    expect(controls(h.root, "nx-dep-qr-image")).toHaveLength(0);
    expect(controls(h.root, "nx-dep-copy-address-cta")).toHaveLength(0);
    expect(controls(h.root, "nx-dep-credit-paused-note")).toHaveLength(0);
  });

  test.each([undefined, ""])("an enabled response without a usable address %s shows a recoverable error without an address promise", async missingAddress => {
    const h = await pane({ ...address, address: missingAddress, creditEnabled: true }, [], messages);
    expect(h.text()).toContain(messages.topupChrome.addrLoadFailed);
    expect(h.text()).not.toContain(messages.topupChrome.depositAddrNote);
    expect(controls(h.root, "nx-dep-qr-box")).toHaveLength(0);
    expect(controls(h.root, "nx-dep-copy-address-cta")).toHaveLength(0);
    expect(controls(h.root, "nx-dep-retry-cta")).toHaveLength(1);
  });

  test("loading and failed address requests withhold the address promise until retry returns a usable address", async () => {
    let rejectAddress!: (reason: Error) => void;
    const pending = new Promise<object>((_resolve, reject) => { rejectAddress = reject; });
    const h = await pane(pending, [], messages);
    expect((h.state.phase as Vue.Ref<string>).value).toBe("loading");
    expect(h.text()).not.toContain(messages.topupChrome.depositAddrNote);
    expect(controls(h.root, "nx-dep-copy-address-cta")).toHaveLength(0);
    rejectAddress(new Error("address unavailable"));
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await Vue.nextTick();
    expect(h.text()).toContain(messages.topupChrome.addrLoadFailed);
    expect(h.text()).not.toContain(messages.topupChrome.depositAddrNote);
    h.request.mockImplementation(async ({ path }) => path.startsWith("/api/deposits/address")
      ? { ...address, creditEnabled: false } : []);
    (controls(h.root, "nx-dep-retry-cta")[0].props.onClick as () => void)();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await Vue.nextTick();
    expect(h.text()).toContain(messages.topupChrome.depositAddrNote);
    expect(h.text()).toContain(messages.topupChrome.creditPausedNote);
    expect(controls(h.root, "nx-dep-copy-address-cta")).toHaveLength(1);
  });
}

test("a risk record with no historical credit does not substitute its gross transfer amount", async () => {
  const h = await pane({ ...address, creditEnabled: true }, [{ ...rows[4], creditedUsdt: 0 }]);
  const record = controls(h.root, "nx-dep-record-row")[0];
  expect(textOf(record)).toContain(fmt(zh.topupChrome.riskHoldNote, { amount: "0.00" }));
  expect(textOf(record)).not.toContain("10.125");
  expect(record.props.onClick).toBeUndefined();
});

test("Native two-decimal display preserves six-decimal credit and transaction URL", async () => {
  vi.stubGlobal("Intl", undefined);
  const nativeLocale = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(() => { throw new Error("NATIVE_LOCALE_UNAVAILABLE"); });
  try {
    const transfer = { ...rows[1], grossAmountUsdt: 10.123456, creditedUsdt: 9.123456 };
    const h = await pane({ ...address, creditEnabled: true }, [transfer]);
    const record = controls(h.root, "nx-dep-record-row")[0];
    expect(nodesOf(record).filter(target => target.kind === "text").map(textOf)).toContain("9.12");
    expect(h.text()).toContain("$10.00");
    expect(h.text()).toContain("1.00 USDT");
    expect((h.state.serverRecords as Vue.Ref<unknown[]>).value[0]).toMatchObject({
      grossAmountUsdt: 10.123456, creditedUsdt: 9.123456,
    });
    (record.props.onClick as () => void)();
    expect(h.navTo).toHaveBeenCalledOnce();
    const href = h.navTo.mock.calls[0][0] as string;
    expect(href.split("?")[0]).toBe("/pages/tx/hash");
    expect(new URLSearchParams(href.split("?")[1]).get("amount")).toBe("10.123456");
  } finally {
    nativeLocale.mockRestore();
  }
});

test.each(["a", "b"])("the rendered QR bitmap decodes to the server address %s with fixed pixels and a four-module quiet zone", async digit => {
  const serverAddress = "0x" + digit.repeat(40);
  const h = await pane({ ...address, address: serverAddress, creditEnabled: false });
  const images = controls(h.root, "nx-dep-qr-image");
  expect(images).toHaveLength(1);
  expect(images[0].kind).toBe("image");
  expect(images[0].props.mode).toBe("aspectFit");
  const src = images[0].props.src as string;
  expect(src).toMatch(/^data:image\/gif;base64,/);
  const bitmap = await Jimp.read(Buffer.from(src.split(",")[1], "base64"));
  const { width, height } = bitmap.bitmap;
  expect(width).toBe(height);
  expect(width).toBeGreaterThan(100);
  expect((width - 32) % 4).toBe(0);
  const colors = new Set<number>();
  let whiteQuietZone = true;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = bitmap.getPixelColor(x, y);
    colors.add(color);
    if (x < 16 || y < 16 || x >= width - 16 || y >= height - 16) whiteQuietZone &&= color === 0xffffffff;
  }
  expect([...colors].sort()).toEqual([0x000000ff, 0xffffffff]);
  expect(whiteQuietZone).toBe(true);
  let finderWidth = 0;
  while (bitmap.getPixelColor(16 + finderWidth, 16) === 0x000000ff) finderWidth++;
  expect(finderWidth).toBe(7 * 4);
  const decoded = await new Promise<string>((resolve, reject) => {
    const reader = new QrCode();
    reader.callback = (error: Error | null, value: { result: string }) => error ? reject(error) : resolve(value.result);
    reader.decode(bitmap.bitmap);
  });
  expect(decoded).toBe(serverAddress);
});
