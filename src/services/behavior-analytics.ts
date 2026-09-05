import type {
  BehaviorAnalyticsApi,
  BehaviorDevice,
  BehaviorEvent,
  BehaviorZone,
} from "@/api/behavior-analytics-api";
import { behaviorAnalyticsApi, remoteApiEnabled } from "@/api/runtime";

export type BehaviorTransport = Pick<BehaviorAnalyticsApi, "ingest">;

type TapInput = {
  route: string;
  clientX: number;
  clientY: number;
  viewportWidth: number;
  viewportHeight: number;
  elementId?: string;
  zone?: BehaviorZone;
};

type LifecycleTapInput = Omit<TapInput, "route">;

type TrackerOptions = {
  transport: BehaviorTransport;
  now: () => number;
  sessionId: string;
  deviceType: () => BehaviorDevice;
  locale: () => string;
  eventId: () => string;
  /** In-memory authenticated subject scope; never emitted as telemetry. */
  credentialScope?: string;
  enabled?: () => boolean;
};

function routeOnly(value: string): string {
  const route = String(value || "").trim().split(/[?#]/, 1)[0];
  return /^\/pages\/[a-z0-9-]+\/[a-z0-9-]+$/.test(route) ? route : "";
}

function elementOnly(value: string | undefined): string | undefined {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{0,63}$/.test(normalized) ? normalized : undefined;
}

function unit(value: number, size: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) return null;
  return Math.round(Math.min(1, Math.max(0, value / size)) * 10_000) / 10_000;
}

export function normalizeBehaviorTap(input: TapInput) {
  const route = routeOnly(input.route);
  const xNorm = unit(input.clientX, input.viewportWidth);
  const yNorm = unit(input.clientY, input.viewportHeight);
  if (!route || xNorm === null || yNorm === null) return null;
  const derivedZone: BehaviorZone = yNorm < 0.25 ? "TOP" : yNorm > 0.75 ? "BOTTOM" : "CONTENT";
  return {
    route,
    xNorm,
    yNorm,
    zone: input.zone ?? derivedZone,
    ...(elementOnly(input.elementId) ? { elementId: elementOnly(input.elementId) } : {}),
  };
}

export function createBehaviorTracker(options: TrackerOptions) {
  let active: { route: string; startedAt: number } | null = null;
  const pending = new Set<Promise<unknown>>();
  let serial = Promise.resolve();
  let epoch = 0;

  function enqueue(event: BehaviorEvent) {
    if (options.enabled && !options.enabled()) return;
    const queuedEpoch = epoch;
    const task = serial = serial.catch(() => undefined).then(async () => {
      // Logout, account rotation, hiding and remote disable cancel unsent work.
      if (queuedEpoch !== epoch) return;
      if (options.enabled && !options.enabled()) return;
      const receipt = await options.transport.ingest(event).catch(() => undefined);
      // A transport can resolve after sign-out or account rotation. Recheck
      // this tracker epoch after await before it may project any credential.
      if (queuedEpoch !== epoch) return;
      if (options.enabled && !options.enabled()) return;
      if (receipt) rememberAcceptanceObservationCredential(receipt, options.credentialScope || "");
    });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  }

  function show(rawRoute: string) {
    const route = routeOnly(rawRoute);
    if (!route || active?.route === route) return;
    if (active) hide(active.route);
    active = { route, startedAt: options.now() };
  }

  function hide(rawRoute: string) {
    const route = routeOnly(rawRoute);
    if (!active || active.route !== route) return;
    const ended = active;
    active = null;
    const endedAt = options.now();
    enqueue({
      clientEventId: options.eventId(),
      eventName: "app.page_viewed",
      sessionId: options.sessionId,
      route: ended.route,
      // This is a completed dwell fact, so stamp the completion moment. It
      // keeps the serialized transport chronology aligned with clientTs even
      // when a click occurred while the page was visible.
      dwellMs: Math.min(86_400_000, Math.max(0, Math.round(endedAt - ended.startedAt))),
      clientTs: endedAt,
      deviceType: options.deviceType(),
      locale: options.locale(),
    });
  }

  function tap(input: TapInput) {
    const normalized = normalizeBehaviorTap(input);
    if (!normalized) return;
    enqueue({
      clientEventId: options.eventId(),
      eventName: "app.element_clicked",
      sessionId: options.sessionId,
      clientTs: options.now(),
      deviceType: options.deviceType(),
      locale: options.locale(),
      ...normalized,
    });
  }

  async function flush() {
    await Promise.allSettled([...pending]);
  }

  function discard(): void {
    epoch += 1;
    active = null;
  }

  return { show, hide, tap, flush, discard };
}

let acceptanceObservationCredential = "";
let acceptanceObservationCredentialScope = "";

function rememberAcceptanceObservationCredential(receipt: Awaited<ReturnType<BehaviorTransport["ingest"]>>, scope: string): void {
  if (!scope) return;
  if (receipt.source !== "mock" || receipt.sourceEnvironment !== "SANDBOX"
    || !receipt.runId || !receipt.observationToken) return;
  const credential = `${receipt.runId}.${receipt.observationToken}`;
  if (credential === acceptanceObservationCredential && scope === acceptanceObservationCredentialScope) return;
  acceptanceObservationCredential = credential;
  acceptanceObservationCredentialScope = scope;
  try {
    uni.setClipboardData({ data: credential, showToast: false });
    // 只在 mock + SANDBOX 下弹(见上面的早退)。文案是验收工具的工程话,按硬编码中文门的
    // 出路②处理:改英文技术串,**不进 i18n 词典** —— 工程话进词典就成了用户文案契约,
    // 而词典是普通对象、打包摇不掉,会原样进生产包。
    uni.showModal({ title: "Acceptance observation credential", content: `${credential}\nCopied — paste into the L6 Sandbox observation panel on PC.`, showCancel: false });
  } catch {
    // The receipt remains available through the explicit getter on hosts that
    // cannot show a modal or reach the native clipboard.
  }
}

function clearAcceptanceObservationCredential(): void {
  acceptanceObservationCredential = "";
  acceptanceObservationCredentialScope = "";
}

/** H5 acceptance can display or copy this opaque server-issued PC query credential. */
export function getAcceptanceObservationCredential(): string {
  return acceptanceObservationCredential;
}

export function copyAcceptanceObservationCredential(): void {
  if (!acceptanceObservationCredential) return;
  try { uni.setClipboardData({ data: acceptanceObservationCredential, showToast: true }); } catch { /* no-op */ }
}

type BehaviorTracker = ReturnType<typeof createBehaviorTracker>;

export type BehaviorAnalyticsContext = {
  enabled: boolean;
  subject: string | null;
};

type BehaviorAnalyticsManagerOptions = {
  context: () => BehaviorAnalyticsContext;
  createTracker: (subject: string) => Pick<BehaviorTracker, "show" | "hide" | "tap" | "flush" | "discard">;
  now: () => number;
};

/**
 * One fail-closed facade for every L6 caller (App lifecycle and AppChassis).
 * The subject is used only to rotate an in-memory random session; it is never
 * included in an event. Disabling the gate immediately closes and discards the
 * prior tracker so a later account can never inherit its pseudonymous session.
 */
export function createBehaviorAnalyticsManager(options: BehaviorAnalyticsManagerOptions) {
  let tracker: Pick<BehaviorTracker, "show" | "hide" | "tap" | "flush" | "discard"> | null = null;
  let subject = "";
  let activeRoute = "";
  let lastClickAt = Number.NEGATIVE_INFINITY;
  let lastClickRoute = "";

  function dispose(emitClose = false): void {
    if (!tracker) return;
    if (emitClose && activeRoute) tracker.hide(activeRoute);
    else tracker.discard();
    void tracker.flush();
    tracker = null;
    // Clipboard history cannot be recalled by the platform, but this App's
    // modal/getter projection must never carry a prior account's credential.
    clearAcceptanceObservationCredential();
    subject = "";
    activeRoute = "";
    lastClickAt = Number.NEGATIVE_INFINITY;
    lastClickRoute = "";
  }

  function current() {
    let context: BehaviorAnalyticsContext;
    try {
      context = options.context();
    } catch {
      dispose();
      return null;
    }
    const nextSubject = String(context.subject || "").trim();
    if (!context.enabled || !nextSubject) {
      dispose(false);
      return null;
    }
    if (tracker && subject !== nextSubject) dispose(false);
    if (!tracker) {
      tracker = options.createTracker(nextSubject);
      subject = nextSubject;
    }
    return tracker;
  }

  function show(rawRoute: string): void {
    const route = routeOnly(rawRoute);
    const target = current();
    if (!target || !route) return;
    target.show(route);
    activeRoute = route;
  }

  function hide(rawRoute: string): void {
    const route = routeOnly(rawRoute);
    const target = current();
    if (!target || !route) return;
    target.hide(route);
    if (activeRoute === route) activeRoute = "";
  }

  function tap(input: TapInput): void {
    const route = routeOnly(input.route);
    const target = current();
    if (!target || !route) return;
    const now = options.now();
    if (route === lastClickRoute && now - lastClickAt < CLICK_THROTTLE_MS) return;
    lastClickAt = now;
    lastClickRoute = route;
    target.tap({ ...input, route });
  }

  function refresh(): void {
    current();
  }

  async function flush(): Promise<void> {
    await tracker?.flush();
  }

  function discard(): void {
    dispose(false);
  }

  return { show, hide, tap, refresh, flush, discard };
}

type BehaviorLifecycleOptions = {
  tracker: Pick<BehaviorTracker, "show" | "hide" | "tap" | "flush" | "discard">;
  enabled: () => boolean;
  currentRoute: () => string;
  now: () => number;
  installNavigationObserver: (listener: () => void) => void;
  installTapObserver: (listener: (input: LifecycleTapInput) => void) => void;
};

const CLICK_THROTTLE_MS = 350;

/**
 * Owns the App-visible lifetime of the L6 client observer.
 *
 * It deliberately has no persistence or local aggregate: all emitted facts
 * remain best-effort, non-authoritative inputs to the remote L6 service. A
 * disabled remote transport installs no observers and cannot create a local
 * substitute for analytics, rewards, finance, or risk truth.
 */
export function createBehaviorAnalyticsLifecycle(options: BehaviorLifecycleOptions) {
  let observersInstalled = false;
  let visible = false;
  let activeRoute = "";
  let lastClickAt = Number.NEGATIVE_INFINITY;
  let lastClickRoute = "";

  function syncRoute() {
    if (!visible) return;
    if (!options.enabled()) {
      options.tracker.discard();
      activeRoute = "";
      return;
    }
    const route = routeOnly(options.currentRoute());
    if (!route) {
      if (activeRoute) options.tracker.hide(activeRoute);
      activeRoute = "";
      return;
    }
    if (activeRoute === route) return;
    options.tracker.show(route);
    activeRoute = route;
  }

  function trackTap(input: LifecycleTapInput) {
    if (!visible || !options.enabled()) return;
    const route = routeOnly(options.currentRoute());
    if (!route) return;
    const now = options.now();
    if (route === lastClickRoute && now - lastClickAt < CLICK_THROTTLE_MS) return;
    lastClickAt = now;
    lastClickRoute = route;
    options.tracker.tap({ route, ...input });
  }

  function start() {
    if (!options.enabled()) return;
    visible = true;
    if (!observersInstalled) {
      options.installNavigationObserver(syncRoute);
      options.installTapObserver(trackTap);
      observersInstalled = true;
    }
    syncRoute();
  }

  function pause() {
    if (!visible) return;
    visible = false;
    // Hiding, sign-out and account rotation are privacy boundaries: discard the
    // in-flight page state instead of sending a final request after visibility
    // or identity has changed.
    options.tracker.discard();
    activeRoute = "";
  }

  return { start, pause, refresh: syncRoute, trackTap };
}

function randomHex32(): string {
  const bytes = new Uint8Array(16);
  try {
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.padEnd(32, "0").slice(0, 32);
  }
}

function currentDevice(): BehaviorDevice {
  try {
    const platform = String(uni.getSystemInfoSync().uniPlatform || "").toLowerCase();
    if (platform === "web") return "H5";
    if (platform.startsWith("mp-")) return "MP";
  } catch {
    // The backend still validates the declared client platform.
  }
  return "APP";
}

function currentLocale(): string {
  try {
    const locale = String(uni.getLocale?.() || "").trim();
    if (/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)) return locale;
  } catch {
    // Use the explicit unknown locale rather than guessing a user locale.
  }
  return "und";
}

let behaviorAnalyticsContext: () => BehaviorAnalyticsContext = () => ({
  enabled: false,
  subject: null,
});

export function configureBehaviorAnalyticsContext(provider: () => BehaviorAnalyticsContext): void {
  behaviorAnalyticsContext = provider;
}

export const behaviorTracker = createBehaviorAnalyticsManager({
  context: () => behaviorAnalyticsContext(),
  now: () => Date.now(),
  createTracker: (subject) => createBehaviorTracker({
    transport: behaviorAnalyticsApi,
    now: () => Date.now(),
    sessionId: randomHex32(),
    deviceType: currentDevice,
    locale: currentLocale,
    eventId: randomHex32,
    credentialScope: subject,
    enabled: () => remoteApiEnabled,
  }),
});

function readCurrentRoute(): string {
  try {
    const pages = getCurrentPages();
    return `/${String(pages[pages.length - 1]?.route || "")}`;
  } catch {
    return "";
  }
}

function installNavigationObserver(listener: () => void): void {
  for (const method of ["navigateTo", "redirectTo", "switchTab", "reLaunch", "navigateBack"] as const) {
    try {
      uni.addInterceptor(method, {
        success: () => setTimeout(listener, 0),
      });
    } catch {
      // Analytics interception must never block navigation on a host that does
      // not expose one of the optional navigation methods.
    }
  }
}

function installTapObserver(listener: (input: LifecycleTapInput) => void): void {
  // #ifdef H5
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-behavior-id]")
      : null;
    listener({
      clientX: event.clientX,
      clientY: event.clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      ...(target?.getAttribute("data-behavior-id")
        ? { elementId: target.getAttribute("data-behavior-id") || undefined }
        : {}),
    });
  }, { capture: true, passive: true });
  // #endif
}

const behaviorAnalyticsLifecycle = createBehaviorAnalyticsLifecycle({
  tracker: behaviorTracker,
  enabled: () => remoteApiEnabled,
  currentRoute: readCurrentRoute,
  now: () => Date.now(),
  installNavigationObserver,
  installTapObserver,
});

export function startBehaviorAnalytics(): void {
  try {
    behaviorAnalyticsLifecycle.start();
  } catch {
    // L6 is observational. A host API failure must not change user flows.
  }
}

export function pauseBehaviorAnalytics(): void {
  try {
    behaviorAnalyticsLifecycle.pause();
  } catch {
    // Dwell backfill is best effort and never becomes local business truth.
  }
}

export function refreshBehaviorAnalytics(): void {
  try {
    behaviorAnalyticsLifecycle.refresh();
    behaviorTracker.refresh();
  } catch {
    // Auth and navigation must remain usable if optional observation fails.
  }
}

type BehaviorTapPoint = { clientX?: number; clientY?: number; x?: number; y?: number };
type BehaviorTapEvent = {
  detail?: BehaviorTapPoint;
  touches?: BehaviorTapPoint[];
  changedTouches?: BehaviorTapPoint[];
  currentTarget?: { dataset?: Record<string, unknown> };
};

/** Native and mini-program controls can bind this handler to their tap event. */
export function trackBehaviorTap(event: BehaviorTapEvent): void {
  try {
    const point = event.changedTouches?.[0] || event.touches?.[0] || event.detail;
    const clientX = Number(point?.clientX ?? point?.x);
    const clientY = Number(point?.clientY ?? point?.y);
    const system = uni.getSystemInfoSync();
    const viewportWidth = Number(system.windowWidth || 0);
    const viewportHeight = Number(system.windowHeight || 0);
    if (
      !Number.isFinite(clientX)
      || !Number.isFinite(clientY)
      || viewportWidth <= 0
      || viewportHeight <= 0
    ) return;
    const rawElementId = event.currentTarget?.dataset?.behaviorId;
    behaviorAnalyticsLifecycle.trackTap({
      clientX,
      clientY,
      viewportWidth,
      viewportHeight,
      ...(typeof rawElementId === "string" ? { elementId: rawElementId } : {}),
    });
  } catch {
    // Native tap collection is best effort and cannot block the control.
  }
}
