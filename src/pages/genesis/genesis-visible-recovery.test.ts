import { expect, test, vi } from "vitest";
import ts from "typescript";
import page from "./genesis.vue?raw";

function setup() {
  const start = page.indexOf("let refreshInFlight:");
  const end = page.indexOf("const locale =", start);
  const actionStart = page.indexOf("async function openSheet()");
  const actionEnd = page.indexOf("/** 资格 sheet", actionStart);
  const code = ts.transpileModule(page.slice(start, end) + page.slice(actionStart, actionEnd)
    + ";return {refreshGenesisPage,openSheet};", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const shown: (() => void)[] = [], hidden: (() => void)[] = [], removed: (() => void)[] = [];
  const revisions = new Set<() => void>();
  const cfg = { refresh: vi.fn(async () => {}) };
  const genesis = { syncRemote: vi.fn(async () => true) };
  const block = { value: "configUnavailable" as string | null };
  const sheet = { value: false };
  const toast = { success: vi.fn(), error: vi.fn() };
  const methods = new Function("cfg", "genesis", "onMounted", "onShow", "onHide", "onUnmounted",
    "subscribeRuntimeRevision", "remoteApiEnabled", "block", "toast", "t", "toastBlocked",
    "goMarketplace", "eligible", "gate", "sheetOpen", "eligSheetOpen", code)(
    cfg, genesis, (cb: () => void) => shown.push(cb), (cb: () => void) => shown.push(cb),
    (cb: () => void) => hidden.push(cb), (cb: () => void) => removed.push(cb),
    (cb: () => void) => { revisions.add(cb); return () => revisions.delete(cb); }, true,
    block, toast, { value: { genesis: { marketClosed: { retryOk: "ready" } } } }, vi.fn(), vi.fn(),
    { value: true }, { value: { capReached: false } }, sheet, { value: false },
  ) as { refreshGenesisPage(): Promise<void>; openSheet(): Promise<void> };
  return { ...methods, shown, hidden, removed, revisions, cfg, genesis, block, sheet };
}

test("retry refreshes both config and missing public supply without buying", async () => {
  const view = setup();
  view.shown[0]();
  await view.refreshGenesisPage();
  view.cfg.refresh.mockClear();
  view.genesis.syncRemote.mockClear();
  view.genesis.syncRemote.mockImplementation(async () => { view.block.value = null; return true; });
  await view.openSheet();
  expect(view.cfg.refresh).toHaveBeenCalledOnce();
  expect(view.genesis.syncRemote).toHaveBeenCalledOnce();
  expect(view.block.value).toBeNull();
  expect(view.sheet.value).toBe(false);
});

test("coalesces revisions during a read into a fresh pass and unsubscribes while hidden", async () => {
  const view = setup();
  let finish!: (value: boolean) => void;
  view.genesis.syncRemote.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  view.shown[0]();
  await vi.waitFor(() => expect(view.genesis.syncRemote).toHaveBeenCalledOnce());
  expect(view.revisions.size).toBe(1);
  view.revisions.forEach((cb) => cb());
  view.revisions.forEach((cb) => cb());
  const pending = view.refreshGenesisPage();
  finish(false);
  await pending;
  expect(view.genesis.syncRemote).toHaveBeenCalledTimes(2);
  view.hidden[0]();
  view.revisions.forEach((cb) => cb());
  await Promise.resolve();
  expect(view.genesis.syncRemote).toHaveBeenCalledTimes(2);
  view.shown[0]();
  await view.refreshGenesisPage();
  expect(view.genesis.syncRemote).toHaveBeenCalledTimes(3);
  view.removed[0]();
  expect(view.revisions.size).toBe(0);
});
