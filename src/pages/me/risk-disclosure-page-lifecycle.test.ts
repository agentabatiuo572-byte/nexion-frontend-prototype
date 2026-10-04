import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import pageSource from "./risk-disclosure.vue?raw";
import type { RiskDisclosureCurrent } from "@/api/risk-disclosure-api";
import * as reading from "@/lib/risk-disclosure-reading-gate";

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const document = (version: string) => ({
  jurisdiction: "VN", version, acknowledgmentToken: `fixture-${version}`,
  acknowledged: false, chapters: [],
}) as unknown as RiskDisclosureCurrent;

function actualPage() {
  const start = pageSource.indexOf("const scrolledToBottom = ref");
  const end = pageSource.indexOf("// Spotlight hero", start);
  if (start < 0 || end < start) throw new Error("Actual risk disclosure lifecycle source required");
  const effects = effectScope();
  const risk = reactive({ current: null as RiskDisclosureCurrent | null, accepted: false, loading: false,
    refresh: vi.fn<() => Promise<void>>(), accept: vi.fn<() => Promise<boolean>>() });
  const disclosure = computed(() => risk.current);
  const documentIdentity = computed(() => reading.riskDisclosureDocumentIdentity(disclosure.value));
  const mounted: Array<() => Promise<void>> = [], unmounted: Array<() => void> = [];
  const hidden: Array<() => void> = [], shown: Array<() => unknown> = [];
  const observers: Array<{ callback: (entries: Array<{ isIntersecting: boolean }>) => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  class Element {}
  class Observer {
    observe = vi.fn(); disconnect = vi.fn();
    constructor(public callback: (entries: Array<{ isIntersecting: boolean }>) => void) { observers.push(this); }
  }
  const toast = { info: vi.fn(), success: vi.fn() }, navBack = vi.fn();
  const bindings = { ref, computed, watch, nextTick, onMounted: (cb: () => Promise<void>) => mounted.push(cb),
    onUnmounted: (cb: () => void) => unmounted.push(cb),
    onHide: (cb: () => void) => hidden.push(cb), onShow: (cb: () => unknown) => shown.push(cb),
    risk, disclosure, documentIdentity,
    publicCountry: ref("VN"),
    accepted: computed(() => risk.accepted), IntersectionObserver: Observer, Element, HTMLElement: Element,
    SCROLL_THRESHOLD_PX: 24, ...reading, displayLanguage: ref({ language: "en" }),
    riskDisclosureChapterCopy: () => ({ title: "", body: "" }), fmt: () => "", w: ref({}), toast, navBack,
    returnTo: ref("/pages/me/me") };
  const compiled = ts.transpileModule(pageSource.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const state = effects.run(() => new Function(...Object.keys(bindings), compiled
    + ";return { sentinelRef, scrollEventIdentity, scrolledToBottom, checked, canAccept, onAccept, reload, toggleCheck, scrollTop, nativeEvents: () => nativeScrollSurface.value.events };"
  )(...Object.values(bindings))) as {
    sentinelRef: { value: unknown }; scrollEventIdentity: { value: string | null };
    scrolledToBottom: { value: boolean }; checked: { value: boolean }; canAccept: { value: boolean };
    onAccept(): Promise<void>; reload(): Promise<void>; toggleCheck(): void;
    scrollTop: { value: number };
    nativeEvents(): { scroll(event: { detail: { scrollTop: number } }): void; scrolltolower(): void };
  };
  let disposed = false;
  const unmount = () => { if (!disposed) { disposed = true; unmounted.forEach((cb) => cb()); effects.stop(); } };
  cleanups.push(unmount); state.sentinelRef.value = new Element();
  return { risk, state, observers, toast, navBack, mount: () => mounted[0](), unmount,
    hide: () => hidden.forEach((cb) => cb()), show: async () => { await Promise.all(shown.map((cb) => cb())); } };
}

describe("Risk disclosure page lifecycle", () => {
  it("does not rearm a hidden page when its initial request finishes", async () => {
    const page = actualPage(), refresh = deferred<void>();
    page.risk.refresh.mockReturnValueOnce(refresh.promise);
    const mounting = page.mount(); page.hide();
    page.risk.current = document("v1"); refresh.resolve(); await mounting; await nextTick();
    page.state.nativeEvents().scrolltolower();
    expect(page.observers).toHaveLength(0); expect(page.state.scrollEventIdentity.value).toBeNull();
    expect(page.state.scrolledToBottom.value).toBe(false);
    page.risk.refresh.mockImplementationOnce(async () => { page.risk.current = document("v2"); });
    await page.show(); page.state.nativeEvents().scrolltolower(); expect(page.state.scrolledToBottom.value).toBe(true);
  });

  it("rejects queued native scroll events from the previous document after the new one renders", async () => {
    const page = actualPage();
    page.risk.refresh.mockImplementationOnce(async () => { page.risk.current = document("v1"); });
    await page.mount(); const old = page.state.nativeEvents();
    page.risk.current = document("v2"); await nextTick();
    old.scroll({ detail: { scrollTop: 4000 } }); old.scrolltolower();
    expect(page.state.scrollTop.value).toBe(0);
    expect(page.state.scrolledToBottom.value).toBe(false);
    page.state.nativeEvents().scrolltolower(); page.state.toggleCheck();
    expect(page.state.canAccept.value).toBe(true);
  });

  it("invalidates hidden-page events and refreshes the disclosure on return", async () => {
    const page = actualPage();
    page.risk.refresh.mockImplementationOnce(async () => { page.risk.current = document("v1"); });
    await page.mount(); const old = page.state.nativeEvents(), observer = page.observers.at(-1)!;
    page.hide(); old.scrolltolower(); observer.callback([{ isIntersecting: true }]);
    expect(page.state.scrolledToBottom.value).toBe(false);
    expect(page.state.scrollEventIdentity.value).toBeNull();
    page.risk.refresh.mockImplementationOnce(async () => { page.risk.current = document("v2"); });
    await page.show(); expect(page.risk.refresh).toHaveBeenCalledTimes(2);
    old.scrolltolower(); expect(page.state.scrolledToBottom.value).toBe(false);
    page.state.nativeEvents().scrolltolower(); expect(page.state.scrolledToBottom.value).toBe(true);
  });

  it("does not navigate for an acknowledgement started before hide and show", async () => {
    const page = actualPage(), accepted = deferred<boolean>();
    page.risk.refresh.mockImplementation(async () => { page.risk.current = document("v1"); });
    page.risk.accept.mockReturnValueOnce(accepted.promise);
    await page.mount(); page.state.nativeEvents().scrolltolower(); page.state.toggleCheck();
    const accepting = page.state.onAccept(); page.hide(); await page.show();
    accepted.resolve(true); await accepting;
    expect(page.toast.success).not.toHaveBeenCalled(); expect(page.navBack).not.toHaveBeenCalled();
  });

  it("does not restart a disposed page on queued show", async () => {
    const page = actualPage(); page.hide(); page.unmount(); await page.show();
    expect(page.risk.refresh).not.toHaveBeenCalled(); expect(page.observers).toHaveLength(0);
  });

  it("does not recreate reading listeners when mount and render settle after unmount", async () => {
    const page = actualPage(), refresh = deferred<void>();
    page.risk.refresh.mockReturnValueOnce(refresh.promise);
    const mounting = page.mount();
    page.risk.current = document("v1");
    page.unmount(); refresh.resolve(); await mounting; await nextTick();
    expect(page.observers).toHaveLength(0);
    expect(page.state.scrollEventIdentity.value).toBeNull();
  });

  it("does not navigate or announce success after acknowledgement settles on an unmounted page", async () => {
    const page = actualPage(), accepted = deferred<boolean>();
    page.risk.refresh.mockImplementationOnce(async () => { page.risk.current = document("v1"); });
    page.risk.accept.mockReturnValueOnce(accepted.promise);
    await page.mount(); page.state.scrolledToBottom.value = true; page.state.checked.value = true;
    const accepting = page.state.onAccept();
    expect(page.risk.accept).toHaveBeenCalledOnce(); page.unmount(); accepted.resolve(true); await accepting;
    expect(page.toast.success).not.toHaveBeenCalled(); expect(page.navBack).not.toHaveBeenCalled();
  });

  it("requires the new document's observer and checkbox after a version change", async () => {
    const page = actualPage();
    page.risk.refresh.mockImplementationOnce(async () => { page.risk.current = document("v1"); });
    await page.mount();
    const old = page.observers.at(-1)!;
    old.callback([{ isIntersecting: true }]); page.state.toggleCheck(); expect(page.state.canAccept.value).toBe(true);
    page.risk.current = document("v2"); old.callback([{ isIntersecting: true }]);
    expect(page.state.scrolledToBottom.value).toBe(false); expect(page.state.checked.value).toBe(false);
    expect(page.state.canAccept.value).toBe(false); await nextTick();
    page.observers.at(-1)!.callback([{ isIntersecting: true }]); page.state.toggleCheck();
    expect(page.state.canAccept.value).toBe(true);
  });
});
