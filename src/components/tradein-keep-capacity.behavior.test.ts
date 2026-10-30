import { computed, ref } from "vue";
import { parse } from "@vue/compiler-sfc";
import { expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./tradein-sheets.vue?raw";
import { zh } from "@/i18n/messages/zh";
import { completeVerifiedMutation } from "@/domain/e20-capacity-coordinator";
import { createDeviceE3Api } from "@/api/device-e3-api";
import type { ApiClient } from "@/api/api-client";
import { parsePendingKeepCommand } from "@/lib/keep-command-recovery";

const script = parse(source).descriptor.scriptSetup!.content;
const ast = ts.createSourceFile("tradein.ts", script, ts.ScriptTarget.Latest, true);
const handler = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "onKeepBuy")!;
const code = ts.transpileModule(handler.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

it.each(["REPLACE_REQUIRED", "CAPACITY_AVAILABLE"])("keeps the remote KEEP command bound to %s capacity", decision => {
  const quote = { decision, targetProductNo: "stellarbox-s1", decisionSource: "server" };
  const state = ref({ kind: "replace", newKind: "stellarbox-s1", canonicalCapacityQuote: quote });
  const confirming = ref(false), submitCanonicalKeepBuy = vi.fn(), toast = { warn: vi.fn() };
  const deps = { state, confirming, remoteApiEnabled: true, replaceView: ref({ insufficient: false }),
    t: ref(zh), submitCanonicalKeepBuy, toast, refreshKeepRecovery: vi.fn(), keepRecovery: ref(null), keepRecoveryError: ref(false), onRecoverKeep: vi.fn() };
  new Function(...Object.keys(deps), `${code}; onKeepBuy();`)(...Object.values(deps));
  expect(confirming.value).toBe(decision === "CAPACITY_AVAILABLE");
  expect(submitCanonicalKeepBuy).toHaveBeenCalledTimes(decision === "CAPACITY_AVAILABLE" ? 1 : 0);
  if (decision === "REPLACE_REQUIRED") expect(toast.warn).toHaveBeenCalledWith(zh.tradein.errReplaceSlotConflict);
});

it("restores a persisted legacy KEEP before a new quote or the current insufficient-balance guard", () => {
  const onRecoverKeep = vi.fn(), submitCanonicalKeepBuy = vi.fn();
  const deps = { state: ref({ kind: "replace", newKind: "stellarbox-s1", canonicalCapacityQuote: { decision: "REPLACE_REQUIRED" } }),
    confirming: ref(false), remoteApiEnabled: true, replaceView: ref({ insufficient: true }),
    refreshKeepRecovery: vi.fn(), keepRecovery: ref({ key: "legacy-key" }), keepRecoveryError: ref(false), onRecoverKeep,
    t: ref(zh), submitCanonicalKeepBuy, toast: { warn: vi.fn() } };
  new Function(...Object.keys(deps), `${code}; onKeepBuy();`)(...Object.values(deps));
  expect(onRecoverKeep).toHaveBeenCalledOnce();
  expect(submitCanonicalKeepBuy).not.toHaveBeenCalled();
});

it("recovers a pre-upgrade KEEP after a lost response using the stored key and payable despite changed quote inputs", async () => {
  const legacyIntent = "keep|1156|stellarbox-pro-v2|5|2639|2639|6";
  const commands: Record<string, string> = { [legacyIntent]: "legacy-keep-key" };
  const receipt = { operationNo: "KEEP-OLD", orderNo: "ORD-OLD", targetDeviceId: 1204,
    deviceStatus: "ACTIVE", orderStatus: "COMPLETED", walletDebitUsdt: 2639, walletBalanceAfterUsdt: 0 };
  const transport = { request: vi.fn().mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce(receipt) };
  const canonicalCapacityKey = vi.fn(), releaseAccountCommandKey = vi.fn((_table, _account, intent, key) => {
    expect(commands[intent]).toBe(key); delete commands[intent]; return true;
  });
  const deps = { app: { accountKey: "user:7", devices: [{ id: "1204", activatedAt: 1 }], refreshRemoteFleet: vi.fn(async () => true) },
    CAPACITY_COMMAND_TABLE: "nexgrid-e3-capacity-commands-accounts-v1",
    readPendingKeepCommand: (account: string, target: string) => parsePendingKeepCommand({ "user:7": { commands } }, account, target),
    captureAccountScope: () => ({ accountKey: "user:7" }), isCurrentAccountScope: () => true,
    canonicalCapacityKey, deviceE3Api: createDeviceE3Api(transport as unknown as ApiClient), completeVerifiedMutation,
    orderApi: { list: async () => ({ orders: [{ orderNo: "ORD-OLD", productNo: "stellarbox-pro-v2", orderType: "CAPACITY_KEEP",
      canonicalStatus: "activated", paymentStatus: "PAID", orderStatus: "COMPLETED", activationStatus: "ACTIVATED",
      targetDeviceId: 1204, targetDeviceInstanceNo: "DEV-OLD", amountUsdt: 2639, discountUsdt: 0 }] }) },
    orders: { refreshRemote: vi.fn() }, releaseAccountCommandKey, capacityCommandKey: ref("legacy-keep-key"),
    toast: { success: vi.fn(), warn: vi.fn() }, t: ref(zh), fmt: () => "recovered", kindLabel: String,
    hide: vi.fn(), goDevices: vi.fn(), confirming: ref(true), refreshKeepRecovery: vi.fn() };
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node)
    && ["readPendingKeep", "capacityIntent", "submitCanonicalKeepBuy"].includes(node.name?.text ?? ""));
  const compiled = ts.transpileModule(functions.map(node => node.getText(ast)).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const submit = new Function(...Object.keys(deps), `${compiled};return submitCanonicalKeepBuy;`)(...Object.values(deps));
  const changed = { decision: "REPLACE_REQUIRED", sourceDeviceId: 999, targetProductNo: "stellarbox-pro-v2",
    targetProductId: 8, targetPriceUsdt: 9000, payableUsdt: 9000, maxActiveDevices: 6, sufficientFunds: false, decisionSource: "server" };
  await submit("stellarbox-pro-v2", changed);
  expect(commands[legacyIntent]).toBe("legacy-keep-key");
  expect(releaseAccountCommandKey).not.toHaveBeenCalled();
  await submit("stellarbox-pro-v2", changed);
  expect(transport.request).toHaveBeenCalledTimes(2);
  for (const [request] of transport.request.mock.calls) expect(request).toEqual({ method: "POST", path: "/api/app/trade-in/capacity-keep",
    body: { targetProductNo: "stellarbox-pro-v2", expectedPayableUsdt: 2639 }, idempotencyKey: "legacy-keep-key" });
  expect(canonicalCapacityKey).not.toHaveBeenCalled();
  expect(releaseAccountCommandKey).toHaveBeenCalledExactlyOnceWith(deps.CAPACITY_COMMAND_TABLE, "user:7", legacyIntent, "legacy-keep-key");
  expect(deps.toast.success).toHaveBeenCalledOnce();
  expect(deps.goDevices).toHaveBeenCalledOnce();
});

it.each(["malformed", []])("does not treat an invalid commands container as a missing legacy KEEP: %s", async commands => {
  const deps = { app: { accountKey: "user:7" }, CAPACITY_COMMAND_TABLE: "keep-commands",
    readPendingKeepCommand: (account: string, target: string) => parsePendingKeepCommand({ "user:7": { commands } }, account, target),
    captureAccountScope: () => ({}), isCurrentAccountScope: () => true, canonicalCapacityKey: vi.fn(),
    deviceE3Api: { capacityKeep: vi.fn(), replayCapacityKeep: vi.fn() },
    refreshKeepRecovery: vi.fn(), toast: { warn: vi.fn() }, t: ref(zh), confirming: ref(true) };
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node)
    && ["readPendingKeep", "capacityIntent", "submitCanonicalKeepBuy"].includes(node.name?.text ?? ""));
  const compiled = ts.transpileModule(functions.map(node => node.getText(ast)).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const submit = new Function(...Object.keys(deps), `${compiled};return submitCanonicalKeepBuy;`)(...Object.values(deps));
  await submit("stellarbox-s1", { decision: "CAPACITY_AVAILABLE", targetProductNo: "stellarbox-s1", decisionSource: "server" });
  expect(deps.canonicalCapacityKey).not.toHaveBeenCalled();
  expect(deps.deviceE3Api.capacityKeep).not.toHaveBeenCalled();
  expect(deps.deviceE3Api.replayCapacityKeep).not.toHaveBeenCalled();
  expect(deps.toast.warn).toHaveBeenCalledWith(zh.tradein.errPleaseRetry);
});

it("distinguishes missing history from malformed rows and rejects two matching KEEP keys in either order", () => {
  const handler = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "readPendingKeep")!;
  const compiled = ts.transpileModule(handler.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let stored: unknown = "";
  const read = new Function("app", "readPendingKeepCommand", `${compiled};return readPendingKeep;`)(
    { accountKey: "user:7" }, (account: string, target: string) => parsePendingKeepCommand(stored, account, target));
  expect(read("stellarbox-s1")).toBeNull();
  stored = {}; expect(read("stellarbox-s1")).toBeNull();
  stored = { "user:7": { commands: {} } }; expect(read("stellarbox-s1")).toBeNull();
  for (const invalid of ["malformed", [], null, {}]) {
    stored = { "user:7": invalid };
    expect(() => read("stellarbox-s1")).toThrow("CAPACITY_KEEP_COMMAND_STORAGE_INVALID");
  }
  const entries = [["keep|1156|stellarbox-s1|1|1299|1299|6", "first"], ["keep|1157|stellarbox-s1|1|1399|1399|6", "second"]];
  for (const ordered of [entries, [...entries].reverse()]) {
    stored = { "user:7": { commands: Object.fromEntries(ordered) } };
    const before = JSON.stringify(stored);
    expect(() => read("stellarbox-s1")).toThrow("CAPACITY_KEEP_ORIGINAL_COMMAND_AMBIGUOUS");
    expect(JSON.stringify(stored)).toBe(before);
  }
});

it("checks the original KEEP before obtaining a new full-price capacity quote", async () => {
  const choice = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "onChooseFullPrice")!;
  const compiled = ts.transpileModule(choice.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = { state: ref({ kind: "choice", targetKind: "stellarbox-s1" }), quoteLoading: ref(false), remoteApiEnabled: true,
    refreshKeepRecovery: vi.fn(), keepRecovery: ref({ key: "legacy-key" }), keepRecoveryError: ref(false),
    onRecoverKeep: vi.fn(), deviceE3Api: { capacityQuote: vi.fn() } };
  const choose = new Function(...Object.keys(deps), `${compiled}; return onChooseFullPrice;`)(...Object.values(deps));
  await choose();
  expect(deps.onRecoverKeep).toHaveBeenCalledOnce();
  expect(deps.deviceE3Api.capacityQuote).not.toHaveBeenCalled();
});

it("hides remote KEEP in the full-capacity replacement surface", () => {
  const condition = source.match(/v-if="([^"]+)"\s+class="tis-secondary"/)![1];
  const renderAction = new Function("remoteApiEnabled", "state", `return ${condition};`);
  expect(renderAction(true, { kind: "replace", canonicalCapacityQuote: { decision: "REPLACE_REQUIRED" } })).toBe(false);
  expect(renderAction(true, { kind: "replace", canonicalCapacityQuote: { decision: "CAPACITY_AVAILABLE" } })).toBe(true);
  expect(renderAction(false, { kind: "replace" })).toBe(true);
});
