import { describe, expect, it, vi } from "vitest";
import { nextTick, reactive, watch } from "vue";
import ts from "typescript";
import page from "./quota.vue?raw";

const start = page.indexOf("watch([() => app.accountKey, () => app.accountBindingEpoch], () => {");
const end = page.indexOf("\n});", start);
if (start < 0 || end < start) throw new Error("quota account watcher is required");
const watcher = ts.transpileModule(page.slice(start, end + 4), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

describe("quota cold session restore", () => {
  it("refetches the canonical catalog after the account bind clears the pre-auth read", async () => {
    const app = reactive({ accountKey: "default", accountBindingEpoch: 1 });
    const catalog = vi.fn();
    const quota = vi.fn();
    new Function("watch", "app", "resetQuotaPageState", "quotaMounted", "remoteApiEnabled",
      "refreshProductCatalog", "refreshRemoteQuota", watcher)(
      watch, app, vi.fn(), true, true, catalog, quota,
    );

    app.accountKey = "user:281";
    app.accountBindingEpoch += 1;
    await nextTick();
    expect(catalog).toHaveBeenCalledExactlyOnceWith(true);
    expect(quota).toHaveBeenCalledOnce();

    app.accountBindingEpoch += 1;
    await nextTick();
    expect(catalog).toHaveBeenCalledTimes(2);

    app.accountKey = "default";
    await nextTick();
    expect(catalog).toHaveBeenCalledTimes(2);
  });
});
