// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { effectScope, reactive, ref, watch } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { runRemoteOrdersRefresh } from "@/lib/remote-orders-refresh";
import { binarySessionReady } from "@/lib/binary-session-ready";

const source = readFileSync(new URL("./me.vue", import.meta.url), "utf8");
function section(start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error("Me orders lifecycle missing");
  return source.slice(from, to);
}
const implementation = ts.transpileModule([
  section("let remoteSecurityRequest", "const iconPaths"),
  section("async function refreshRemoteOrders", "async function refreshRemoteSecurity"),
  "function refreshRemoteMe() { return refreshRemoteOrders(); }",
  section("watch(() => [app.accountKey", "function handleQuickItem"),
].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const disposals: Array<() => void> = [];
afterEach(() => { disposals.splice(0).forEach((dispose) => dispose()); });
const settled = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

function page() {
  const rows = ref<Array<{ id: string }>>([]);
  const clear = subscribeRuntimeRevision(() => { rows.value = []; });
  const refreshRemote = vi.fn(async () => { rows.value = [{ id: "original-order" }]; });
  const hooks: Record<string, Array<() => void>> = { show: [], hide: [], dispose: [] };
  const auth = reactive({ isAuthenticated: true, accountId: "user:607" });
  const failed = ref(false);
  const loading = ref(false);
  const deps = {
    watch, subscribeRuntimeRevision, runRemoteOrdersRefresh, binarySessionReady,
    remoteApiEnabled: true, app: reactive({ accountKey: "user:607", accountBindingEpoch: 1 }),
    auth, sessionVault: { read: () => ({ user: { userId: 607 } }) },
    orders: { refreshRemote }, remoteOrdersLoading: loading, remoteOrdersFailed: failed,
    onShow: (callback: () => void) => hooks.show.push(callback),
    onHide: (callback: () => void) => hooks.hide.push(callback),
    onUnmounted: (callback: () => void) => hooks.dispose.push(callback),
  };
  const scope = effectScope();
  scope.run(() => new Function(...Object.keys(deps), implementation)(...Object.values(deps)));
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    hooks.dispose.forEach((callback) => callback());
    scope.stop();
    clear();
  };
  disposals.push(dispose);
  return { rows, refreshRemote, hooks, auth, failed, loading, dispose };
}

describe("Me orders survive catalog revision invalidation", () => {
  it("restores the visible existing order after a later catalog response", async () => {
    const p = page();
    p.hooks.show.forEach((callback) => callback());
    await settled();
    expect(p.rows.value).toHaveLength(1);
    advanceRuntimeRevision();
    await settled();
    expect(p.refreshRemote).toHaveBeenCalledTimes(2);
    expect(p.rows.value).toHaveLength(1);
  });

  it("keeps the new retryable failure when an older read later finishes", async () => {
    const p = page();
    let finish!: () => void;
    p.refreshRemote.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockRejectedValueOnce(new Error("new read failed"));
    p.hooks.show.forEach((callback) => callback());
    advanceRuntimeRevision();
    await settled();
    expect(p.failed.value).toBe(true);
    finish();
    await settled();
    expect(p.failed.value).toBe(true);
    expect(p.loading.value).toBe(false);
  });

  it("does not add reads for a hidden, unbound or disposed page", async () => {
    const p = page();
    p.hooks.show.forEach((callback) => callback());
    await settled();
    p.hooks.hide.forEach((callback) => callback());
    advanceRuntimeRevision();
    await settled();
    expect(p.refreshRemote).toHaveBeenCalledTimes(1);
    p.hooks.show.forEach((callback) => callback());
    await settled();
    p.auth.isAuthenticated = false;
    advanceRuntimeRevision();
    await settled();
    expect(p.refreshRemote).toHaveBeenCalledTimes(2);
    p.dispose();
    p.auth.isAuthenticated = true;
    advanceRuntimeRevision();
    await settled();
    expect(p.refreshRemote).toHaveBeenCalledTimes(2);
  });
});
