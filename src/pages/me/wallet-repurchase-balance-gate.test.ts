import { describe, expect, it, vi } from "vitest";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import ts from "typescript";
import source from "./wallet-repurchase.vue?raw";
import { fmt } from "@/i18n/format";
import { en } from "@/i18n/messages/en";
import { formatCommandAmount, normalizeCommandAmount } from "@/lib/command-amount";
import { resolveRepurchaseRuntimePolicy } from "@/lib/repurchase-runtime-policy";

// #165: the page showed the authoritative $0.00 balance next to a $100 re-invest
// amount while the main CTA still read as an enabled "Re-invest $100.00" button,
// so the user could enter a money flow that cannot complete. These cases render
// the real template and execute the real handler, because a disabled-looking
// button that still submits is exactly the failure being pinned.

const body = source.slice(source.indexOf("const PRESETS ="), source.lastIndexOf("</script>"));
const code = ts.transpileModule(body.replace(/^import .*$/gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function page(balance: number, amount: number, pendingOpenAmount: number | null = null) {
  const uiConfirm = vi.fn().mockResolvedValue(true);
  const open = vi.fn().mockResolvedValue({});
  const navTo = vi.fn();
  const toasts: Array<[unknown, unknown]> = [];
  const repurchase = {
    config: { enabled: true, minAmountUsdt: 100, apyPct: 35, lockDays: 90, presets: [100, 200], earlyPenaltyPct: 15 },
    orders: [], walletBalanceUsdt: balance, serverTime: 1, loading: false, submitting: false, error: "",
    historyLoading: false, historyError: "", pendingOpenAmount,
    refresh: vi.fn(), refreshHistory: vi.fn(), claim: vi.fn(), earlyWithdraw: vi.fn(), open,
  };
  const bindings: Record<string, unknown> = {
    useT: () => Vue.ref(en), useApp: () => ({ user: { usdtBalance: balance }, accountKey: "acct", captureMoney: vi.fn(() => ({})) }),
    useStaking: () => ({ stake: vi.fn() }), useRepurchase: () => repurchase,
    resolveRepurchaseRuntimePolicy, apiRuntimeConfig: { environment: "prod" },
    computed: Vue.computed, ref: Vue.ref, watch: Vue.watch, onMounted: () => {}, onUnmounted: () => {},
    fmt, dateLocale: () => "en-US", geoPolicyUserMessage: () => null, uiConfirm,
    toast: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: (title: unknown, detail: unknown) => toasts.push([title, detail]) },
    postMoneyBill: vi.fn(() => "ok"), navTo, formatCommandAmount, normalizeCommandAmount,
  };
  // Symbols the fix introduces resolve leniently, so running this file against
  // the pre-fix page reports the behavioural assertion (button enabled, command
  // dispatched) instead of a bare "is not defined" at bind time.
  const exported = `;return { setAmount: (v) => { amount.value = v; }, t, canSubmit, displayBalance, recovering,
    handleRepurchase, heroStyle, benefitsGridStyle, isSandboxHold, unavailableStyle, unavailableTitle, unavailableBodyStyle,
    isRemote, remoteReady, repurchase, loadingLabel, unavailableTitleStyle, refreshRemote, retryLabel, retryCtaStyle, w, cardStyle,
    monoLabelStyle, amount, formatCommandAmount, confirming, amountInputStyle, onAmount, presets, presetStyle, selectPreset, dollarStyle,
    usdtStyle, balanceLabelStyle, balanceValueStyle, fmt, projectedYield, dividerStyle, lockedNoticeStyle, ctaStyle, ctaLabel,
    refreshOrders, orderStatusLabel, handleClaim, handleEarlyWithdraw, goHow, howLinkStyle, heroIconBoxStyle, heroTitleStyle,
    heroPtsStyle, benefitTiles, benefitStyle, benefitTextStyle, heroApy,
    insufficientBalance: typeof insufficientBalance === "undefined" ? false : insufficientBalance,
    goTopup: typeof goTopup === "undefined" ? () => {} : goTopup,
    insufficientNoticeStyle: typeof insufficientNoticeStyle === "undefined" ? {} : insufficientNoticeStyle,
    insufficientTitleStyle: typeof insufficientTitleStyle === "undefined" ? {} : insufficientTitleStyle,
    insufficientBodyStyle: typeof insufficientBodyStyle === "undefined" ? {} : insufficientBodyStyle,
    topupCtaStyle: typeof topupCtaStyle === "undefined" ? {} : topupCtaStyle };`;
  const raw = new Function(...Object.keys(bindings), code + exported)(...Object.values(bindings)) as Record<string, unknown>;
  (raw.setAmount as (value: number) => void)(amount);
  return {
    state: Vue.proxyRefs(raw) as Record<string, unknown>, repurchase, uiConfirm, open, navTo, toasts,
  };
}

const template = parse(source).descriptor.template!.content;
const render = new Function("Vue", compile(template, {
  mode: "function", prefixIdentifiers: true,
  isCustomElement: (tag) => tag === "view" || tag === "text",
}).code)(Vue);

const CTA = /<view class="nx-repurchase-submit-cta w-full flex items-center justify-center[^"]*"[^>]*>/;

async function show(balance: number, amount: number, pendingOpenAmount: number | null = null) {
  const view = page(balance, amount, pendingOpenAmount);
  const app = Vue.createSSRApp({ render, setup: () => view.state });
  const wrapper = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("div", slots.default?.()) });
  app.component("AppChassis", wrapper);
  app.component("SubPageHeader", wrapper);
  app.component("Row", Vue.defineComponent({ props: ["label", "value"], setup: (props) => () => Vue.h("p", `${props.label}=${props.value}`) }));
  return { html: await renderToString(app), view };
}

describe("re-invest main CTA balance gate", () => {
  it.each([
    ["an empty wallet", 0, 100],
    ["a balance below the amount", 50, 100],
    ["a balance equal to the amount", 100, 100],
    ["a balance above the amount", 500, 100],
  ])("gates the main CTA and the money command on %s", async (_label, balance, amount) => {
    const { html, view } = await show(balance, amount);
    const affordable = balance >= amount;
    expect(view.state.canSubmit).toBe(affordable);
    expect(CTA.test(html) && /aria-disabled="true"/.test(html.match(CTA)![0])).toBe(!affordable);
    // A disabled control that silently swallows the click is indistinguishable
    // from a broken one, so the shortfall states its reason and offers top-up.
    expect(html.includes(en.repurchase.insufficient)).toBe(!affordable);
    expect(html.includes(`aria-label="${en.me.topup}"`)).toBe(!affordable);

    await (view.state.handleRepurchase as () => Promise<void>)();
    if (affordable) {
      expect(view.open).toHaveBeenCalledTimes(1);
      expect(view.toasts).toEqual([]);
    } else {
      expect(view.uiConfirm).not.toHaveBeenCalled();
      expect(view.open).not.toHaveBeenCalled();
      expect(view.toasts).toEqual([[en.repurchase.insufficient, fmt(en.repurchase.insufficientSub, { a: balance.toFixed(2) })]]);
    }
  });

  it("states the authoritative balance the gate used, not a second local figure", async () => {
    const { html, view } = await show(0, 100);
    expect(view.state.displayBalance).toBe(0);
    expect(html).toContain(fmt(en.repurchase.insufficientSub, { a: "0.00" }));
    expect(html).toContain("$0.00");
  });

  it("never blocks a pending replay whose amount exceeds the current balance", async () => {
    // The recovery path re-sends an already-issued request with the same key, so
    // a balance that dropped after the attempt must not lock the user out of it.
    const { html, view } = await show(0, 100, 100);
    expect(view.state.recovering).toBe(true);
    expect(view.state.insufficientBalance).toBe(false);
    expect(html).not.toContain(en.repurchase.insufficient);
    expect(view.state.canSubmit).toBe(true);
    await (view.state.handleRepurchase as () => Promise<void>)();
    expect(view.open).toHaveBeenCalledTimes(1);
  });

  it("routes the shortfall to the wallet top-up page", async () => {
    const { view } = await show(0, 100);
    (view.state.goTopup as () => void)();
    expect(view.navTo).toHaveBeenCalledWith("/pages/me/wallet-topup");
  });
});
