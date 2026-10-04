import ts from "typescript";
import { effectScope, nextTick, reactive, ref, watch } from "vue";
import { describe, expect, it, vi } from "vitest";
import pageSource from "./wallet-bills.vue?raw";

const start = pageSource.indexOf("watch([remoteSessionReady, () => app.accountBindingEpoch]");
const end = pageSource.indexOf("useManualScrollLoadMore(scrollAnchor", start);
if (start < 0 || end < start) throw new Error("wallet bills account watcher missing");
const watcher = ts.transpileModule(pageSource.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;

describe("wallet bills account rebind", () => {
  it("refetches the active filter after a same-page account switch even when readiness stays true", async () => {
    const scope = effectScope();
    try {
      const app = reactive({ accountBindingEpoch: 1 });
      const remoteSessionReady = ref(true);
      const pager = reactive({ rows: ["A-1"] });
      const refreshLedger = vi.fn(() => { pager.rows = ["B-1"]; });
      scope.run(() => new Function("watch", "remoteSessionReady", "app", "refreshLedger", watcher)(
        watch, remoteSessionReady, app, refreshLedger,
      ));

      // The store clears all account pagers during rebind; no page navigation occurs.
      pager.rows = [];
      app.accountBindingEpoch += 1;
      await nextTick();
      expect(refreshLedger).toHaveBeenCalledTimes(1);
      expect(pager.rows).toEqual(["B-1"]);

      pager.rows = [];
      app.accountBindingEpoch += 1;
      await nextTick();
      expect(refreshLedger).toHaveBeenCalledTimes(2);
      expect(pager.rows).toEqual(["B-1"]);
    } finally {
      scope.stop();
    }
  });

  it("starts the first read when a cold restored session becomes ready", async () => {
    const scope = effectScope();
    try {
      const app = reactive({ accountBindingEpoch: 0 });
      const remoteSessionReady = ref(false);
      const refreshLedger = vi.fn();
      scope.run(() => new Function("watch", "remoteSessionReady", "app", "refreshLedger", watcher)(
        watch, remoteSessionReady, app, refreshLedger,
      ));
      remoteSessionReady.value = true;
      app.accountBindingEpoch = 1;
      await nextTick();
      expect(refreshLedger).toHaveBeenCalledTimes(1);
    } finally {
      scope.stop();
    }
  });
});
