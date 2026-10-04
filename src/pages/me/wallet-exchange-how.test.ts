import { afterEach, describe, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { ref, type VNode } from "vue";
import ts from "typescript";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import source from "./wallet-exchange-how.vue?raw";
import exchangeSource from "./wallet-exchange.vue?raw";

const overlays = vi.hoisted(() => ({ trial: vi.fn(), voucher: vi.fn() }));
vi.mock("@/store/trial-claim-sheet", () => ({ useTrialClaimSheet: () => ({ closeTransient: overlays.trial }) }));
vi.mock("@/store/voucher-claim-sheet", () => ({ useVoucherClaimSheet: () => ({ closeTransient: overlays.voucher }) }));
vi.mock("@/store/ui", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/i18n/use-t", () => ({ getT: () => ({ ui: { navigationFailed: "Navigation failed" } }) }));
import { navBack, navTo } from "@/lib/route";

const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
const code = script.slice(script.indexOf("const exchangeAvailable ="), script.indexOf("function goBack"));

function mount(fetchCaps: () => Promise<{ swapEnabled: boolean }>) {
  let show!: () => void;
  let unmount!: () => void;
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const page = new Function("ref", "remoteApiEnabled", "exchangeApi", "onShow", "onUnmounted",
    `${js}; return { exchangeAvailable, exchangeLoading, loadExchangeCaps };`)(
      ref, true, { fetchCaps }, (callback: () => void) => { show = callback; },
      (callback: () => void) => { unmount = callback; },
    ) as {
      exchangeAvailable: { value: boolean | null };
      exchangeLoading: { value: boolean };
      loadExchangeCaps: () => Promise<void>;
    };
  return { page, show: () => show(), unmount: () => unmount() };
}

describe("exchange guide availability", () => {
  it("shows published instructions only after the current server caps enable swaps", async () => {
    expect(source).toContain('remoteApiEnabled && exchangeAvailable === true');
    const fetchCaps = vi.fn().mockResolvedValueOnce({ swapEnabled: false }).mockResolvedValueOnce({ swapEnabled: true });
    const { page, show } = mount(fetchCaps);
    show();
    await Promise.resolve();
    expect(page.exchangeAvailable.value).toBe(false);
    show();
    expect(page.exchangeAvailable.value).toBeNull();
    await Promise.resolve();
    expect(page.exchangeAvailable.value).toBe(true);
  });

  it("keeps failed and superseded reads unknown instead of showing submission advice", async () => {
    let resolveOld!: (value: { swapEnabled: boolean }) => void;
    const old = new Promise<{ swapEnabled: boolean }>((resolve) => { resolveOld = resolve; });
    const fetchCaps = vi.fn().mockReturnValueOnce(old).mockRejectedValueOnce(new Error("offline"));
    const { page, show, unmount } = mount(fetchCaps);
    show();
    await page.loadExchangeCaps();
    resolveOld({ swapEnabled: true });
    await old;
    expect(page.exchangeAvailable.value).toBeNull();
    expect(page.exchangeLoading.value).toBe(false);
    unmount();
  });
});

function actualNavigation(page: string, name: string): () => void {
  const ast = ts.createSourceFile("page.ts", parse(page).descriptor.scriptSetup!.content,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`Missing actual page function: ${name}`);
  const js = ts.transpileModule(`${declaration.getText(ast)}; return ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function("navBack", "navTo", js)(navBack, navTo);
}

const guideBack = actualNavigation(source, "goBack");
const openGuide = actualNavigation(exchangeSource, "goHowItWorks");
const template = parse(source).descriptor.template!.content;
const ctaStart = template.indexOf('<view v-if="exchangeAvailable === false"');
const ctaEnd = template.indexOf("</view>", ctaStart) + "</view>".length;
if (ctaStart < 0 || ctaEnd <= ctaStart) throw new Error("Missing actual paused-guide return button");
const renderPausedBack = new Function("Vue", compile(template.slice(ctaStart, ctaEnd), {
  mode: "function", prefixIdentifiers: true, isCustomElement: () => true,
}).code)(Vue) as (context: object, cache: unknown[]) => VNode;

type Page = { route: string; input?: string; direction?: string };
type NavigationOptions = { url: string; success?: () => void; fail?: () => void };
function navigationStack(initial: Page[]) {
  const stack = [...initial];
  const runtime = {
    navigateTo: vi.fn((options: NavigationOptions) => { stack.push({ route: options.url }); options.success?.(); }),
    navigateBack: vi.fn((_options?: { fail?: () => void }) => { stack.pop(); }),
    redirectTo: vi.fn((options: NavigationOptions) => { stack.splice(-1, 1, { route: options.url }); options.success?.(); }),
    reLaunch: vi.fn((options: NavigationOptions) => { stack.splice(0, stack.length, { route: options.url }); options.success?.(); }),
    showToast: vi.fn(),
  };
  vi.stubGlobal("getCurrentPages", () => stack);
  vi.stubGlobal("uni", runtime);
  return { stack, runtime };
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("actual exchange guide return navigation", () => {
  it("restores the existing exchange input and removes the guide before the next Back", () => {
    const exchange = { route: "/pages/me/wallet-exchange", input: "10", direction: "nex2usdt" };
    const s = navigationStack([{ route: "/pages/me/me" }, exchange]);
    openGuide();
    expect(s.stack.at(-1)?.route).toBe("/pages/me/wallet-exchange-how");
    guideBack();
    expect(s.stack).toEqual([{ route: "/pages/me/me" }, exchange]);
    expect(s.stack.at(-1)).toBe(exchange);
    expect(s.stack.at(-1)?.input).toBe("10");
    expect(s.runtime.navigateTo).toHaveBeenCalledOnce();
    expect(overlays.trial).toHaveBeenCalledTimes(2);
    expect(overlays.voucher).toHaveBeenCalledTimes(2);
    navBack("/pages/me/me");
    expect(s.stack).toEqual([{ route: "/pages/me/me" }]);
  });

  it.each([1, 0])("replaces a cold guide with exchange when the stack has %i entries", depth => {
    const s = navigationStack(depth ? [{ route: "/pages/me/wallet-exchange-how" }] : []);
    guideBack();
    expect(s.stack).toEqual([{ route: "/pages/me/wallet-exchange" }]);
    expect(s.runtime.navigateBack).not.toHaveBeenCalled();
    expect(s.runtime.navigateTo).not.toHaveBeenCalled();
    expect(s.runtime.reLaunch).toHaveBeenCalledOnce();
  });

  function failedReturn(mode: "warm" | "cold") {
    const exchange = { route: "/pages/me/wallet-exchange", input: "10" };
    const initial = mode === "warm"
      ? [{ route: "/pages/me/me" }, exchange, { route: "/pages/me/wallet-exchange-how" }]
      : [{ route: "/pages/me/wallet-exchange-how" }];
    const s = navigationStack(initial);
    if (mode === "warm") s.runtime.navigateBack.mockImplementationOnce(options => options?.fail?.());
    else s.runtime.reLaunch.mockImplementationOnce(options => options.fail?.());
    return { ...s, initial, exchange };
  }

  it.each(["warm", "cold"] as const)("replaces the guide after a %s return failure without a Back loop", mode => {
    const s = failedReturn(mode);
    guideBack();
    expect(s.runtime.redirectTo).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/me/wallet-exchange" }));
    expect(s.runtime.navigateTo).not.toHaveBeenCalled();
    expect(s.stack.some(page => page.route === "/pages/me/wallet-exchange-how")).toBe(false);
    expect(overlays.trial.mock.invocationCallOrder.at(-1)).toBeLessThan(s.runtime.redirectTo.mock.invocationCallOrder[0]);
    expect(overlays.voucher.mock.invocationCallOrder.at(-1)).toBeLessThan(s.runtime.redirectTo.mock.invocationCallOrder[0]);
    navBack("/pages/me/me");
    if (mode === "warm") {
      expect(s.stack.at(-1)).toBe(s.exchange);
      expect(s.stack.at(-1)?.input).toBe("10");
      navBack("/pages/me/me");
    }
    expect(s.stack).toEqual([{ route: "/pages/me/me" }]);
    expect(s.runtime.showToast).not.toHaveBeenCalled();
  });

  it.each(["warm", "cold"] as const)("resets to exchange if replacement also fails after a %s return failure", mode => {
    const s = failedReturn(mode);
    s.runtime.redirectTo.mockImplementationOnce(options => options.fail?.());
    guideBack();
    expect(s.stack).toEqual([{ route: "/pages/me/wallet-exchange" }]);
    expect(s.runtime.navigateTo).not.toHaveBeenCalled();
    expect(s.runtime.reLaunch).toHaveBeenLastCalledWith(expect.objectContaining({ url: "/pages/me/wallet-exchange" }));
    navBack("/pages/me/me");
    expect(s.stack).toEqual([{ route: "/pages/me/me" }]);
    expect(s.runtime.showToast).not.toHaveBeenCalled();
  });

  it.each(["warm", "cold"] as const)("reports one error on all %s return failures and permits a later retry", mode => {
    const s = failedReturn(mode);
    s.runtime.redirectTo.mockImplementationOnce(options => options.fail?.());
    s.runtime.reLaunch.mockImplementationOnce(options => options.fail?.());
    guideBack();
    expect(s.stack).toEqual(s.initial);
    expect(s.runtime.navigateTo).not.toHaveBeenCalled();
    expect(s.runtime.showToast).toHaveBeenCalledOnce();
    expect(s.runtime.showToast).toHaveBeenCalledWith({ title: "Navigation failed", icon: "none" });
    guideBack();
    expect(s.stack.some(page => page.route === "/pages/me/wallet-exchange-how")).toBe(false);
    if (mode === "warm") expect(s.stack.at(-1)).toBe(s.exchange);
    else expect(s.stack).toEqual([{ route: "/pages/me/wallet-exchange" }]);
    expect(s.runtime.showToast).toHaveBeenCalledOnce();
  });

  it.each(["warm", "cold"] as const)("resets a tab fallback after a %s return and platform replacement failure", mode => {
    const s = failedReturn(mode);
    s.runtime.redirectTo.mockImplementationOnce(options => options.fail?.());
    navBack("/me");
    expect(s.stack).toEqual([{ route: "/pages/me/me" }]);
    expect(s.runtime.reLaunch).toHaveBeenLastCalledWith(expect.objectContaining({ url: "/pages/me/me" }));
    expect(s.runtime.navigateTo).not.toHaveBeenCalled();
    expect(s.runtime.showToast).not.toHaveBeenCalled();
  });

  it.each(["click", "Enter", " "])("returns through the actual paused CTA for %j activation", key => {
    const exchange = { route: "/pages/me/wallet-exchange", input: "10" };
    const s = navigationStack([exchange, { route: "/pages/me/wallet-exchange-how" }]);
    const button = renderPausedBack({ exchangeAvailable: false, goBack: guideBack, w: { ctaBack: "Take me back" } }, []);
    if (key === "click") button.props!.onClick();
    else {
      const event = { key, preventDefault: vi.fn() };
      for (const handler of button.props!.onKeydown) handler(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
    expect(s.stack).toEqual([exchange]);
    expect(s.runtime.navigateBack).toHaveBeenCalledOnce();
    expect(s.runtime.navigateTo).not.toHaveBeenCalled();
  });

  it.each([null, true])("keeps the paused CTA absent while availability is %j", exchangeAvailable => {
    const button = renderPausedBack({ exchangeAvailable, goBack: guideBack }, []);
    expect(button.props?.onClick).toBeUndefined();
  });
});
