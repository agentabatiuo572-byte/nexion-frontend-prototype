// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import * as Vue from "vue";
import { parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/messages/en";
import { navBack } from "@/lib/route";

vi.mock("@/store/trial-claim-sheet", () => ({ useTrialClaimSheet: () => ({ closeTransient() {} }) }));
vi.mock("@/store/voucher-claim-sheet", () => ({ useVoucherClaimSheet: () => ({ closeTransient() {} }) }));
vi.mock("@/store/ui", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/i18n/use-t", () => ({ getT: () => ({ ui: { navigationFailed: "Navigation failed" } }) }));

const pages = ["wallet-cards.vue", "wallet-cards-new.vue"] as const;
const sources = Object.fromEntries(pages.map(name => [name, readFileSync(new URL(name, import.meta.url), "utf8")])) as Record<typeof pages[number], string>;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function execute(source: string, dependencies: Record<string, unknown>, returns: string) {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(dependencies), `${js}; return ${returns};`)(...Object.values(dependencies));
}
function functionSource(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\n}", start);
  if (start < 0 || end < start) throw new Error(`Missing ${name}`);
  return source.slice(start, end + 2);
}
async function renderPage(name: typeof pages[number], remote: boolean, development: boolean) {
  const source = sources[name];
  const render = new Function("Vue", compile(parse(source).descriptor.template!.content, {
    mode: "function", prefixIdentifiers: true,
    isCustomElement: tag => ["view", "text", "checkbox", "checkbox-group"].includes(tag),
  }).code)(Vue);
  const available = execute(source.match(/const cardBindingAvailable = computed\([^\n]+/)![0], {
    computed: Vue.computed, remoteApiEnabled: remote, developmentPaymentEnabled: development,
  }, "cardBindingAvailable").value;
  const context: Record<string, unknown> = {
    t: en, cardBindingAvailable: available, developmentPaymentEnabled: development, bankFormVisible: true, returnTo: "/pages/me/wallet",
    cards: [{ tokenId: "saved-card", brand: "visa", last4: "4321", expiry: "12/30", holder: "Saved holder" }],
    defaultTokenId: "other", remoteCardsError: true, remoteCardsRefreshing: false,
    brandLabel: () => "Visa", rowMeta: () => "Saved holder", goNew() {}, refreshCards() {}, setDefault() {}, handleRemove() {}, returnToWallet() {},
    brand: "unknown", holder: "", canSubmit: false, setAsDefault: false, defaultStateLabel: "Off",
    onCardChange() {}, onHolder() {}, onDefaultGroupChange() {}, handleBind() {}, returnFromUnavailable() {},
  };
  for (const match of source.matchAll(/\b(\w+Style)\b/g)) context[match[1]] = {};
  const passthrough = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("div", slots.default?.()) });
  const app = Vue.createSSRApp({ render, setup: () => context });
  for (const component of ["AppChassis", "HostedCardVault"]) app.component(component, passthrough);
  app.component("SubPageHeader", Vue.defineComponent({ props: ["title", "subtitle"], setup: props => () => Vue.h("header", `${props.title} ${props.subtitle ?? ""}`) }));
  app.component("CardSimulationBadge", Vue.defineComponent({ setup: () => () => development ? Vue.h("aside", "Development badge") : null }));
  app.component("EmptyState", passthrough);
  app.component("HostedCardField", Vue.defineComponent({ props: ["kind"], setup: props => () => Vue.h("input", { "data-field": props.kind }) }));
  app.component("BankAccountBinding", Vue.defineComponent({ setup: () => () => Vue.h("section", { "data-testid": "real-bank-binding" }, [Vue.h("button", { role: "button", tabindex: "0" }, en.bankBinding.continue)]) }));
  return renderToString(app);
}

describe("open bank-card form with no simulated binding", () => {
  it("uses the same rail availability for the wallet entry instead of advertising saved-card reuse", () => {
    const wallet = readFileSync(new URL("./wallet.vue", import.meta.url), "utf8");
    const statement = wallet.match(/const cardsSub = computed\(\(\) =>[\s\S]*?\n\);/)?.[0];
    if (!statement) throw new Error("Wallet card entry computed missing");
    for (const [remote, development, count, expected] of [
      [true, false, 0, en.cards.newTitle], [true, false, 2, en.cards.newTitle],
      [true, true, 2, "2 bound"], [false, false, 0, en.wallet.cardsReuseHint], [false, false, 2, "2 bound"],
    ] as const) {
      const label = execute(statement, { computed: Vue.computed, remoteApiEnabled: remote, developmentPaymentEnabled: development,
        cardsCount: Vue.ref(count), t: Vue.ref(en), fmt: (_: string, value: { n: number }) => `${value.n} bound` }, "cardsSub");
      expect(label.value).toBe(expected);
    }
  });
  it.each(pages)("opens the original card entry without claiming saved-card or simulation state: %s", async name => {
    const html = await renderPage(name, true, false);
    expect(html).not.toContain(en.cards.bindingUnavailableTitle);
    expect(html).not.toContain(en.cards.bindingUnavailableBody);
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    for (const forbidden of ["4321", "Saved holder", "wallet-card-set-default", "wallet-card-unbind", "wallet-cards-retry", en.cards.listDisclaimer, en.cards.formDisclaimer, "Development badge"]) expect(html).not.toContain(forbidden);
    if (name === "wallet-cards-new.vue") {
      expect(html).toContain('data-testid="real-bank-binding"');
      expect(html).toContain(en.bankBinding.continue);
      expect(html).not.toContain('data-field="pan"');
    }
  });
  it.each(pages)("keeps enabled development controls and their disclosure: %s", async name => {
    const html = await renderPage(name, true, true);
    expect(html).not.toContain(en.cards.bindingUnavailableTitle);
    expect(html).toContain(name === "wallet-cards.vue" ? "wallet-card-unbind" : 'data-field="pan"');
    const disclosure = name === "wallet-cards.vue" ? en.cards.listDisclaimer : en.cards.formDisclaimer;
    expect(html).toContain(disclosure.replace(/'/g, "&#39;"));
  });
  it("opens the form without requesting or fabricating saved cards", async () => {
    const source = sources["wallet-cards.vue"], refreshRemote = vi.fn(), navTo = vi.fn();
    const deps = { cardBindingAvailable: Vue.ref(false), remoteApiEnabled: true, remoteCardsRefreshing: Vue.ref(false), remoteCardsError: Vue.ref(false), cardsStore: { refreshRemote }, navTo };
    const refresh = execute("async " + functionSource(source, "refreshCards"), deps, "refreshCards");
    await refresh();
    execute(functionSource(source, "goNew"), deps, "goNew")();
    expect(refreshRemote).not.toHaveBeenCalled();
    expect(navTo).toHaveBeenCalledWith("/pages/me/wallet-cards-new");
    expect(deps.remoteCardsRefreshing.value).toBe(false);
  });
  it("does not tokenize, send, persist, or announce success when the real binding adapter is absent", async () => {
    const tokenize = vi.fn(), error = vi.fn(), success = vi.fn(), bind = vi.fn();
    const action = execute("async " + functionSource(sources["wallet-cards-new.vue"], "handleBind"), {
      cardBindingAvailable: Vue.ref(false), canSubmit: Vue.ref(true), vaultRef: Vue.ref({ tokenize }),
      toast: { error, success }, t: Vue.ref({ cards: { bindingConnectionPending: "Connection pending" } }),
      paymentMethodApi: { bind },
    }, "handleBind");
    await action();
    expect(error).toHaveBeenCalledWith("Connection pending");
    expect(tokenize).not.toHaveBeenCalled(); expect(bind).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
  });
  it("routes the existing card entry straight to the original form without a back loop", () => {
    const navReplace = vi.fn(), refreshCards = vi.fn();
    execute(functionSource(sources["wallet-cards.vue"], "openCards"), { cardBindingAvailable: Vue.ref(false), navReplace, refreshCards }, "openCards")();
    expect(navReplace).toHaveBeenCalledWith("/pages/me/wallet-cards-new"); expect(refreshCards).not.toHaveBeenCalled();
    expect(sources["wallet-cards-new.vue"]).toContain(":back=\"cardBindingAvailable ? '/pages/me/wallet-cards' : '/pages/me/wallet'\"");
  });
  it("clears card draft fields on page leave and account/runtime changes", () => {
    const clear = vi.fn(), holder = Vue.ref("TEST USER"), cardReady = Vue.ref(true), brand = Vue.ref("visa"), setAsDefault = Vue.ref(false), isBinding = Vue.ref(false);
    execute(functionSource(sources["wallet-cards-new.vue"], "clearForm"), { vaultRef: Vue.ref({ clear }), holder, cardReady, brand, setAsDefault, isBinding }, "clearForm")();
    expect(clear).toHaveBeenCalledOnce(); expect(holder.value).toBe(""); expect(cardReady.value).toBe(false); expect(brand.value).toBe("unknown");
    const form = sources["wallet-cards-new.vue"];
    expect(form).toContain("onHide(clearForm)"); expect(form).toContain("subscribeRuntimeRevision(clearForm)");
    expect(form).toContain("[app.accountKey, app.accountBindingEpoch] as const, clearForm");
    const vault = readFileSync(new URL("../../components/me/hosted-card-vault.vue", import.meta.url), "utf8");
    const fields = { pan: Vue.ref("4111111111111111"), expiry: Vue.ref("12/30"), cvv: Vue.ref("123") };
    execute(functionSource(vault, "clear"), fields, "clear")();
    for (const field of Object.values(fields)) expect(field.value).toBe("");
  });
  it.each(pages)("uses the actual navigation fallback when cold-opened: %s", name => {
    const uni = { reLaunch: vi.fn(), navigateBack: vi.fn(), showToast: vi.fn() };
    vi.stubGlobal("uni", uni); vi.stubGlobal("getCurrentPages", () => [{}]);
    const method = name === "wallet-cards.vue" ? "returnToWallet" : "returnFromUnavailable";
    execute(functionSource(sources[name], method), { navBack, returnTo: Vue.ref("/pages/me/wallet-cards") }, method)();
    expect(uni.reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: name === "wallet-cards.vue" ? "/pages/me/wallet" : "/pages/me/wallet-cards" }));
    expect(uni.navigateBack).not.toHaveBeenCalled();
  });
  it("returns to the previous page when a real navigation stack exists", () => {
    const uni = { reLaunch: vi.fn(), navigateBack: vi.fn() };
    vi.stubGlobal("uni", uni); vi.stubGlobal("getCurrentPages", () => [{}, {}]);
    execute(functionSource(sources["wallet-cards-new.vue"], "returnFromUnavailable"), { navBack, returnTo: Vue.ref("/pages/me/wallet-cards") }, "returnFromUnavailable")();
    expect(uni.navigateBack).toHaveBeenCalledTimes(1); expect(uni.reLaunch).not.toHaveBeenCalled();
  });
  it("rejects external return targets before unavailable-page navigation", () => {
    const safe = execute(functionSource(sources["wallet-cards-new.vue"], "safeReturnTo"), {}, "safeReturnTo");
    for (const target of [undefined, "https://example.com", "//example.com", "javascript:alert(1)"]) expect(safe(target, "/pages/me/wallet-cards")).toBe("/pages/me/wallet-cards");
    expect(safe("/pages/me/wallet", "/pages/me/wallet-cards")).toBe("/pages/me/wallet");
  });
});
