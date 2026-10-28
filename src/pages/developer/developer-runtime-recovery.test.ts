import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { watch, reactive, computed, ref } from "vue";
import source from "./developer.vue?raw";

function execute(block: string, bindings: Record<string, unknown>, result = "undefined") {
  const js = ts.transpileModule(block, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return ${result};`)(...Object.values(bindings));
}

describe("developer visible runtime recovery", () => {
  function setup() {
    const shown: Array<() => void> = [], hidden: Array<() => void> = [], gone: Array<() => void> = [];
    const revisions = new Set<() => void>();
    const reads = { loadLatestRequest: vi.fn(), loadResources: vi.fn(), loadDocs: vi.fn() };
    const resets = { clearDeveloperConfirms: vi.fn(), resetDocsScope: vi.fn(), resetResourceScope: vi.fn() };
    execute(`let requestGeneration = 0, requestKey = null, docsGeneration = 0, resourceGeneration = 0, resourceReadVersion = 0;
      ${source.slice(source.indexOf("let developerPageVisible = false;"), source.indexOf("watch([() => String(app.accountKey)"))}`, {
      ...reads, ...resets, remoteApiEnabled: true, submitting: { value: false }, watch, apiRuntimeConfig: reactive({ environment: "dev" }),
      newWebhookSecret: { value: null }, resourceBusyKeys: { value: new Set() }, resourceIntentKeys: new Map(), resourcesLoading: { value: false },
      latestRequest: { value: null }, latestLoadFailed: { value: false }, latestLoading: { value: false },
      onShow: (f: () => void) => shown.push(f), onHide: (f: () => void) => hidden.push(f),
      onUnmounted: (f: () => void) => gone.push(f),
      subscribeRuntimeRevision: (f: () => void) => { revisions.add(f); return () => revisions.delete(f); },
    });
    return { shown, hidden, gone, revisions, reads, resets };
  }
  it("starts fresh reads after hydration invalidates the visible page", () => {
    const h = setup(); h.shown[0]();
    h.revisions.forEach(f => f());
    for (const read of Object.values(h.reads)) expect(read).toHaveBeenCalledTimes(2);
    expect(h.resets.clearDeveloperConfirms).toHaveBeenCalledOnce();
    expect(h.resets.resetResourceScope).not.toHaveBeenCalled();
    expect(h.resets.resetDocsScope).not.toHaveBeenCalled();
  });
  it("does not fetch hidden pages and unsubscribes on unmount", () => {
    const h = setup(); h.shown[0](); h.hidden[0](); h.revisions.forEach(f => f());
    for (const read of Object.values(h.reads)) expect(read).toHaveBeenCalledOnce();
    h.shown[0](); for (const read of Object.values(h.reads)) expect(read).toHaveBeenCalledTimes(2);
    h.gone[0](); expect(h.revisions.size).toBe(0);
  });
  it("keeps the refreshed approval receipt and loading state when an older read finishes last", async () => {
    let epoch = 0;
    const pending: Array<(value: unknown) => void> = [];
    const latestRequest = { value: null }, latestLoading = { value: false }, latestLoadFailed = { value: false };
    const load = execute(`let requestGeneration = 0, requestKey = null;
      ${source.slice(source.indexOf("function loadLatestRequest()"), source.indexOf("async function loadResources"))}`, {
      remoteApiEnabled: true, developerEnvironmentInvalidated: false, app: { accountKey: "demo" }, latestRequest, latestLoading, latestLoadFailed,
      captureAccountScope: () => "demo", isCurrentAccountScope: () => true,
      captureRuntimeRevision: () => epoch, isCurrentRuntimeRevision: (e: number) => e === epoch,
      developerAccessApi: { latest: () => new Promise(resolve => pending.push(resolve)) },
    }, "loadLatestRequest") as () => void;
    load(); epoch++; load();
    pending[1]({ requestNo: "current", status: "APPROVED" });
    await vi.waitFor(() => expect(latestLoading.value).toBe(false));
    pending[0]({ requestNo: "stale", status: "PENDING" });
    await Promise.resolve(); await Promise.resolve();
    expect(latestRequest.value).toEqual({ requestNo: "current", status: "APPROVED" });
    expect(latestLoadFailed.value).toBe(false);
  });
});

it("keeps an existing request receipt during a warm read, then clears an actual failure", async () => {
  const latestRequest = ref<unknown>({requestNo: 'current', status: 'PENDING'}), latestLoading = ref(false), latestLoadFailed = ref(false);
  let reject!: (reason: unknown) => void;
  const load = execute(`let requestGeneration = 0, requestKey = null;
    ${source.slice(source.indexOf("function loadLatestRequest()"), source.indexOf("async function loadResources"))}`, {
    remoteApiEnabled: true, developerEnvironmentInvalidated: false, app: {accountKey:'user:a'}, latestRequest, latestLoading, latestLoadFailed,
    captureAccountScope:()=>1,isCurrentAccountScope:()=>true,captureRuntimeRevision:()=>1,isCurrentRuntimeRevision:()=>true,
    developerAccessApi:{latest:()=>new Promise((_done,fail)=>{reject=fail;})},
  }, 'loadLatestRequest');
  load(); expect(latestRequest.value).toEqual({requestNo:'current',status:'PENDING'});expect(latestLoading.value).toBe(true);
  reject(new Error('401'));await Promise.resolve();await Promise.resolve();await Promise.resolve();
  expect(latestRequest.value).toBeNull();expect(latestLoadFailed.value).toBe(true);
});
it("retained masked resources never grant mutation rights during a read", () => {
  const resourcesReady=ref(true),resourcesLoading=ref(true);
  const condition=source.slice(source.indexOf('const canManageResources ='),source.indexOf('const resourceBusyKeys ='));
  const canManage = execute(condition,{computed,resourcesReady,resourcesLoading,resourcesApprovalRequired:ref(false),resourcesNotReleased:ref(false)},'canManageResources');
  expect(canManage.value).toBe(false);resourcesLoading.value=false;expect(canManage.value).toBe(true);resourcesReady.value=false;expect(canManage.value).toBe(false);
});
