import { describe, expect, it, vi } from "vitest";
import { nextTick, reactive, watch } from "vue";
import ts from "typescript";
import page from "./bundle.vue?raw";

const start = page.indexOf("watch(() => app.accountKey, () => {");
const end = page.indexOf("\n});", start);
if (start < 0 || end < start) throw new Error("bundle account-change watcher is required");
const watcher = ts.transpileModule(page.slice(start, end + 4), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

describe("bundle cold-start account restore", () => {
  it("retries the catalog and policy after auth binds the restored account", async () => {
    const app = reactive({ accountKey: "default" });
    const catalog = vi.fn();
    const phase = vi.fn();
    const policy = vi.fn();
    const wallet = vi.fn();
    const receipt = vi.fn();
    new Function("watch", "app", "restoreReceiptRecovery", "refreshBundleWallet",
      "remoteApiEnabled", "refreshProductCatalog", "refreshServerProductPhase", "refreshBundlePolicy", watcher)(
      watch, app, receipt, wallet, true, catalog, phase, policy,
    );

    expect(catalog).not.toHaveBeenCalled();
    app.accountKey = "user:260";
    await nextTick();
    expect(catalog).toHaveBeenCalledExactlyOnceWith(true);
    expect(phase).toHaveBeenCalledExactlyOnceWith(true);
    expect(policy).toHaveBeenCalledOnce();
    expect(wallet).toHaveBeenCalledOnce();
    expect(receipt).toHaveBeenCalledOnce();

    app.accountKey = "default";
    await nextTick();
    expect(catalog).toHaveBeenCalledOnce();
    expect(policy).toHaveBeenCalledOnce();
  });
});
