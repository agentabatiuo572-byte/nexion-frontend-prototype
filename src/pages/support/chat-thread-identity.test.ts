import ts from "typescript";
import { fmt } from "@/i18n/format";
import { normalizeMessageText, MESSAGE_MAX_LENGTH } from "@/lib/message-length-policy";
import { computed, reactive, ref, shallowRef } from "vue";
import { expect, it, vi } from "vitest";
import source from "./chat.vue?raw";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
const ast = ts.createSourceFile("chat.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const wanted = new Set(["advisorApplies", "headerName", "showUnassignedReceived", "displayAgentName", "isWaitingForAgent"]);
const nodes = ast.statements.filter(node => ts.isFunctionDeclaration(node) ? wanted.has(node.name?.text ?? "")
  : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => wanted.has(d.name.getText(ast))));
const code = ts.transpileModule(nodes.map(node => node.getText(ast)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(messages = zh) {
  const cid = ref("CV-old-support"), startType = ref<string | null>(null);
  const conv = ref<any>({ id: cid.value, type: "support", status: "open", agentName: "Original S", messages: [{ sender: "user" }] });
  const store = reactive({ advisor: { assignmentState: "ASSIGNED", currentAdvisorName: "Current A" }, advisorError: false, advisorLoading: false });
  const state = new Function("computed", "isAi", "isClosedSession", "cid", "startType", "conv", "convStore", "t", "humanType",
    code + ";return { advisorApplies, headerName, showUnassignedReceived };")(
      computed, ref(false), ref(false), cid, startType, conv, store, ref(messages), ref("advisor"));
  return { state, conv, cid, startType, store };
}
it.each([zh, en, vietnamese])("keeps the existing thread's real owner while account advisor changes or becomes unbound", messages => {
  const h = harness(messages);
  expect(h.state.headerName.value).toBe("Original S"); expect(h.state.advisorApplies.value).toBe(false);
  h.store.advisor.assignmentState = "UNBOUND"; h.store.advisor.currentAdvisorName = "";
  expect(h.state.headerName.value).toBe("Original S"); expect(h.state.showUnassignedReceived.value).toBe(false);
  h.conv.value = { ...h.conv.value, agentName: "Refreshed S" };
  expect(h.state.headerName.value).toBe("Refreshed S"); expect(h.cid.value).toBe("CV-old-support");
  for (const agentName of ["", " Unassigned ", "备勤池", "待分配"]) {
    h.conv.value = { ...h.conv.value, agentName };
    expect(h.state.headerName.value).toBe(messages.conversations.unassignedAgent);
    expect(h.state.showUnassignedReceived.value).toBe(true);
  }
  h.cid.value = ""; h.conv.value = undefined; h.startType.value = "advisor";
  expect(h.state.advisorApplies.value).toBe(true);
  expect(h.state.headerName.value).toBe(messages.conversations.image.unassigned);
});

it.each([[zh, "专属客服"], [en, "dedicated support"], [vietnamese, "hỗ trợ riêng"]] as const)(
  "uses dedicated support wording in received, disabled and busy states", (messages, label) => {
    for (const key of ["unassignedReceived", "disabledAdvisor", "busyAdvisor"] as const) {
      expect(messages.conversations.image[key].toLowerCase()).toContain(label);
    }
  });

const preflightCode = ts.transpileModule(ast.statements.filter(node => ts.isFunctionDeclaration(node)
  && ["onSend", "activateHumanPage"].includes(node.name?.text ?? "")).map(node => node.getText(ast)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function preflightHarness(messages = zh) {
  const failedSend = { text: "Original message", kind: "unknown", settled: false, attachmentId: "ATT-original" };
  let rejectRead!: (cause: Error) => void;
  const pendingRead = new Promise<boolean>((_, reject) => { rejectRead = reject; });
  const app = reactive({ accountBindingEpoch: 1 });
  const convStore = reactive({ scopeInvalidated: 1, composer: vi.fn(() => ({ failedSend })),
    hasPendingHumanCreate: vi.fn(() => pendingRead), refreshAdvisor: vi.fn(), saveComposer: vi.fn() });
  const toast = { error: vi.fn(), warn: vi.fn() }, restore = vi.fn(), sendHumanMessage = vi.fn();
  const cid = ref(""), startType = ref("advisor"), humanSendBusy = ref(false);
  const page = new Function("deps", `const { isAi, supportSessionReady, humanSendBusy, cid, startType, remoteApiEnabled,
    app, convStore, imageDraft, t, toast, sendHumanMessage, stopHumanThreadPolling, humanRealtime,
    loadAttachmentPolicy, restoreCompletedHumanCreate, restoreRecoveredComposer, humanComposerKey, revealTick, normalizeMessageText, MESSAGE_MAX_LENGTH, fmt, humanOpenRequest } = deps;
    let novaPageVisible = true;
    ${preflightCode}; return { onSend, activateHumanPage, hide: () => { novaPageVisible = false; } };`)(
    { isAi: ref(false), supportSessionReady: ref(true), humanSendBusy, cid, startType, remoteApiEnabled: true,
      app, convStore, imageDraft: ref(null), t: ref(messages), toast, sendHumanMessage, normalizeMessageText, MESSAGE_MAX_LENGTH, fmt, humanOpenRequest: shallowRef(null),
      stopHumanThreadPolling: vi.fn(), humanRealtime: { show: vi.fn(() => 1) },
      loadAttachmentPolicy: vi.fn(), restoreCompletedHumanCreate: vi.fn(), restoreRecoveredComposer: vi.fn(),
      humanComposerKey: ref("start:advisor"), revealTick: ref(0) });
  return { page, app, convStore, toast, restore, sendHumanMessage, humanSendBusy, failedSend, cid,
    reject: () => rejectRead(new Error("SUPPORT_PENDING_PERSIST_FAILED")) };
}

it.each([zh, en, vietnamese])("reports a blocked send without asserting delivery and restores the draft without changing unknown recovery", async messages => {
  const h = preflightHarness(messages);
  const sending = h.page.onSend("New draft", h.restore); h.reject(); await sending;
  expect(h.toast.error).toHaveBeenCalledWith(messages.conversations.image.sendBlocked, "");
  expect(h.toast.error).not.toHaveBeenCalledWith(messages.conversations.image.sendFailed, "");
  expect(h.restore).toHaveBeenCalledOnce(); expect(h.sendHumanMessage).not.toHaveBeenCalled();
  expect(h.convStore.saveComposer).not.toHaveBeenCalled(); expect(h.convStore.composer().failedSend).toBe(h.failedSend);
  expect(h.humanSendBusy.value).toBe(false);
});

it.each([zh, en, vietnamese])("reports recovery read failure while preserving the original unknown command", async messages => {
  const h = preflightHarness(messages);
  const showing = h.page.activateHumanPage(); h.reject(); await showing;
  expect(h.toast.error).toHaveBeenCalledWith(messages.conversations.image.sendBlocked, "");
  expect(h.convStore.hasPendingHumanCreate).toHaveBeenCalledWith("advisor", "Original message", "ATT-original");
  expect(h.convStore.saveComposer).not.toHaveBeenCalled(); expect(h.convStore.composer().failedSend).toBe(h.failedSend);
});

it.each(["send", "activate"])("silently discards stale %s preflight failures", async entry => {
  for (const stale of ["account", "scope", "hidden", "conversation"]) {
    const h = preflightHarness();
    const pending = entry === "send" ? h.page.onSend("Old draft", h.restore) : h.page.activateHumanPage();
    if (stale === "account") h.app.accountBindingEpoch += 1;
    if (stale === "scope") h.convStore.scopeInvalidated += 1;
    if (stale === "hidden") h.page.hide();
    if (stale === "conversation") h.cid.value = "CV-other";
    h.reject(); await pending;
    expect(h.toast.error).not.toHaveBeenCalled(); expect(h.restore).not.toHaveBeenCalled();
    expect(h.sendHumanMessage).not.toHaveBeenCalled(); expect(h.convStore.saveComposer).not.toHaveBeenCalled();
  }
});


it.each([zh, en, vietnamese])("N10 keeps failed/refreshing advisor identity out of the title", messages => {
  const h = harness(messages); h.cid.value = ""; h.conv.value = undefined; h.startType.value = "advisor";
  h.store.advisor.assignmentState = "ASSIGNED"; h.store.advisor.currentAdvisorName = "";
  h.store.advisorError = true; expect(h.state.headerName.value).toBe(messages.conversations.typeAdvisor);
  expect(h.state.headerName.value).not.toBe(messages.conversations.image.advisorUnavailable);
  h.store.advisorError = false; h.store.advisorLoading = true;
  expect(h.state.headerName.value).toBe(messages.conversations.typeAdvisor);
});

it("rejects an over-limit draft through the real normalizer without touching unknown recovery", async () => {
  const h = preflightHarness(), settled = vi.fn();
  await h.page.onSend("x".repeat(MESSAGE_MAX_LENGTH + 1), h.restore, settled);
  expect(h.toast.warn).toHaveBeenCalledExactlyOnceWith(fmt(zh.conversations.messageTooLong, { n: MESSAGE_MAX_LENGTH }));
  expect(h.restore).toHaveBeenCalledOnce(); expect(settled).toHaveBeenCalledExactlyOnceWith(false);
  expect(h.sendHumanMessage).not.toHaveBeenCalled(); expect(h.convStore.hasPendingHumanCreate).not.toHaveBeenCalled();
  expect(h.convStore.saveComposer).not.toHaveBeenCalled(); expect(h.failedSend.kind).toBe("unknown");
});
