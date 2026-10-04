import { afterEach, expect, test, vi } from "vitest";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
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
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));

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
async function pane(response: object, records: unknown[] = [], messages: Messages = zh) {
  const request = vi.fn(async ({ path }: { path: string }) => path.startsWith("/api/deposits/address") ? response : records);
  const api = createCregisDepositApi({ request } as unknown as ApiClient), navTo = vi.fn();
  const modules: Record<string, unknown> = {
    vue: Vue, "qrcode-generator": { default: qrcode },
    "@/api/runtime": { fundsServerEnabled: true, cregisDepositApi: api, sessionVault: { read: () => ({ user: { userId: 7 } }) } },
    "@/lib/binary-session-ready": { binarySessionReady },
    "@/store/app": { useApp: () => Vue.reactive({ accountKey: "user:7", accountBindingEpoch: 1 }) },
    "@/store/auth": { useAuth: () => Vue.reactive({ isAuthenticated: true, accountId: "user:7" }) },
    "@/i18n/use-t": { useT: () => Vue.ref(messages) }, "@/i18n/format": { fmt },
    "@/lib/route": { navTo }, "@/store/ui": { toast: { info: vi.fn() } },
    "@/store/deposits": { useDeposits: () => ({ records: [] }) },
    "@/store/server-time": { mockServerNow: () => 1_791_072_060_000 }, "@/store/deposits-core": depositsCore,
  };
  let state: Record<string, unknown> = {};
  const mounted = renderer.createApp({ render, setup: () => {
    state = new Function("require", "exports", script)((name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected deposit dependency: ${name}`);
      return modules[name];
    }, {});
    return { ...state, fmt, fundsServerEnabled: true, CHAIN_DEPOSIT_FEE_USDT: depositsCore.CHAIN_DEPOSIT_FEE_USDT };
  } });
  const root = node("root"); mounted.mount(root);
  cleanups.push(() => mounted.unmount());
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  await Vue.nextTick();
  return { root, navTo, request, state, text: () => textOf(root) };
}

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
    expect(textOf(record)).toContain(fmt(messages.topupChrome.riskHoldNote, { amount: "9.125" }));
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
    expect(h.text()).toContain(messages.topupChrome.amountAtSenderNote);
    expect(controls(h.root, "nx-dep-copy-address-cta")).toHaveLength(1);
    expect(h.text()).toContain("BEP20");
    expect(h.text()).toContain("$10");
    expect(h.text()).toContain("1 USDT");
    expect(h.text()).toContain("15");
  });
}

test("a disabled address has no QR or copy entry", async () => {
  const h = await pane({ enabled: false, creditEnabled: false, network: "BEP20" });
  expect(h.text()).toContain(zh.topupChrome.allNetworksPaused);
  expect(controls(h.root, "nx-dep-qr-box")).toHaveLength(0);
  expect(controls(h.root, "nx-dep-qr-image")).toHaveLength(0);
  expect(controls(h.root, "nx-dep-copy-address-cta")).toHaveLength(0);
  expect(controls(h.root, "nx-dep-credit-paused-note")).toHaveLength(0);
});

test("a risk record with no historical credit does not substitute its gross transfer amount", async () => {
  const h = await pane({ ...address, creditEnabled: true }, [{ ...rows[4], creditedUsdt: 0 }]);
  const record = controls(h.root, "nx-dep-record-row")[0];
  expect(textOf(record)).toContain(fmt(zh.topupChrome.riskHoldNote, { amount: "0" }));
  expect(textOf(record)).not.toContain("10.125");
  expect(record.props.onClick).toBeUndefined();
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
