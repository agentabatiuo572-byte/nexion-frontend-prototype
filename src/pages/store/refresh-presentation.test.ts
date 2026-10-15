import { computed, ref, reactive } from "vue";
import { describe, expect, it, vi } from "vitest";
import { compileStyle, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import ordersPage from "./orders.vue?raw";
import card from "@/components/store/product-card.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

function actual(script: string, names: string[], args: Record<string, unknown>) {
  const source = ts.createSourceFile("actual.ts", script.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1], ts.ScriptTarget.Latest, true);
  const statements = source.statements.filter(item => ts.isFunctionDeclaration(item)
    ? names.includes(item.name?.text ?? "")
    : ts.isVariableStatement(item) && item.declarationList.declarations.some(d => names.includes(d.name.getText(source))));
  const body = ts.transpileModule(statements.map(s => s.getText(source)).join("\n") + `\nreturn {${names.join(",")}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(args), body)(...Object.values(args));
}

describe("actual page presentation remains separate from authority", () => {
  it("keeps promotion glass clear and inherits the real CTA surface in solid mode", () => {
    const style = parse(card).descriptor.styles.find(entry => entry.scoped)!;
    const css = compileStyle({ source: style.content, filename: "product-card.vue", id: "data-v-product-card", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toMatch(/\.promotion-buy\[data-v-product-card\]\s*\{[^}]*--v5-liquid-tint:\s*transparent;/);
    expect(css.code).toMatch(/\.promotion-buy\[data-v-product-card\] \.nx-liquid-glass\[data-glass-strategy="solid"\],\s*\.promotion-buy\[data-v-product-card\] \.nx-liquid-glass\[data-glass-strategy="solid"\] \.nx-liquid-optics\s*\{\s*background:\s*inherit;/);
    const productCatalogState = reactive({ status: "ready" }), gate = ref({ blocked: false, soldOut: false });
    const { buyBtnDynStyle, buyUnavailable } = actual(card, ["buyBtnStyle", "buyBtnDynStyle", "catalogUnavailable", "buyUnavailable"], {
      computed, remoteApiEnabled: true, productCatalogState, gate, eligibility: ref({ status: "ready" }),
      promotionUnavailable: ref(false), stockUnavailable: ref(false), promotionSignIn: ref(false),
    });
    expect(buyBtnDynStyle.value).toMatchObject({ background: "var(--v5-brand)", color: "var(--v5-on-brand)" });
    expect(buyUnavailable.value).toBe(false);
    gate.value.blocked = true;
    expect(buyBtnDynStyle.value).toMatchObject({ background: "var(--v5-surface-3)", color: "var(--v5-ink-3)" });
    expect(buyUnavailable.value).toBe(false);
    gate.value.blocked = false; productCatalogState.status = "error";
    expect(buyBtnDynStyle.value).toMatchObject({ background: "var(--v5-surface-3)", color: "var(--v5-ink-3)" });
    expect(buyUnavailable.value).toBe(true);
  });

  it("offers an initial eligibility check in all three languages and reserves retry for an actual error", () => {
    for (const messages of [en, zh, vietnamese]) {
      const eligibility = ref({ status: "idle" });
      const { buyLabel } = actual(card, ["buyLabel"], {
        computed, t: ref(messages), remoteApiEnabled: true, eligibility,
        promotionSignIn: ref(false), promotionUnavailable: ref(false), catalogUnavailable: ref(false),
        stockUnavailable: ref(false), gate: ref({ soldOut: false, blocked: true }),
      });
      expect(buyLabel.value).toBe(messages.store.purchaseEligibilityCheck);
      expect(buyLabel.value).not.toBe(messages.store.purchaseEligibilityRetry);
      eligibility.value.status = "loading";
      expect(buyLabel.value).toBe(messages.store.purchaseEligibilityLoading);
      eligibility.value.status = "error";
      expect(buyLabel.value).toBe(messages.store.purchaseEligibilityRetry);
    }
  });

  it("shows order read errors without importing Genesis opening status", () => {
    const genesis = reactive({ remoteEligibilityError: "GENESIS_SERIES_UNAVAILABLE" });
    const commerceOrdersUnavailable = ref(true), genesisOrdersUnavailable = ref(true);
    const t = ref({ headerTitles: { storeOrders: "Orders" }, me: { genesisNode: "Genesis" }, orders: { refreshFailed: "Order read failed" } });
    const { unavailableOrderSources } = actual(ordersPage, ["unavailableOrderSources"], { computed, t, genesis, commerceOrdersUnavailable, genesisOrdersUnavailable });
    expect(unavailableOrderSources.value).toEqual([{ label: "Orders", message: "Order read failed" }, { label: "Genesis", message: "Order read failed" }]);
    for (const error of ["offline", "GENESIS_STATE_UNAVAILABLE", "genesis_series_unavailable", ""]) {
      genesis.remoteEligibilityError = error;
      expect(unavailableOrderSources.value[1].message).toBe("Order read failed");
    }
    genesisOrdersUnavailable.value = false;
    expect(unavailableOrderSources.value).toEqual([{ label: "Orders", message: "Order read failed" }]);
  });

  it("cannot buy from retained cards while catalog loads or fails, nor with unavailable eligibility", () => {
    const state = reactive({ status: "ready" });
    const eligibility = ref({ status: "ready", eligible: true });
    const stockUnavailable = ref(false), gate = ref({ soldOut: false });
    const promotionUnavailable = ref(false), promotionSignIn = ref(false);
    const goCheckout = vi.fn(), goDetail = vi.fn(), retryEligibility = vi.fn();
    const { buyUnavailable, onBuy } = actual(card, ["catalogUnavailable", "buyUnavailable", "onBuy"], {
      computed, remoteApiEnabled: true, productCatalogState: state, eligibility, stockUnavailable, gate, promotionUnavailable, promotionSignIn, goCheckout, goDetail, retryEligibility,
    });
    for (const status of ["loading", "error"]) { state.status = status; expect(buyUnavailable.value).toBe(true); onBuy(); }
    expect(goCheckout).not.toHaveBeenCalled();
    state.status = "ready";
    eligibility.value.status = "idle"; expect(buyUnavailable.value).toBe(false); onBuy();
    expect(retryEligibility).toHaveBeenCalledOnce();
    expect(goCheckout).not.toHaveBeenCalled();
    eligibility.value.status = "loading"; expect(buyUnavailable.value).toBe(true); onBuy();
    expect(retryEligibility).toHaveBeenCalledOnce();
    eligibility.value.status = "error"; expect(buyUnavailable.value).toBe(false); onBuy();
    expect(goCheckout).not.toHaveBeenCalled();
    expect(retryEligibility).toHaveBeenCalledTimes(2);
    eligibility.value = { status: "ready", eligible: false }; onBuy();
    expect(goCheckout).not.toHaveBeenCalled();
    expect(goDetail).toHaveBeenCalledOnce();
    gate.value.soldOut = true; expect(buyUnavailable.value).toBe(true); onBuy();
    expect(goDetail).toHaveBeenCalledOnce();
    gate.value.soldOut = false;
    eligibility.value.eligible = true; onBuy();
    expect(goCheckout).toHaveBeenCalledOnce();
    stockUnavailable.value = false;
    promotionUnavailable.value = true; expect(buyUnavailable.value).toBe(true); onBuy();
    expect(goCheckout).toHaveBeenCalledOnce();
    stockUnavailable.value = true; expect(buyUnavailable.value).toBe(true); onBuy();
    expect(goCheckout).toHaveBeenCalledOnce();
  });
});
