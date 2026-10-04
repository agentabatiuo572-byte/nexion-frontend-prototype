import * as Vue from "vue";
import type { Component } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { compileScript, parse } from "@vue/compiler-sfc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
// @ts-expect-error Installed UniApp preprocessing is JavaScript without published declarations.
import { preprocess } from "@dcloudio/uni-cli-shared/lib/preprocess/lib/preprocess.js";
import qrcode from "qrcode-generator";
import { createApiClient, type HttpResponse } from "@/api/api-client";
import { createSessionVault } from "@/api/session-vault";
import { createAppHomeApi } from "@/api/app-home-api";
import { createDeviceE3Api } from "@/api/device-e3-api";
import { en } from "@/i18n/messages/en";
import { fmt, dateLocale } from "@/i18n/format";
import { nexGridBrandText } from "@/lib/brand-copy";
import { isActiveSlotDevice } from "@/lib/device-slot-policy";
import source from "./share-poster-sheet.vue?raw";
import segmentSource from "../glass-segments.vue?raw";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true, fundsServerEnabled: true, expectedApiEnvironment: "dev",
  sessionVault: { read: vi.fn() }, deviceE3Api: { fleet: vi.fn() }, appHomeApi: { fetch: vi.fn() },
  taskAssignmentApi: { state: vi.fn() }, withdrawalApi: { list: vi.fn(), submit: vi.fn(), get: vi.fn() },
  purchaseEligibilityApi: { snapshot: vi.fn() },
}));
vi.mock("@/api/runtime", () => remote);
const { useApp } = await import("@/store/app");
const { useConfig } = await import("@/store/config");
const { useReferralReward } = await import("@/store/referral-reward");
const { buildShareLink, currentShareReferralCode } = await import("@/lib/share");

// The real SFC, real Pinia refresh functions, HTTP envelope and API parsers run.
// Installed UniApp preprocessing selects the real H5 or native save branch.
const compilerOptions = { hoistStatic: false, isCustomElement: (tag: string) => ["view", "text", "image", "canvas"].includes(tag) };
function compilePoster(h5: boolean) {
  const { descriptor } = parse(preprocess(source, { H5: h5 }, { type: "js" }), { filename: "share-poster-sheet.vue" });
  const script = compileScript(descriptor, { id: "poster-refresh", inlineTemplate: true, templateOptions: { compilerOptions } });
  return ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const posterCode = { h5: compilePoster(true), native: compilePoster(false) };
// The actual segments setup/template and handlers run; renderjs and glass pixels are peripheral.
const segmentDescriptor = parse(segmentSource, { filename: "glass-segments.vue" }).descriptor;
segmentDescriptor.script = null;
const segmentScript = compileScript(segmentDescriptor, { id: "poster-segments", inlineTemplate: true, templateOptions: { compilerOptions } });
const segmentCode = ts.transpileModule(segmentScript.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (tag: string, text = ""): Host => ({ tag, text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => node(tag), createText: text => node("#text", text), createComment: () => node("#comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _old, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
    child.parent = parent;
    const at = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(at < 0 ? parent.children.length : at, 0, child);
  },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); },
});
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const text = (root: Host): string => root.text + root.children.map(text).join("");
const unmounts: Array<() => void> = [];
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await Vue.nextTick(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const homePath = "/api/app/home/overview", fleetPath = "/api/devices/earnings";
const serverNow = 1_790_000_000_000;
function fleet(active = true) {
  const device = (id: number, productCode: string, activatedAt: number | null) => ({
    id, rowVersion: 0, instanceNo: `FIXTURE-${id}`, name: "Fixture device", productCode,
    deviceType: productCode === "cloud-share" ? "SHARE" : "MOBILE", status: activatedAt ? "ACTIVE" : "DEACTIVATED",
    runtimeStatus: "OFFLINE", pendingDeactivate: false, activatedAt, deactivatedAt: null, purchasedAt: serverNow - 1000,
    dailyUsdt: 0.04, dailyNex: 3, todayEarningsUsdt: 0, todayEarningsNex: 0,
    gpuModel: "Fixture device", capabilityTops: null, capabilityTier: null, vramTotalGb: 0, basePowerW: 0,
    location: "Fixture", capacityPct: 100, capacityAgeMonths: 0, capacityConfigKey: "capacityApplyToPhone",
    capacitySubsidized: false, capacitySubsidyDays: 30, capacitySubsidyRemainingDays: 0, capacitySubsidyEndsAt: null,
    actualPaidUsdt: 0, cumulativeOutputUsdt: 0,
  });
  return {
    dailyUsdt: 0.04, dailyNex: 9, realizedTodayUsdt: 0, realizedTodayNex: 0,
    walletUsdt: 110.1, walletNex: 136, userJoinedAt: serverNow - 1000, serverNow, timezone: "Asia/Shanghai", slotCap: 3,
    devices: [device(1, "phone", null), device(2, "phone", active ? serverNow - 1000 : null), device(3, "cloud-share", serverNow - 1000)],
    capacitySchedule: { stageEarlyEnd: "3", stageMidEnd: "8", capacityFloorPct: "22", capacitySubsidyDays: "30",
      capacityBand1DeltaPct: "-3", capacityBand2DeltaPct: "-6", capacityBand3DeltaPct: "-23.7",
      capacityApplyToPhone: "false", capacityApplyToCloudShare: "false", capacityApplyToPcGpu: "false",
      capacityApplyToS1: "true", capacityApplyToPro: "true", capacityApplyToProV2: "true", capacityApplyToRackP1: "true", capacityApplyToRackP2: "true" },
    source: "nx_user_device + nx_compute_receipt + nx_compute_e3_config", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
  };
}
function home(today: number | null = null) {
  const period = { usdt: today, nex: null, jobCount: null };
  return { serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", generatedAt: "2026-10-01T16:38:16Z",
    accountScope: "authenticated-account", earnings: { today: period, week: period, month: period, all: period, todayVsYesterdayPct: null },
    earningsLedgerMode: "SETTLED", earningsLedger: [], marketBoard: { workloads: [], deviceRankings: [] }, doTheMath: null,
    weeklyPromo: null, onboarding: { cumulativePaidUsdt: 19.9, activeDevices: 2 },
    onGrid: { clients: [], activeDevices: 0, activeJobs: null, perSecUsdt: null },
    source: "server:nx_compute_receipt,nx_compute_task,nx_user_device,nx_compute_datacenter,nx_product,nx_growth_promo_banner" };
}
const response = (data: unknown): HttpResponse => ({ status: 200, headers: {}, data: { code: 0, message: "success", data } });
async function mount(platform: "h5" | "native" = "h5") {
  const vault = createSessionVault();
  const session = (userId: number) => vault.save({ accessToken: "fixture-access", refreshToken: "fixture-refresh", tokenType: "Bearer",
    user: { userId, countryCode: "+86", phone: "10000000000", nickname: "Fixture", onboardingComplete: true } });
  session(1001); remote.sessionVault.read.mockImplementation(vault.read);
  const held = new Map<string, Array<ReturnType<typeof deferred<HttpResponse>>>>();
  const transport = vi.fn(async ({ url }: { url: string }) => {
    const path = new URL(url).pathname, pending = held.get(path)?.shift();
    if (pending) return pending.promise;
    if (path === homePath) return response(home());
    if (path === fleetPath) return response(fleet());
    throw new Error(`Unexpected HTTP path: ${path}`);
  });
  const client = createApiClient({ baseUrl: "https://poster.example.test", transport: { request: transport }, vault });
  remote.deviceE3Api.fleet.mockImplementation(createDeviceE3Api(client, "dev").fleet);
  remote.appHomeApi.fetch.mockImplementation(createAppHomeApi(client, "dev").fetch);
  const app = useApp(), cfg = useConfig(); app.bindAccount("user:1001");
  cfg.configStatus = "ready"; cfg.config.rewards.enabled = false; cfg.config.share.baseUrl = "https://poster.example.test/ref/";
  cfg.config.share.channels = [{ key: "telegram", enabled: true, intentType: "web", urlTemplate: "https://t.example/?url={link}" }];
  const referral = useReferralReward();
  referral.snapshot = { referralCode: "FIXTURE123", rewardEnabled: false, inviterRewardNex: 0, invitedCount: 0, pendingCount: 0,
    settledCount: 0, lifetimeInviterNex: 0, walletNexAvailable: 0, recentRewards: [], limit: 10, source: "ledger",
    sourceEnvironment: "PRODUCTION", runId: null, factSources: [], refreshedAt: "2026-10-01T00:00:00Z" };
  await Promise.all([app.refreshRemoteFleet(), app.refreshHomeTruth()]);
  expect(app.remoteFleetStatus).toBe("ready"); expect(app.homeTruthStatus).toBe("ready");
  const canvas: Array<{ texts: string[] }> = [], exports: Array<{ success: (value: { tempFilePath: string }) => void }> = [];
  const native = {
    getStorageSync: () => "", setStorageSync: vi.fn(), getImageInfo: ({ success }: any) => success({ path: "/fixture-logo.png" }),
    createCanvasContext: () => {
      const drawing = { texts: [] as string[] }; canvas.push(drawing);
      return new Proxy({}, { get: (_target, key) => {
        if (key === "fillText") return (value: string) => drawing.texts.push(value);
        if (key === "createLinearGradient" || key === "createCircularGradient") return () => ({ addColorStop() {} });
        if (key === "draw") return (_reserve: boolean, done: () => void) => done();
        return () => {};
      } });
    },
    canvasToTempFilePath: (options: any) => exports.push(options), saveImageToPhotosAlbum: vi.fn(),
  };
  vi.stubGlobal("uni", native);
  const copyText = vi.fn(async () => true), activateChannel = vi.fn(), unavailable = vi.fn();
  const toast = { info: vi.fn(), success: vi.fn() }, download = vi.fn(), anchors: any[] = [];
  const fetchImage = vi.fn(async () => ({ blob: async () => new Blob(["current-poster"]) }));
  vi.stubGlobal("fetch", fetchImage);
  const objectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:current-poster");
  const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal("document", { getElementById: () => null, body: { appendChild: vi.fn() }, createElement: () => {
    const anchor = { href: "", download: "", click: () => download(anchor.href), remove: vi.fn() }; anchors.push(anchor); return anchor;
  } });
  const segments = { default: {} as Component };
  new Function("require", "exports", "segmentsView", segmentCode)((id: string) => {
    if (id === "vue") return Vue;
    if (id === "@/components/liquid-glass.vue") return { default: Vue.defineComponent({ setup: () => () => Vue.h("glass-decoration") }) };
    throw new Error(`Unexpected segments import: ${id}`);
  }, segments, { update() {} });
  const dependencies: Record<string, unknown> = {
    vue: Vue, "qrcode-generator": { default: qrcode }, "@/i18n/use-t": { useT: () => Vue.ref(en) }, "@/i18n/format": { fmt, dateLocale },
    "@/lib/brand-copy": { nexGridBrandText }, "@/api/runtime": remote, "@/lib/device-slot-policy": { isActiveSlotDevice },
    "@/store/app": { useApp }, "@/store/config": { useConfig }, "@/store/profile": { useProfile: () => ({ displayName: "Fixture" }) },
    "@/store/ui": { toast },
    "@/lib/share": { buildShareLink, currentShareReferralCode, copyText, activateChannel, notifyUnavailableShareLink: unavailable },
    "@/composables/use-dialog-a11y": { useDialogA11y: () => {} }, "@/components/glass-segments.vue": segments,
  };
  const compiled = { default: {} as Component };
  new Function("require", "exports", posterCode[platform])((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected poster import: ${id}`);
    return dependencies[id];
  }, compiled);
  const root = node("root"), open = Vue.ref(false); let mountedLive = true;
  const mounted = renderer.createApp({ setup: () => () => Vue.h(compiled.default, { open: open.value, onClose: () => { open.value = false; } }) });
  mounted.config.globalProperties.segmentsView = { update() {} };
  const unmount = () => { if (mountedLive) { mountedLive = false; mounted.unmount(); } };
  mounted.mount(root); unmounts.push(unmount); open.value = true; await flush();
  const control = (label: string) => all(root).find(entry => entry.props.role === "button" && text(entry) === label)!;
  const tab = (label: string) => all(root).find(entry => entry.props.role === "tab" && text(entry) === label);
  const generate = async () => { await flush(); await vi.advanceTimersByTimeAsync(80); await flush(); };
  const finish = async (path = "/fixture-poster.png") => { exports.at(-1)!.success({ tempFilePath: path }); await flush(); };
  const selectYield = async () => { tab(en.share.tplYield)!.props.onClick({ currentTarget: {} }); await generate(); await finish(); };
  const hold = (path: string) => { const pending = deferred<HttpResponse>(); held.set(path, [...(held.get(path) ?? []), pending]); return pending; };
  return { app, cfg, root, native, canvas, exports, copyText, activateChannel, unavailable, transport, session, hold, generate, finish, selectYield, control, tab,
    open, referral, toast, fetchImage, objectUrl, revokeUrl, download, anchors, unmount,
    image: () => all(root).find(entry => entry.tag === "image")?.props.src,
    selected: () => { const selected = all(root).find(entry => entry.props.role === "tab" && entry.props["aria-selected"]); return selected ? text(selected) : undefined; },
  };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); setActivePinia(createPinia());
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn() });
  remote.taskAssignmentApi.state.mockResolvedValue({ serverNow, devices: [], source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true });
  remote.withdrawalApi.list.mockResolvedValue([]);
});
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("mounted poster template during real authority refresh", () => {
  it.each(["home", "fleet", "both"])("keeps My yield selected through %s polling but exports only current confirmed data", async kind => {
    const s = await mount(); await s.selectYield();
    expect(s.canvas.at(-1)!.texts).toContain("+0.00");
    expect(s.canvas.at(-1)!.texts).toContain(fmt(en.share.posterYieldUnit, { n: 1 }));
    const pendingHome = kind !== "fleet" ? s.hold(homePath) : null, pendingFleet = kind !== "home" ? s.hold(fleetPath) : null;
    const reads = [pendingHome ? s.app.refreshHomeTruth() : Promise.resolve(true), pendingFleet ? s.app.refreshRemoteFleet() : Promise.resolve(true)];
    await flush();
    expect(s.selected()).toBe(en.share.tplYield);
    expect(s.control(en.share.saveImage).props["aria-disabled"]).toBe(true);
    await s.control(en.share.copyLink).props.onClick(); s.control("Telegram").props.onClick(); s.control(en.share.saveImage).props.onClick();
    expect(s.copyText).not.toHaveBeenCalled(); expect(s.activateChannel).not.toHaveBeenCalled(); expect(s.native.saveImageToPhotosAlbum).not.toHaveBeenCalled();
    const exportsBefore = s.exports.length; await s.generate(); expect(s.exports).toHaveLength(exportsBefore);
    pendingHome?.resolve(response(home())); await flush();
    if (pendingFleet) expect(s.control(en.share.saveImage).props["aria-disabled"]).toBe(true);
    pendingFleet?.resolve(response(fleet())); await Promise.all(reads); await s.generate(); await s.finish("/fresh-yield.png");
    expect(s.selected()).toBe(en.share.tplYield); expect(s.image()).toBe("/fresh-yield.png");
    expect(s.control(en.share.saveImage).props["aria-disabled"]).toBe(false);
  });

  it("retains the choice after a failed response and retries through the real parser", async () => {
    const s = await mount(); await s.selectYield();
    const pending = s.hold(homePath), request = s.app.refreshHomeTruth(); await flush();
    pending.resolve(response({ ...home(), serverCanonical: false })); expect(await request).toBe(false); await s.generate();
    expect(s.app.homeTruthStatus).toBe("error"); expect(s.selected()).toBe(en.share.tplYield);
    expect(s.image()).toBeUndefined(); expect(s.control(en.share.saveImage).props["aria-disabled"]).toBe(true);
    const retry = s.hold(homePath), recovery = s.app.refreshHomeTruth(); retry.resolve(response(home(1.23))); await recovery;
    await s.generate(); await s.finish(); expect(s.canvas.at(-1)!.texts).toContain("+1.23"); expect(s.selected()).toBe(en.share.tplYield);
  });

  it("falls back after a canonical current fleet confirms no active physical slot", async () => {
    const s = await mount(); await s.selectYield(); const pending = s.hold(fleetPath), request = s.app.refreshRemoteFleet();
    pending.resolve(response(fleet(false))); await request; await s.generate(); await s.finish();
    expect(s.selected()).toBe(en.share.tplBrand); expect(s.tab(en.share.tplYield)).toBeUndefined();
    expect(s.canvas.at(-1)!.texts).not.toContain(en.share.posterYieldCap);
  });

  it("honors an explicit Network selection made while yield data is pending", async () => {
    const s = await mount(); await s.selectYield(); const pending = s.hold(homePath), request = s.app.refreshHomeTruth(); await flush();
    s.tab(en.share.tplBrand)!.props.onClick({ currentTarget: {} }); pending.resolve(response(home())); await request; await s.generate(); await s.finish();
    expect(s.selected()).toBe(en.share.tplBrand);
  });

  it("rejects late canvas completion after authority becomes unknown", async () => {
    const s = await mount(); s.tab(en.share.tplYield)!.props.onClick({ currentTarget: {} }); await s.generate(); const oldCanvas = s.exports.at(-1)!;
    const pending = s.hold(homePath), request = s.app.refreshHomeTruth(); await flush(); oldCanvas.success({ tempFilePath: "/stale-yield.png" }); await s.generate();
    expect(s.image()).toBeUndefined(); expect(s.control(en.share.saveImage).props["aria-disabled"]).toBe(true);
    pending.resolve(response(home())); await request;
  });

  it("rejects an old ready poster immediately after account binding even with the same link", async () => {
    const s = await mount(); await s.selectYield(); const copy = s.control(en.share.copyLink).props.onClick;
    s.session(2002); s.app.bindAccount("user:2002"); await copy();
    expect(s.copyText).not.toHaveBeenCalled(); await flush();
    expect(s.selected()).not.toBe(en.share.tplYield);
  });

  it("invalidates pending canvas completion on unmount", async () => {
    const s = await mount(); s.tab(en.share.tplYield)!.props.onClick({ currentTarget: {} }); await s.generate();
    const oldCanvas = s.exports.at(-1)!, copy = s.control(en.share.copyLink).props.onClick;
    s.unmount(); oldCanvas.success({ tempFilePath: "/unmounted-yield.png" }); await copy();
    expect(s.copyText).not.toHaveBeenCalled();
  });

  it("keeps link configuration failure closed without changing reward settings", async () => {
    const s = await mount(); await s.selectYield(); await s.control(en.share.copyLink).props.onClick();
    expect(s.copyText).toHaveBeenCalledWith(buildShareLink()); s.copyText.mockClear(); s.cfg.configStatus = "failed";
    await s.control(en.share.copyLink).props.onClick(); expect(s.copyText).not.toHaveBeenCalled();
    expect(s.cfg.config.rewards.enabled).toBe(false); expect(s.unavailable).toHaveBeenCalled();
  });
});

async function startHeldSave(s: Awaited<ReturnType<typeof mount>>, stage: "fetch" | "blob" = "blob") {
  const fetchWait = deferred<{ blob: () => Promise<Blob> }>(), blobWait = deferred<Blob>();
  if (stage === "fetch") s.fetchImage.mockImplementationOnce(() => fetchWait.promise);
  else s.fetchImage.mockResolvedValueOnce({ blob: () => blobWait.promise });
  s.control(en.share.saveImage).props.onClick(); await flush();
  expect(s.fetchImage).toHaveBeenCalledWith(s.image());
  const blob = new Blob(["old-poster"]);
  return {
    resolve: async () => {
      if (stage === "fetch") fetchWait.resolve({ blob: async () => blob }); else blobWait.resolve(blob);
      await flush();
    },
    reject: async () => { blobWait.reject(new Error("old blob unavailable")); await flush(); },
    blob,
  };
}
async function rebindAndReopen(s: Awaited<ReturnType<typeof mount>>) {
  s.session(2002); s.app.bindAccount("user:2002"); await flush(); expect(s.open.value).toBe(false);
  s.referral.snapshot!.referralCode = "ACCOUNT2002";
  await Promise.all([s.app.refreshHomeTruth(), s.app.refreshRemoteFleet()]); s.open.value = true;
  await s.generate(); await s.finish("/account2-current.png");
  expect(s.image()).toBe("/account2-current.png"); expect(s.control(en.share.saveImage).props["aria-disabled"]).toBe(false);
}
function noDownload(s: Awaited<ReturnType<typeof mount>>) {
  expect(s.objectUrl).not.toHaveBeenCalled(); expect(s.download).not.toHaveBeenCalled(); expect(s.anchors).toHaveLength(0);
  expect(s.toast.success).not.toHaveBeenCalled();
}

describe("mounted H5 save operation stays bound to its original ready poster", () => {
  it.each(["fetch", "blob"] as const)("rejects old %s after another account reopens a new ready poster", async stage => {
    const s = await mount(); await s.selectYield(); const save = await startHeldSave(s, stage);
    await rebindAndReopen(s); await save.resolve(); noDownload(s);
    expect(s.native.saveImageToPhotosAlbum).not.toHaveBeenCalled();
  });

  it.each(["refresh", "template", "link"])("rejects an old blob after same-account %s creates a new ready poster", async change => {
    const s = await mount(); await s.selectYield(); const save = await startHeldSave(s);
    if (change === "refresh") await s.app.refreshHomeTruth();
    if (change === "template") s.tab(en.share.tplBrand)!.props.onClick({ currentTarget: {} });
    if (change === "link") s.referral.snapshot!.referralCode = "CHANGED456";
    await s.generate(); await s.finish("/same-account-new.png");
    expect(s.control(en.share.saveImage).props["aria-disabled"]).toBe(false);
    await save.resolve(); noDownload(s);
  });

  it("rejects an old generation even if the new image path and link are identical", async () => {
    const s = await mount(); await s.selectYield(); const oldImage = s.image(), save = await startHeldSave(s);
    await s.app.refreshHomeTruth(); await s.generate(); await s.finish(oldImage);
    await save.resolve(); noDownload(s);
  });

  it("suppresses feedback from an old failed blob after the next account is ready", async () => {
    const s = await mount(); await s.selectYield(); const save = await startHeldSave(s);
    await rebindAndReopen(s); await save.reject(); noDownload(s); expect(s.toast.info).not.toHaveBeenCalled();
  });

  it("rejects a held blob after unmount", async () => {
    const s = await mount(); await s.selectYield(); const save = await startHeldSave(s);
    s.unmount(); await save.resolve(); noDownload(s);
  });

  it("downloads the unchanged current poster exactly once and revokes its object URL", async () => {
    const s = await mount(); await s.selectYield(); const save = await startHeldSave(s);
    s.control(en.share.saveImage).props.onClick(); expect(s.fetchImage).toHaveBeenCalledTimes(1);
    await save.resolve(); expect(s.objectUrl).toHaveBeenCalledExactlyOnceWith(save.blob);
    expect(s.download).toHaveBeenCalledExactlyOnceWith("blob:current-poster");
    expect(s.anchors).toHaveLength(1); expect(s.anchors[0].download).toMatch(/^nexgrid-invite-\d+\.png$/);
    expect(s.anchors[0].remove).toHaveBeenCalledTimes(1); expect(s.toast.success).toHaveBeenCalledExactlyOnceWith(en.share.saved);
    expect(s.native.saveImageToPhotosAlbum).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4000); expect(s.revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:current-poster");
  });

  it("preserves the existing guidance for failure of the unchanged current blob", async () => {
    const s = await mount(); await s.selectYield(); const save = await startHeldSave(s);
    await save.reject(); noDownload(s); expect(s.toast.info).toHaveBeenCalledExactlyOnceWith(en.share.saveLongPress);
  });
});

describe("mounted native save callbacks use the same operation fence", () => {
  it.each(["account", "generation"])("ignores old save callbacks after %s invalidation and a new ready poster", async change => {
    const s = await mount("native"); await s.selectYield(); s.control(en.share.saveImage).props.onClick();
    expect(s.native.saveImageToPhotosAlbum).toHaveBeenCalledTimes(1); expect(s.fetchImage).not.toHaveBeenCalled();
    const old = s.native.saveImageToPhotosAlbum.mock.calls[0][0];
    if (change === "account") await rebindAndReopen(s);
    else { await s.app.refreshHomeTruth(); await s.generate(); await s.finish("/new-native-poster.png"); }
    old.success(); old.fail(); expect(s.toast.success).not.toHaveBeenCalled(); expect(s.toast.info).not.toHaveBeenCalled();
  });

  it("keeps success feedback for an unchanged current native save", async () => {
    const s = await mount("native"); await s.selectYield(); s.control(en.share.saveImage).props.onClick();
    const current = s.native.saveImageToPhotosAlbum.mock.calls[0][0]; expect(current.filePath).toBe(s.image());
    current.success(); expect(s.toast.success).toHaveBeenCalledExactlyOnceWith(en.share.saved); expect(s.fetchImage).not.toHaveBeenCalled();
  });
});
