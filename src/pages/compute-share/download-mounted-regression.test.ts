import { computed, nextTick, reactive, ref, watch } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import page from "./download.vue?raw";
import { createComputeShareDownloadGate } from "./download-gate";

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const scriptStart = page.indexOf("const app = useApp();");
const scriptEnd = page.indexOf("function copyDownloadUrl", scriptStart);
const gateStart = page.indexOf("function clearPolling()", scriptStart);
if (scriptStart < 0 || scriptEnd < scriptStart || gateStart < scriptStart) {
  throw new Error("Compute Share download lifecycle source is required");
}

// This is the pre-#67 mounted fragment. It is inserted into the raw SFC's
// real setup slice, so the historical and current paths run with the same
// `enabled`, `cfg`, `onMounted`, and navigation harness.
const legacyMountFragment = `
function clearPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}
function guardDisabled() {
  if (enabled.value) return;
  toast.info(t.value.computeShare.disabledToast);
  navReplace("/pages/me/devices");
}
onMounted(() => {
  lifecycleGeneration += 1;
  guardDisabled();
  if (remoteApiEnabled && enabled.value) void resumeRemoteEnrollment(String(app.accountKey), accountGeneration, lifecycleGeneration);
});
onUnmounted(() => {
  lifecycleGeneration += 1;
  clearPolling();
  inMemoryPairingCode = null;
});
`;

function lifecycleCode(source: string): string {
  const end = source.indexOf("function copyDownloadUrl", scriptStart);
  const section = source.slice(scriptStart, end);
  return ts.transpileModule(
    `${section}; return { gatePhase, enabled, connecting };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
}

function legacySource(): string {
  return `${page.slice(0, gateStart)}${legacyMountFragment}${page.slice(scriptEnd)}`;
}

function setup(source: string) {
  const mounted: Array<() => void> = [];
  const unmounted: Array<() => void> = [];
  const configFlight = deferred<void>();
  const cfg = reactive({
    configStatus: "loading" as "idle" | "loading" | "ready" | "failed",
    config: {
      computeShare: { downloadUrl: "", content: { zhTitle: "", zhGuide: "", enTitle: "", enGuide: "" }, gpuTiers: [] },
    },
    flag: false,
    isEnabled: (flag: string) => flag === "computeShareEnabled" && cfg.flag,
    ensureLoaded: () => configFlight.promise,
  });
  const app = reactive({ accountKey: "user:1", activeSlotCount: 0, slotCap: 1, refreshRemoteFleet: vi.fn() });
  const locale = reactive({ code: "en" });
  const replace = vi.fn();
  const journalClear = vi.fn();
  const value = new Function(
    "ref", "computed", "watch", "onMounted", "onUnmounted", "useApp", "useConfig", "useLocaleStore", "useT",
    "trialReservesSlotNow", "matchGpuTier", "fmt", "remoteApiEnabled", "createComputeShareEnrollmentJournal",
    "createComputeShareDownloadGate", "navReplace", "toast", "GPU_MODEL_PRESETS", lifecycleCode(source),
  )(
    ref, computed, watch, (callback: () => void) => mounted.push(callback), (callback: () => void) => unmounted.push(callback),
    () => app, () => cfg, () => locale, () => ref({ computeShare: { disabledToast: "disabled" } }),
    () => false, () => ({ id: "G1", tops: 1 }), (value: string) => value, false, () => ({ read: () => ({ kind: "empty" }), clear: journalClear }),
    createComputeShareDownloadGate, replace, { info: vi.fn() }, ["NVIDIA RTX 4070"],
  ) as { gatePhase: { value: string }; enabled: { value: boolean }; connecting: { value: boolean } };
  return {
    cfg, mounted, unmounted, replace, journalClear, value,
    settleEnabled() {
      cfg.flag = true;
      cfg.config.computeShare.downloadUrl = "https://downloads.example.test/nexgrid.exe";
      cfg.configStatus = "ready";
      configFlight.resolve();
    },
  };
}

describe("compute-share download mounted cold-route regression", () => {
  it("executes the pre-#67 mounted fragment against delayed valid E6 state and reproduces its redirect", () => {
    const s = setup(legacySource());
    s.mounted.forEach(callback => callback());
    expect(s.replace).toHaveBeenCalledOnce();
  });

  it("executes the current download.vue mounted wiring: delayed valid E6 remains and settles ready", async () => {
    const s = setup(page);
    s.mounted.forEach(callback => callback());
    expect(s.replace).not.toHaveBeenCalled();
    expect(s.value.gatePhase.value).toBe("pending");

    s.settleEnabled();
    await nextTick();
    await Promise.resolve();
    expect(s.replace).not.toHaveBeenCalled();
    expect(s.value.enabled.value).toBe(true);
    expect(s.value.gatePhase.value).toBe("ready");
  });

  it("executes the current unmount callback and ignores a late disabled result", async () => {
    const s = setup(page);
    s.mounted.forEach(callback => callback());
    s.value.connecting.value = true;
    s.unmounted.forEach(callback => callback());
    expect(s.value.connecting.value).toBe(false);
    expect(s.journalClear).not.toHaveBeenCalled();
    s.cfg.configStatus = "ready";
    await nextTick();
    expect(s.replace).not.toHaveBeenCalled();
  });
});
