// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { isDeveloperApprovalRequired, isDeveloperCapabilityUnavailable } from "./developer-access-state";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const source = readFileSync(new URL("./developer.vue", import.meta.url), "utf8");
function extractFunction(name: string): string {
  const start = source.indexOf(`async function ${name}`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${name}`);
}
const loadResourcesSource = extractFunction("loadResources");

function createHarness() {
  const keyReads: Deferred<unknown[]>[] = [];
  const hookReads: Deferred<unknown[]>[] = [];
  let currentScope = "scope-a";
  const apiKeys = { value: [] as unknown[] };
  const webhooks = { value: [] as unknown[] };
  const resourcesLoading = { value: false };
  const resourcesReady = { value: false };
  const resourcesLoadFailed = { value: false };
  const resourcesApprovalRequired = { value: false };
  const resourcesNotReleased = { value: false };
  const newWebhookSecret = { value: "one-time-fixture-secret" as string | null };
  const busy = new Set<string>();
  const makeLoadResources = new Function("deps", `
    const { apiKeys, webhooks, resourcesLoading, resourcesReady, resourcesLoadFailed, resourcesApprovalRequired, resourcesNotReleased, isDeveloperApprovalRequired, isDeveloperCapabilityUnavailable, newWebhookSecret,
      developerResourcesApi, resourceFence, resourceFenceCurrent, resourceBusy,
      setResourceBusy, refreshRotationRecovery } = deps;
    const remoteApiEnabled = true;
    const webhookDeliveries = { value: {} };
    let resourceReadVersion = 0;
    ${loadResourcesSource}
    return loadResources;
  `) as (deps: Record<string, unknown>) => (fence?: { scope: string }) => Promise<void>;
  const loadResources = makeLoadResources({
    apiKeys, webhooks, resourcesLoading, resourcesReady, resourcesLoadFailed, resourcesApprovalRequired, resourcesNotReleased, newWebhookSecret,
    isDeveloperApprovalRequired, isDeveloperCapabilityUnavailable,
    developerResourcesApi: {
      listKeys: () => { const read = deferred<unknown[]>(); keyReads.push(read); return read.promise; },
      listWebhooks: () => { const read = deferred<unknown[]>(); hookReads.push(read); return read.promise; },
    },
    resourceFence: () => ({ scope: currentScope }),
    resourceFenceCurrent: (fence: { scope: string }) => fence.scope === currentScope,
    resourceBusy: (intent: string) => busy.has(intent),
    setResourceBusy: (intent: string, value: boolean) => { if (value) busy.add(intent); else busy.delete(intent); },
    refreshRotationRecovery: () => undefined,
  });
  return {
    loadResources, keyReads, hookReads, state: { apiKeys, webhooks, resourcesLoading, resourcesReady, resourcesLoadFailed, resourcesApprovalRequired, resourcesNotReleased, newWebhookSecret },
    changeScope: () => { currentScope = "scope-b"; },
  };
}
async function settle(read: Deferred<unknown[]>, value: unknown[]): Promise<void> { read.resolve(value); await Promise.resolve(); }

async function startTwoReads(harness: ReturnType<typeof createHarness>) {
  const first = harness.loadResources();
  await Promise.resolve();
  const second = harness.loadResources();
  await Promise.resolve();
  return { first, second };
}

describe("developer loadResources concurrent read authority", () => {
  it("shows the authoritative approval prerequisite instead of a generic resource failure", async () => {
    const h = createHarness(); const read = h.loadResources();
    const denied = new ApiError({ kind: "http", status: 403, code: 403, message: "DEVELOPER_ACCESS_APPROVAL_REQUIRED" });
    h.keyReads[0].reject(denied); h.hookReads[0].reject(denied); await read;
    expect(h.state.resourcesApprovalRequired.value).toBe(true);
    expect(h.state.resourcesLoadFailed.value).toBe(false);
    expect(h.state.resourcesReady.value).toBe(false);
    expect(h.state.newWebhookSecret.value).toBeNull();
    const recovered = h.loadResources();
    h.keyReads[1].resolve([]); h.hookReads[1].resolve([]); await recovered;
    expect(h.state.resourcesApprovalRequired.value).toBe(false);
    expect(h.state.resourcesReady.value).toBe(true);
  });
  it("keeps a one-time secret hidden but recoverable after a generic readback failure", async () => {
    const h = createHarness(); const read = h.loadResources();
    h.keyReads[0].reject(new ApiError({ kind: "network", message: "offline" }));
    h.hookReads[0].resolve([]); await read;
    expect(h.state.resourcesReady.value).toBe(false);
    expect(h.state.resourcesLoadFailed.value).toBe(true);
    expect(h.state.resourcesApprovalRequired.value).toBe(false);
    expect(h.state.newWebhookSecret.value).toBe("one-time-fixture-secret");
  });

  it("reports an undeployed capability as a product state instead of a load failure", async () => {
    const h = createHarness(); const read = h.loadResources();
    const notReleased = new ApiError({
      kind: "http", status: 503, message: "DEVELOPER_ACCESS_SANDBOX_RUN_ID_REQUIRED",
    });
    h.keyReads[0].reject(notReleased); h.hookReads[0].reject(notReleased); await read;
    expect(h.state.resourcesNotReleased.value).toBe(true);
    expect(h.state.resourcesLoadFailed.value).toBe(false);
    expect(h.state.resourcesApprovalRequired.value).toBe(false);
    expect(h.state.resourcesReady.value).toBe(false);
  });
  it("does not let an old empty result overwrite mutation-triggered nonempty readback", async () => {
    const h = createHarness();
    const { first, second } = await startTwoReads(h);
    expect(h.keyReads).toHaveLength(2);
    expect(h.hookReads).toHaveLength(2);

    await settle(h.keyReads[1], [{ id: 2 }]);
    await settle(h.hookReads[1], [{ id: 9, name: "after-mutation" }]);
    await second;
    await settle(h.keyReads[0], []);
    await settle(h.hookReads[0], []);
    await first;

    expect(h.state.apiKeys.value).toEqual([{ id: 2 }]);
    expect(h.state.webhooks.value).toEqual([{ id: 9, name: "after-mutation" }]);
    expect(h.state.resourcesReady.value).toBe(true);
    expect(h.state.resourcesLoadFailed.value).toBe(false);
  });

  it("does not let an old failure or finally clear a newer read's state", async () => {
    const h = createHarness();
    const { first, second } = await startTwoReads(h);
    expect(h.keyReads).toHaveLength(2);
    expect(h.hookReads).toHaveLength(2);

    h.keyReads[0].reject(new Error("old key read failed"));
    h.hookReads[0].reject(new Error("old hook read failed"));
    await first;
    expect(h.state.resourcesLoadFailed.value).toBe(false);
    expect(h.state.resourcesLoading.value).toBe(true);

    await settle(h.keyReads[1], [{ id: 2 }]);
    await settle(h.hookReads[1], [{ id: 9 }]);
    await second;
    expect(h.state.resourcesLoading.value).toBe(false);
    expect(h.state.resourcesLoadFailed.value).toBe(false);
    expect(h.state.resourcesReady.value).toBe(true);
  });

  it("drops a response after a resource scope switch", async () => {
    const h = createHarness();
    const old = h.loadResources();
    await Promise.resolve();
    expect(h.keyReads).toHaveLength(1);
    h.changeScope();
    await settle(h.keyReads[0], [{ id: 1 }]);
    await settle(h.hookReads[0], [{ id: 1 }]);
    await old;

    expect(h.state.apiKeys.value).toEqual([]);
    expect(h.state.webhooks.value).toEqual([]);
    expect(h.state.resourcesReady.value).toBe(false);
  });
});
