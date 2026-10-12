import { describe, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import ts from "typescript";
import lockedCard from "./locked-product-card.vue?raw";
import productCard from "./product-card.vue?raw";
import storePage from "@/pages/store/store.vue?raw";

const lifecycleStart = lockedCard.indexOf("const PHASE_TO_PROGRESS:");
const lifecycleEnd = lockedCard.indexOf("const rootStyle:", lifecycleStart);
if (lifecycleStart < 0 || lifecycleEnd < lifecycleStart) throw new Error("Locked card lifecycle is required");
const lifecycle = ts.transpileModule(`${lockedCard.slice(lifecycleStart, lifecycleEnd)}
return { cardInView, detailsOpen, notificationStatus, notifyBusy, serverSubscribed, handleNotify, reloadNotificationState, toggleDetails };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(productNo = "locked-1") {
  const app = reactive({ accountKey: "user:one" });
  const props = reactive({ product: { id: productNo } });
  const cardInView = ref(false);
  const scope = effectScope();
  const unmounted: Array<() => void> = [];
  let accountEpoch = 0, runtimeEpoch = 0;
  let runtimeListener = () => {};
  const result = (id: string, subscribed = false) => ({ serverCanonical: true, productNo: id, subscribed });
  const api = {
    status: vi.fn(async (id: string) => result(id)),
    subscribe: vi.fn(async (id: string) => result(id, true)),
    unsubscribe: vi.fn(async (id: string) => result(id)),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  const args = {
    computed, ref, watch, props, app, remoteApiEnabled: true, productNotificationApi: api, toast,
    t: ref({ store: { comingSoonHeading: "Soon", notifyToast: "Notify {name}" }, authOtp: { errorServiceUnavailable: "Unavailable" } }),
    fmt: (_message: string, values: { name: string }) => values.name,
    nexGridBrandText: (name: string) => name,
    useScrollGrowProgress: (options: { fallbackInView: boolean }) => {
      expect(options.fallbackInView).toBe(false);
      return { elRef: ref(null), inView: cardInView };
    },
    captureAccountScope: () => ({ accountKey: app.accountKey, epoch: accountEpoch }),
    isCurrentAccountScope: (saved: { accountKey: string; epoch: number }) => saved.accountKey === app.accountKey && saved.epoch === accountEpoch,
    captureRuntimeRevision: () => ({ epoch: runtimeEpoch }),
    isCurrentRuntimeRevision: (saved: { epoch: number }) => saved.epoch === runtimeEpoch,
    subscribeRuntimeRevision: (listener: () => void) => { runtimeListener = listener; return vi.fn(); },
    onUnmounted: (callback: () => void) => unmounted.push(callback),
  };
  const value = scope.run(() => new Function(...Object.keys(args), lifecycle)(...Object.values(args))) as {
    cardInView: typeof cardInView;
    detailsOpen: { value: boolean };
    notificationStatus: { value: string };
    serverSubscribed: { value: boolean };
    notifyBusy: { value: boolean };
    handleNotify(): Promise<void>;
    reloadNotificationState(): Promise<void>;
    toggleDetails(): void;
  };
  return { value, api, toast, props, app,
    switchAccount() { accountEpoch += 1; app.accountKey = "user:two"; },
    refreshRuntime() { runtimeEpoch += 1; runtimeListener(); },
    stop() { unmounted.forEach((callback) => callback()); scope.stop(); },
  };
}

describe("catalog lazy server reads", () => {
  it("does not mount any transient locked cards before the 570-product page is mounted", () => {
    const start = storePage.indexOf("const unlockedProducts = computed");
    const end = storePage.indexOf("const upgrade = computed", start);
    const code = ts.transpileModule(`${storePage.slice(start, end)}; return { unlockedProducts, lockedProducts };`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mounted = ref(false);
    const displayProducts = ref(Array.from({ length: 570 }, (_, index) => ({ id: `sku-${index}`, available: index !== 569 })));
    const groups = new Function("computed", "mounted", "displayProducts", "phase", "isProductAvailable", code)(
      computed, mounted, displayProducts, ref("P1"), (product: { available: boolean }) => product.available,
    );
    expect(groups.unlockedProducts.value).toHaveLength(0);
    expect(groups.lockedProducts.value).toHaveLength(0);
    mounted.value = true;
    expect(groups.unlockedProducts.value).toHaveLength(569);
    expect(groups.lockedProducts.value.map((product: { id: string }) => product.id)).toEqual(["sku-569"]);
  });

  it("binds both card observers to the unconditional root and keeps the real SKU fixed", () => {
    expect(productCard).toMatch(/<view ref="cardRef"/);
    expect(lockedCard).toMatch(/<view ref="cardRef"/);
    expect(productCard).toContain("useRemotePurchaseEligibility(() => props.product.id, cardInView)");
  });

  it("570 offscreen locked cards read nothing, and the visible card reads only once", async () => {
    const cards = Array.from({ length: 570 }, (_, index) => setup(`locked-${index}`));
    try {
      await nextTick();
      expect(cards.reduce((count, card) => count + card.api.status.mock.calls.length, 0)).toBe(0);
      cards[7].value.cardInView.value = true;
      await nextTick();
      await nextTick();
      expect(cards[7].api.status.mock.calls).toEqual([["locked-7"]]);
      cards[7].value.cardInView.value = false;
      await nextTick();
      cards[7].value.cardInView.value = true;
      await nextTick();
      expect(cards[7].api.status).toHaveBeenCalledOnce();
      expect(cards.reduce((count, card) => count + card.api.status.mock.calls.length, 0)).toBe(1);
    } finally { cards.forEach((card) => card.stop()); }
  });

  it("without IO, expansion reads the true existing subscription before the original CTA can toggle it", async () => {
    const card = setup();
    card.api.status.mockResolvedValueOnce({ serverCanonical: true, productNo: "locked-1", subscribed: true });
    try {
      expect(card.api.status).not.toHaveBeenCalled();
      card.value.toggleDetails();
      await nextTick();
      await nextTick();
      expect(card.value.serverSubscribed.value).toBe(true);
      await card.value.handleNotify();
      expect(card.api.unsubscribe).toHaveBeenCalledWith("locked-1");
      expect(card.api.subscribe).not.toHaveBeenCalled();
      expect(card.value.serverSubscribed.value).toBe(false);
      await card.value.handleNotify();
      expect(card.api.subscribe).toHaveBeenCalledWith("locked-1");
      expect(card.value.serverSubscribed.value).toBe(true);
    } finally { card.stop(); }
  });

  it("a failed hydration cannot assume unsubscribed, poll, or hide the explicit retry feedback", async () => {
    const card = setup();
    card.api.status.mockRejectedValueOnce(new Error("OFFLINE")).mockRejectedValueOnce(new Error("OFFLINE"));
    try {
      card.value.toggleDetails();
      await nextTick();
      await nextTick();
      expect(card.value.notificationStatus.value).toBe("error");
      expect(card.api.status).toHaveBeenCalledOnce();
      await card.value.handleNotify();
      expect(card.api.status).toHaveBeenCalledTimes(2);
      expect(card.toast.error).toHaveBeenCalledOnce();
      expect(card.api.subscribe).not.toHaveBeenCalled();
      expect(card.api.unsubscribe).not.toHaveBeenCalled();
    } finally { card.stop(); }
  });

  it.each(["account", "product", "runtime", "unmount"])("rejects late hydration after %s invalidation", async (boundary) => {
    const card = setup();
    const pending = deferred<{ serverCanonical: boolean; productNo: string; subscribed: boolean }>();
    card.api.status.mockReturnValueOnce(pending.promise);
    try {
      const read = card.value.reloadNotificationState();
      if (boundary === "account") card.switchAccount();
      if (boundary === "product") card.props.product.id = "locked-2";
      if (boundary === "runtime") card.refreshRuntime();
      if (boundary === "unmount") card.stop();
      pending.resolve({ serverCanonical: true, productNo: "locked-1", subscribed: true });
      await read;
      expect(card.value.serverSubscribed.value).toBe(false);
      if (boundary !== "unmount") expect(card.value.notificationStatus.value).toBe("idle");
      expect(card.toast.success).not.toHaveBeenCalled();
    } finally { card.stop(); }
  });

  it("does not start best-effort GETs over a pending confirmed mutation", async () => {
    const card = setup();
    const pending = deferred<{ serverCanonical: boolean; productNo: string; subscribed: boolean }>();
    try {
      await card.value.reloadNotificationState();
      card.api.subscribe.mockReturnValueOnce(pending.promise);
      const mutation = card.value.handleNotify();
      expect(card.value.notifyBusy.value).toBe(true);
      await card.value.handleNotify();
      expect(card.api.subscribe).toHaveBeenCalledOnce();
      await card.value.reloadNotificationState();
      expect(card.api.status).toHaveBeenCalledOnce();
      pending.resolve({ serverCanonical: true, productNo: "locked-1", subscribed: true });
      await mutation;
      expect(card.value.serverSubscribed.value).toBe(true);
      expect(card.value.notifyBusy.value).toBe(false);
      expect(card.toast.success).toHaveBeenCalledOnce();
    } finally { card.stop(); }
  });

  it("reloads a visible card for the new account and ignores its prior account GET after a confirmed mutation", async () => {
    const card = setup();
    const previous = deferred<{ serverCanonical: boolean; productNo: string; subscribed: boolean }>();
    card.api.status.mockReturnValueOnce(previous.promise);
    try {
      card.value.cardInView.value = true;
      await nextTick();
      card.switchAccount();
      expect(card.value.serverSubscribed.value).toBe(false);
      await nextTick();
      await nextTick();
      expect(card.api.status).toHaveBeenCalledTimes(2);
      expect(card.value.notificationStatus.value).toBe("ready");
      await card.value.handleNotify();
      expect(card.value.serverSubscribed.value).toBe(true);
      previous.resolve({ serverCanonical: true, productNo: "locked-1", subscribed: false });
      await nextTick();
      expect(card.value.serverSubscribed.value).toBe(true);
      expect(card.api.status).toHaveBeenCalledTimes(2);
    } finally { card.stop(); }
  });

  it("does not auto-read a previously expanded offscreen card after account or runtime reset", async () => {
    const card = setup();
    try {
      card.value.toggleDetails();
      await nextTick();
      expect(card.value.notificationStatus.value).toBe("ready");
      card.switchAccount();
      await nextTick();
      card.refreshRuntime();
      await nextTick();
      expect(card.value.detailsOpen.value).toBe(true);
      expect(card.value.notificationStatus.value).toBe("idle");
      expect(card.api.status).toHaveBeenCalledOnce();
      await card.value.handleNotify();
      expect(card.api.status).toHaveBeenCalledTimes(2);
      expect(card.api.subscribe).not.toHaveBeenCalled();
      await card.value.handleNotify();
      expect(card.api.subscribe).toHaveBeenCalledOnce();
    } finally { card.stop(); }
  });

  it.each(["account", "product", "runtime", "unmount"])("rejects late mutation state and success feedback after %s invalidation", async (boundary) => {
    const card = setup();
    const pending = deferred<{ serverCanonical: boolean; productNo: string; subscribed: boolean }>();
    try {
      await card.value.reloadNotificationState();
      card.api.subscribe.mockReturnValueOnce(pending.promise);
      const mutation = card.value.handleNotify();
      if (boundary === "account") card.switchAccount();
      if (boundary === "product") card.props.product.id = "locked-2";
      if (boundary === "runtime") card.refreshRuntime();
      if (boundary === "unmount") card.stop();
      pending.resolve({ serverCanonical: true, productNo: "locked-1", subscribed: true });
      await mutation;
      expect(card.value.serverSubscribed.value).toBe(false);
      expect(card.toast.success).not.toHaveBeenCalled();
      if (boundary !== "unmount") expect(card.value.notifyBusy.value).toBe(false);
    } finally { card.stop(); }
  });
});
