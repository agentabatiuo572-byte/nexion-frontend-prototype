// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
const source = readFileSync(new URL("./unilevel.vue", import.meta.url), "utf8");
const start = source.indexOf("async function loadRemote()");
const end = source.indexOf("function activateRemoteLoadMore", start);
if (start < 0 || end <= start) throw new Error("Unilevel loaders not found");
const code = ts.transpileModule(`let remoteRequest = 0; const remoteSessionReady = { value: true }; ${source.slice(start, end)}; return { loadRemote, loadMoreRemote };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const build = new Function("remoteApiEnabled", "mounted", "app", "remoteSnapshot", "remoteState", "remoteLoadMoreStatus", "captureAccountScope", "captureRuntimeRevision", "isCurrentAccountScope", "isCurrentRuntimeRevision", "teamInsightsApi", code);
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function page(id: string, number = 1) { return { events: [{ id }], page: number, pageSize: 20, totalRows: 60, snapshotAt: id }; }
function setup() {
  const snapshot = ref(page("old-1")); const state = ref("ready"); const more = ref("idle"); const api = { unilevel: vi.fn() };
  const handlers = build(true, true, { accountKey: "account-A" }, snapshot, state, more, () => 1, () => 1, () => true, () => true, api);
  return { snapshot, state, more, api, ...handlers };
}
describe("unilevel pagination refresh isolation", () => {
  it("preserves new pagination loading when an older page returns", async () => {
    const s=setup(); const old=deferred<ReturnType<typeof page>>(); const latest=deferred<ReturnType<typeof page>>();
    s.api.unilevel.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page("new-1")).mockReturnValueOnce(latest.promise);
    const oldPending=s.loadMoreRemote(); await s.loadRemote(); const newPending=s.loadMoreRemote();
    old.resolve(page("old-2",2)); await oldPending;
    expect(s.more.value).toBe("loading"); expect(s.snapshot.value.events).toEqual([{id:"new-1"}]);
    latest.resolve(page("new-2",2)); await newPending;
    expect(s.snapshot.value.events).toEqual([{id:"new-1"},{id:"new-2"}]); expect(s.more.value).toBe("idle");
  });
  it("rejects an unexpected page without leaving the current loader stuck", async () => {
    const s=setup(); s.api.unilevel.mockResolvedValueOnce(page("wrong",3)); await s.loadMoreRemote();
    expect(s.snapshot.value.events).toEqual([{id:"old-1"}]); expect(s.more.value).toBe("error");
  });
  it("drops old page success after a newer first page has loaded", async () => {
    const s=setup(); const old=deferred<ReturnType<typeof page>>();
    s.api.unilevel.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page("new-1"));
    const pending=s.loadMoreRemote(); await s.loadRemote(); old.resolve(page("old-2",2)); await pending;
    expect(s.snapshot.value.events).toEqual([{id:"new-1"}]); expect(s.more.value).toBe("idle");
  });
  it("does not mark the refreshed list failed when old pagination rejects", async () => {
    const s=setup(); const old=deferred<ReturnType<typeof page>>();
    s.api.unilevel.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page("new-1"));
    const pending=s.loadMoreRemote(); await s.loadRemote(); old.reject(new Error("old network failure")); await pending;
    expect(s.more.value).toBe("idle"); expect(s.snapshot.value.events).toEqual([{id:"new-1"}]);
  });
  it("appends the current next page and permits retry after a current failure", async () => {
    const s=setup(); s.api.unilevel.mockRejectedValueOnce(new Error("network failure"));
    await s.loadMoreRemote(); expect(s.more.value).toBe("error");
    s.api.unilevel.mockResolvedValueOnce(page("old-2",2)); await s.loadMoreRemote();
    expect(s.snapshot.value.events).toEqual([{id:"old-1"},{id:"old-2"}]); expect(s.more.value).toBe("idle");
  });
});
