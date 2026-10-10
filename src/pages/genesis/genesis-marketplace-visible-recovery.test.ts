import { expect, test, vi } from "vitest";
import ts from "typescript";
import page from "./marketplace.vue?raw";

function setup() {
  const start = page.indexOf("let marketplacePageVisible");
  const end = page.indexOf("const { gate, eligible", start);
  const code = ts.transpileModule(page.slice(start, end) + ";return { retryMarketplaceFacts };",
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const mounted: (() => void)[] = [], shown: (() => void)[] = [], hidden: (() => void)[] = [], removed: (() => void)[] = [];
  const revisions = new Set<() => void>();
  const cfg = { refresh: vi.fn(async () => {}) };
  const genesis = { remotePublicReadState: "loading", syncRemote: vi.fn(async () => true) };
  const report = vi.fn();
  const registered = vi.fn(() => vi.fn());
  const methods = new Function("cfg", "genesis", "remoteApiEnabled", "reactive", "nextTick",
    "onMounted", "onShow", "onHide", "onUnmounted", "subscribeRuntimeRevision",
    "registerActivePageRefresh", "captureAccountScope", "isCurrentAccountScope", "sessionVault",
    "authenticatedPageObservationReporter", "h3ObservationApi", code)(
    cfg, genesis, true, (value: unknown) => value, async () => {},
    (cb: () => void) => mounted.push(cb), (cb: () => void) => shown.push(cb),
    (cb: () => void) => hidden.push(cb), (cb: () => void) => removed.push(cb),
    (cb: () => void) => { revisions.add(cb); return () => revisions.delete(cb); },
    registered, () => ({}), () => true, { read: () => null }, { report }, { secondaryMarket: vi.fn() },
  ) as { retryMarketplaceFacts(): Promise<void> };
  return { ...methods, mounted, shown, hidden, removed, revisions, cfg, genesis, report, registered };
}

test("direct H5 route mount loads marketplace facts without requiring page onShow", async () => {
  const view = setup();
  view.mounted.forEach((cb) => cb());
  view.shown.forEach((cb) => cb());
  await vi.waitFor(() => expect(view.genesis.syncRemote).toHaveBeenCalledOnce());
  expect(view.cfg.refresh).toHaveBeenCalledOnce();
  expect(view.registered).toHaveBeenCalledOnce();
  view.removed[0]();
});

test("visible runtime revisions request one fresh read after the stale in-flight read", async () => {
  const view = setup();
  let finish!: (value: boolean) => void;
  view.genesis.syncRemote.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  view.shown[0]();
  await vi.waitFor(() => expect(view.genesis.syncRemote).toHaveBeenCalledOnce());
  expect(view.revisions.size).toBe(1);
  view.revisions.forEach((cb) => cb());
  view.revisions.forEach((cb) => cb());
  const pending = view.retryMarketplaceFacts();
  finish(false);
  await pending;
  expect(view.genesis.syncRemote).toHaveBeenCalledTimes(2);
  expect(view.report).not.toHaveBeenCalled();
  view.hidden[0]();
  view.revisions.forEach((cb) => cb());
  await Promise.resolve();
  expect(view.genesis.syncRemote).toHaveBeenCalledTimes(2);
  view.shown[0]();
  await view.retryMarketplaceFacts();
  expect(view.genesis.syncRemote).toHaveBeenCalledTimes(3);
  view.removed[0]();
  expect(view.revisions.size).toBe(0);
});

test("hiding before config settles stops store reads and observation", async () => {
  const view = setup();
  let finish!: () => void;
  view.cfg.refresh.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  view.shown[0]();
  view.hidden[0]();
  finish();
  await view.retryMarketplaceFacts();
  expect(view.genesis.syncRemote).not.toHaveBeenCalled();
  expect(view.report).not.toHaveBeenCalled();
  view.removed[0]();
});

test("a failed read stays unavailable and the next explicit retry can read again", async () => {
  const view = setup();
  view.genesis.syncRemote.mockImplementationOnce(async () => {
    view.genesis.remotePublicReadState = "unavailable";
    return false;
  });
  view.shown[0]();
  await view.retryMarketplaceFacts();
  expect(view.genesis.remotePublicReadState).toBe("unavailable");
  expect(view.report).not.toHaveBeenCalled();
  view.genesis.syncRemote.mockImplementationOnce(async () => {
    view.genesis.remotePublicReadState = "ready";
    return true;
  });
  await view.retryMarketplaceFacts();
  expect(view.genesis.remotePublicReadState).toBe("ready");
  expect(view.genesis.syncRemote).toHaveBeenCalledTimes(2);
  expect(view.report).not.toHaveBeenCalled();
  view.removed[0]();
});

test("runtime read rejection is consumed and a later retry starts another read", async () => {
  const view = setup();
  view.shown[0]();
  await view.retryMarketplaceFacts();
  view.genesis.syncRemote.mockRejectedValueOnce(new Error("LOCAL_READ_FAILURE"));
  view.revisions.forEach((cb) => cb());
  await vi.waitFor(() => expect(view.genesis.syncRemote).toHaveBeenCalledTimes(2));
  await view.retryMarketplaceFacts();
  expect(view.genesis.syncRemote).toHaveBeenCalledTimes(3);
  expect(view.report).not.toHaveBeenCalled();
  expect(page.match(/@(?:click|cta)="retryMarketplaceFacts\(\)"/g)).toHaveLength(3);
  view.removed[0]();
});

test.each(["settlement", "after-cleanup"])("a revision at %s starts a fresh read", async (timing) => {
  const view = setup();
  let finish!: (value: boolean) => void;
  const read = new Promise<boolean>((resolve) => { finish = resolve; });
  view.genesis.syncRemote.mockReturnValueOnce(read);
  view.mounted[0]();
  await vi.waitFor(() => expect(view.genesis.syncRemote).toHaveBeenCalledOnce());
  const pending = view.retryMarketplaceFacts();
  const revise = () => view.revisions.forEach((cb) => cb());
  if (timing === "settlement") void read.then(revise);
  finish(true);
  await pending;
  if (timing === "after-cleanup") revise();
  await vi.waitFor(() => expect(view.genesis.syncRemote).toHaveBeenCalledTimes(2));
  expect(view.cfg.refresh).toHaveBeenCalledTimes(2);
  expect(view.report).not.toHaveBeenCalled();
  view.removed[0]();
});
