import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import { createSSRApp, computed, ref } from "vue";
import { renderToString } from "@vue/server-renderer";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import page from "./wallet-exchange.vue?raw";

const calculationStart = page.indexOf("const minFrom = computed");
const calculationEnd = page.indexOf("// uni input event", calculationStart);
if (calculationStart < 0 || calculationEnd < calculationStart) throw new Error("Wallet exchange confirmation calculations are required");
const calculations = ts.transpileModule(
  `${page.slice(calculationStart, calculationEnd)}; return { valid, ctaEnabled, exchangeSubmissionAllowed };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
const confirmStart = page.indexOf("async function handleConfirm()");
const confirmEnd = page.indexOf("// ── derived labels", confirmStart);
if (confirmStart < 0 || confirmEnd < confirmStart) throw new Error("Wallet exchange confirmation handler is required");
const confirmationHandler = ts.transpileModule(
  `${page.slice(confirmStart, confirmEnd)}; return handleConfirm;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

const template = parse(page).descriptor.template?.content;
if (!template) throw new Error("Wallet exchange template is required");
const statusStart = template.indexOf('<view v-if="remoteApiEnabled && exchangeAuthorityStatus !== \'ready\'"');
const statusEnd = template.indexOf("      <!-- How-it-works", statusStart);
if (statusStart < 0 || statusEnd < statusStart) throw new Error("Wallet exchange authority-state template is required");
const statusRender = new Function("Vue", compile(template.slice(statusStart, statusEnd), { mode: "function", prefixIdentifiers: true }).code)(await import("vue"));

function calculate(swapEnabled: boolean, snapshotReady = true) {
  const input = ref("10");
  const direction = ref<"usdt2nex" | "nex2usdt">("nex2usdt");
  const remoteState = ref({
    wallet: { usdtAvailable: 100, nexAvailable: 100 },
    caps: { swapEnabled, minUsdt: 1, minNex: 10, feePct: 0.5, feeMinUsdt: 0.5 },
  });
  const result = new Function("computed", "ref", "remoteApiEnabled", "remoteState", "exchangeSnapshotReady", "direction", "input", "rate", "fromBal", "exchangeQuote", "pendingExchangeLeases", calculations)(
    computed, ref, true, remoteState, computed(() => snapshotReady), direction, input, ref(1), computed(() => 100),
    () => ({ toAmount: 9.5, grossUsdt: 10, feeUsdt: 0.5 }), ref([]),
  ) as { valid: { value: boolean }; ctaEnabled: { value: boolean }; exchangeSubmissionAllowed: { value: boolean } };
  return result;
}

function pausedConfirmationHandler(exchangeSubmissionAllowed: { value: boolean }) {
  const normalize = vi.fn((value: string) => value);
  return {
    normalize,
    handler: new Function("submitting", "exchangeSubmissionAllowed", "input", "canonicalExchangeAmount", confirmationHandler)(
      ref(false), exchangeSubmissionAllowed, ref("10"), normalize,
    ) as () => Promise<void>,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function confirmationThatPausesWhilePrompted() {
  const allowed = ref(true);
  const answer = deferred<boolean>();
  const confirm = vi.fn(() => answer.promise);
  const swap = vi.fn().mockResolvedValue({});
  const snapshot = { caps: { swapEnabled: true } };
  const executeExchangeSwap = vi.fn(async ({ swap: submit }: { swap: (key: string) => Promise<unknown> }) => {
    await submit("same-request");
    return { snapshot, order: { status: "COMPLETED" } };
  });
  const handler = new Function(
    "submitting", "exchangeSubmissionAllowed", "input", "canonicalExchangeAmount", "valid", "captureExchangeScope", "captureRuntimeRevision",
    "direction", "fromSym", "toSym", "fromAmount", "toAmount", "rate", "swapUSDValue", "app", "remoteState", "remoteQuote", "remoteApiEnabled",
    "confirm", "t", "amtLabel", "remoteScopeCurrent", "toastIfRemoteScopeCurrent", "remoteAuthority", "executeExchangeSwap", "pendingExchangeMutations",
    "exchangeApi", "remoteError", "remoteSnapshotReceivedAt", "refreshCommittedExchangeWalletProjection", "notifyRemoteSwapResult", "pendingExchangeRevision", confirmationHandler,
  )(
    ref(false), computed(() => allowed.value), ref("10"), (value: string) => value, ref(true), () => ({ accountKey: "user:1" }), () => ({}),
    ref("nex2usdt"), ref("NEX"), ref("USDT"), ref(10), ref(9.5), ref(1), ref(10), { accountKey: "user:1" }, ref(snapshot), ref({ feeUsdt: 0.5 }), true,
    confirm, { value: { exchange: { confirm: "Confirm", netReceive: "Receive", exchangeFee: "Fee", quoteEstimate: "Estimate" } } }, (value: number) => String(value),
    () => true, () => true, { beginMutation: () => ({ finish() {} }) }, executeExchangeSwap, {}, { swap }, ref(null), ref(0), () => {}, () => {}, ref(0),
  ) as () => Promise<void>;
  return { allowed, answer, confirm, swap, executeExchangeSwap, handler };
}

async function renderStatus(exchangeAuthorityStatus: "loading" | "ready", exchangePaused: boolean) {
  const app = createSSRApp({ render: statusRender, setup: () => ({
    remoteApiEnabled: true,
    exchangeAuthorityStatus,
    exchangePaused,
    isDevBuild: false,
    t: { wallet: { loadingTransactions: "Loading" }, exchange: { remoteUnavailableClosed: "Unavailable", swapPaused: "Paused by platform" } },
  }) });
  return renderToString(app);
}

describe("wallet exchange paused authoritative state", () => {
  it("does not enable confirmation from a ready snapshot whose swap capability is disabled", () => {
    const state = calculate(false);
    expect(state.valid.value).toBe(false);
    expect(state.ctaEnabled.value).toBe(false);
  });

  it("also keeps confirmation disabled until the current remote snapshot is ready", () => {
    expect(calculate(true, false).ctaEnabled.value).toBe(false);
  });

  it("uses the same authority gate at the beginning of the actual confirmation handler", async () => {
    const { handler, normalize } = pausedConfirmationHandler(calculate(false).exchangeSubmissionAllowed);
    await handler();
    expect(normalize).not.toHaveBeenCalled();
  });

  it("does not submit after the authority pauses while the native confirmation is open", async () => {
    const s = confirmationThatPausesWhilePrompted();
    const pending = s.handler();
    expect(s.confirm).toHaveBeenCalledTimes(1);
    s.allowed.value = false;
    s.answer.resolve(true);
    await pending;
    expect(s.executeExchangeSwap).not.toHaveBeenCalled();
    expect(s.swap).not.toHaveBeenCalled();
  });

  it("renders an explicit paused state while retaining the existing loading state", async () => {
    const [paused, loading] = await Promise.all([renderStatus("ready", true), renderStatus("loading", false)]);
    expect(paused).toContain("Paused by platform");
    expect(loading).toContain("Loading");
  });
});
