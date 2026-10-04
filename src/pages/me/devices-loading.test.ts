import { describe, expect, it } from "vitest";
import ts from "typescript";
import source from "./devices.vue?raw";

const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
const ast = ts.createSourceFile("devices.ts", script, ts.ScriptTarget.Latest, true);
const names = ["trialReady", "inventoryReady", "inventoryError", "inventoryLoading", "inventoryStale"];
const declarations = new Map<string, string>();
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) {
    declarations.set(node.name.getText(ast), node.getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);

function inventoryState(
  remoteApiEnabled: boolean,
  app: Record<string, unknown>,
  trial: Record<string, unknown>,
  environment = "prod",
  catalogStatus = "loading",
) {
  const computed = (getter: () => boolean) => ({ get value() { return getter(); } });
  const body = names.map((name) => `const ${declarations.get(name)};`).join("\n");
  return (new Function("remoteApiEnabled", "app", "trial", "computed", "apiRuntimeConfig", "productCatalogState", `${body}
    return { ready: inventoryReady.value, loading: inventoryLoading.value, error: inventoryError.value, stale: inventoryStale.value };`
  )(remoteApiEnabled, app, trial, computed, { environment }, { status: catalogStatus })) as {
    ready: boolean; loading: boolean; error: boolean; stale: boolean;
  };
}

describe("device inventory first render", () => {
  it("waits for fleet and trial authority before exposing slots, binding, or empty inventory", () => {
    expect(source).toContain('v-if="inventoryLoading"');
    expect(source).toContain('v-else-if="inventoryError"');
    expect(source).toContain('v-if="inventoryReady" class="mx-4"');
    const app: Record<string, unknown> = { remoteFleetHasSnapshot: false, remoteFleetStatus: "idle" };
    const trial: Record<string, unknown> = { authorityStatus: "unknown", authorityServerState: null };
    expect(inventoryState(true, app, trial)).toEqual({ ready: false, loading: true, error: false, stale: false });
    app.remoteFleetHasSnapshot = true;
    expect(inventoryState(true, app, trial).ready).toBe(false);
    trial.authorityStatus = "ready";
    trial.authorityServerState = "ACTIVE";
    expect(inventoryState(true, app, trial)).toEqual({ ready: true, loading: false, error: false, stale: false });
    trial.authorityStatus = "loading";
    expect(inventoryState(true, app, trial).ready).toBe(true);
  });

  it("keeps true empty and unbound accounts visible after authority, and shows a retryable error on failure", () => {
    const app: Record<string, unknown> = { remoteFleetHasSnapshot: true, remoteFleetStatus: "ready" };
    const trial: Record<string, unknown> = { authorityStatus: "ready", authorityServerState: "ELIGIBLE" };
    expect(inventoryState(true, app, trial).ready).toBe(true);
    app.remoteFleetHasSnapshot = false;
    app.remoteFleetStatus = "error";
    expect(inventoryState(true, app, trial)).toEqual({ ready: false, loading: false, error: true, stale: false });
    expect(inventoryState(false, app, trial).ready).toBe(true);
  });

  it("shows retry when the development catalog blocks the first fleet request", () => {
    const app = { remoteFleetHasSnapshot: false, remoteFleetStatus: "idle" };
    const trial = { authorityStatus: "ready", authorityServerState: "ELIGIBLE" };
    expect(inventoryState(true, app, trial, "dev", "loading").loading).toBe(true);
    expect(inventoryState(true, app, trial, "dev", "error")).toEqual({ ready: false, loading: false, error: true, stale: false });
    expect(source).toContain('@cta="retryInventory"');
    expect(source).toContain("refreshRemoteFleetAfterCatalog(app.accountKey)");
  });

  it("retains a confirmed fleet after refresh failure and labels it stale", () => {
    const app = { remoteFleetHasSnapshot: true, remoteFleetStatus: "error" };
    const trial = { authorityStatus: "ready", authorityServerState: "ACTIVE" };
    expect(inventoryState(true, app, trial)).toEqual({ ready: true, loading: false, error: false, stale: true });
    expect(source).toContain('v-if="inventoryStale"');
    expect(source).toContain('t.myDevices.inventoryStaleWarning');
  });
});
