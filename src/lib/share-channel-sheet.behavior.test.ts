import * as Vue from "vue";
import type { Component } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlatformConfigApi } from "@/api/platform-config-api";
import type { ApiClient } from "@/api/api-client";
import type { ShareChannelDef } from "@/store/config-types";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { teamRedesignCopy } from "@/i18n/team-redesign";
import { fmt } from "@/i18n/format";
import { formatAmount } from "@/lib/amount-display";
import source from "@/components/team/share-channel-sheet.vue?raw";
import inviteSource from "@/components/team/invite-earn-card.vue?raw";

const runtime = vi.hoisted(() => ({
  remoteApiEnabled: true, fundsServerEnabled: true, expectedApiEnvironment: "dev",
  platformConfigApi: { platformConfig: vi.fn() }, referralRewardApi: { snapshot: vi.fn() },
  shareEventApi: { record: vi.fn() }, sessionVault: { read: vi.fn() },
  purchaseEligibilityApi: { snapshot: vi.fn() },
}));
const feedback = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn() }));
vi.mock("@/api/runtime", () => runtime);
vi.mock("@/store/ui", () => ({ toast: feedback }));
vi.mock("@/i18n/use-t", () => ({ useT: () => Vue.ref(en) }));
const { useConfig } = await import("@/store/config");
const { useReferralReward } = await import("@/store/referral-reward");
const share = await import("@/lib/share");
const { demoShareOverride } = await import(new URL("../../scripts/lib/prototype-demo-share.mjs", import.meta.url).href);
const { fixture } = await import(new URL("../../scripts/lib/design-review-fixture.mjs", import.meta.url).href);
const state = { dataState: "normal" };
const api = createPlatformConfigApi({ request: async ({ path }: { path: string }) => {
  const url = new URL(path, "http://127.0.0.1:5197");
  return demoShareOverride(url, "en", state) ?? fixture(url, "en", state);
} } as ApiClient, "dev");

// Execute the real SFC setup, template, handlers, share library, config store
// and API parser. Only host rendering and external device/browser APIs vary.
function compile(source: string) {
  const descriptor = parse(source, { filename: "share-entry.vue" }).descriptor;
  const compiledScript = compileScript(descriptor, { id: "share-recovery", inlineTemplate: true,
    templateOptions: { compilerOptions: { hoistStatic: false, isCustomElement: tag => ["view", "text"].includes(tag) } },
  });
  return ts.transpileModule(compiledScript.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const code = compile(source), entryCode = compile(inviteSource);
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
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); },
});
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const text = (root: Host): string => root.text + root.children.map(text).join("");
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); await Vue.nextTick(); };
const unmounts: Array<() => void> = [];
function mount(messages = en, throughEntry = false) {
  const account = Vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1, user: { referralCode: "UNCONFIRMED_LOCAL_CODE" } });
  const dependencies: Record<string, unknown> = {
    vue: Vue, "@/lib/amount-display": { formatAmount }, "@/i18n/format": { fmt },
    "@/i18n/use-t": { useT: () => Vue.ref(messages) },
    "@/composables/use-product-phase": { useProductPhase: () => Vue.ref({ inviteBonusMultiplier: 1 }) },
    "@/lib/share": share, "@/api/runtime": runtime, "@/store/config": { useConfig },
    "@/store/referral-reward": { useReferralReward }, "@/store/ui": { toast: feedback },
    "@/composables/use-dialog-a11y": { useDialogA11y: () => {} },
    "@/store/app": { useApp: () => account },
    "@/store/locale": { useLocaleStore: () => ({ code: messages === zh ? "zh" : messages === vietnamese ? "vi" : "en" }) },
    "@/i18n/team-redesign": { teamRedesignCopy },
    "@/api/order-api": { subscribeRuntimeRevision: () => () => {} },
    "@/components/home/pulse-dot.vue": { default: { render: () => Vue.h("view") } },
    "@/components/team/share-poster-sheet.vue": { default: { render: () => Vue.h("view") } },
  };
  for (const id of ["./team-art.vue", "./share-poster-sheet.vue", "./invite-detail-sheet.vue", "@/components/liquid-glass.vue"]) {
    dependencies[id] = { default: { render: () => Vue.h("decoration") } };
  }
  const evaluate = (script: string) => {
    const compiled = { default: {} as Component };
    new Function("require", "exports", script)((id: string) => {
      if (!(id in dependencies)) throw new Error(`Unexpected share sheet import: ${id}`);
      return dependencies[id];
    }, compiled);
    return compiled;
  };
  const sheet = evaluate(code);
  dependencies["@/components/team/share-channel-sheet.vue"] = sheet;
  dependencies["./share-channel-sheet.vue"] = sheet;
  const compiled = throughEntry ? evaluate(entryCode) : sheet;
  const root = node("root"), open = Vue.ref(true), poster = vi.fn();
  const app = renderer.createApp({ setup: () => () => Vue.h(compiled.default, throughEntry ? {} : {
    open: open.value, onClose: () => { open.value = false; }, onOpenPoster: poster,
  }) });
  app.mount(root); unmounts.push(() => app.unmount());
  const control = (label: string) => all(root).find(entry => entry.props.role === "button" && (entry.props["aria-label"] === label || text(entry) === label));
  return { root, open, poster, control, account, nodes: (className: string) => all(root).filter(entry => String(entry.props.class).split(" ").includes(className)) };
}
const copy: ShareChannelDef = { key: "copy", intentType: "copy", enabled: true };
const system: ShareChannelDef = { key: "system", intentType: "system", enabled: true };

beforeEach(async () => {
  vi.clearAllMocks(); setActivePinia(createPinia()); state.dataState = "normal";
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn(),
    setClipboardData: vi.fn(({ success }) => success()),
  });
  vi.stubGlobal("navigator", {});
  runtime.platformConfigApi.platformConfig.mockImplementation(api.platformConfig);
  const cfg = useConfig(); await cfg.load();
  useReferralReward().snapshot = { referralCode: "SHARE-DEMO", rewardEnabled: false, inviterRewardNex: 0,
    invitedCount: 0, pendingCount: 0, settledCount: 0, lifetimeInviterNex: 0, walletNexAvailable: 0, recentRewards: [],
    limit: 10, source: "ledger", sourceEnvironment: "PRODUCTION", runId: null, factSources: [], refreshedAt: "2026-10-25T00:00:00Z" };
  runtime.platformConfigApi.platformConfig.mockClear();
});
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.unstubAllGlobals(); });

describe("mounted invitation share sheet", () => {
  it.each(["failed", "loading"])("opens through the actual invitation entry with %s platform data and recovers in place", async state => {
    const cfg = useConfig(), rewards = useReferralReward();
    const snapshot = { ...rewards.snapshot!, referralCode: "UVELDEMO" };
    runtime.referralRewardApi.snapshot.mockResolvedValue(snapshot);
    cfg.configStatus = "idle"; cfg.config.share.baseUrl = ""; cfg.config.share.channels = [];
    let finish!: (value: Awaited<ReturnType<typeof api.platformConfig>>) => void;
    if (state === "failed") runtime.platformConfigApi.platformConfig.mockRejectedValue(new Error("503"));
    else runtime.platformConfigApi.platformConfig.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const startup = cfg.load(); await flush();
    const s = mount(en, true); await flush();
    s.nodes("nx-team-share-now")[0].props.onClick(); await flush();
    expect(s.nodes("ss-root")).toHaveLength(1);
    expect(text(s.root)).toContain("UVELDEMO");
    expect(text(s.root)).toContain(state === "failed" ? en.share.channelsLoadFailed : en.share.channelsLoading);
    expect(s.control(en.share.copyCode)!.props["aria-disabled"]).toBe(false);
    expect(s.control(en.share.copyLink)!.props["aria-disabled"]).toBe(true);
    expect(s.control(en.share.posterTitle)!.props["aria-disabled"]).toBe(true);
    await s.control(en.share.copyCode)!.props.onClick();
    expect(uni.setClipboardData).toHaveBeenLastCalledWith(expect.objectContaining({ data: "UVELDEMO" }));
    await s.control(en.share.copyLink)!.props.onClick(); await s.control(en.share.posterTitle)!.props.onClick();
    expect(uni.setClipboardData).toHaveBeenCalledOnce();
    const next = await api.platformConfig();
    if (state === "failed") {
      runtime.platformConfigApi.platformConfig.mockResolvedValue(next);
      await s.control(en.share.retry)!.props.onClick();
    } else { finish(next); await startup; }
    await flush();
    expect(s.nodes("ss-root")).toHaveLength(1);
    expect(s.control(en.share.copyLink)!.props["aria-disabled"]).toBe(false);
    await s.control(en.share.copyLink)!.props.onClick();
    expect(uni.setClipboardData).toHaveBeenLastCalledWith(expect.objectContaining({ data: share.buildShareLink("UVELDEMO") }));
    expect(runtime.shareEventApi.record).not.toHaveBeenCalled();
  });

  it.each([en, zh, vietnamese])("renders configured local actions, preserves the glass sheet and closes", async messages => {
    const s = mount(messages); await flush();
    expect(s.nodes("nx-glass-sheet")).toHaveLength(1);
    expect(all(s.root).filter(n => n.props.role === "dialog")).toHaveLength(1);
    expect(s.nodes("ss-actions")).toHaveLength(1);
    expect(s.nodes("ss-ch")).toHaveLength(2);
    expect(s.control(messages.share.copyLink)).toBeDefined();
    expect(s.control(messages.share.posterTitle)).toBeDefined();
    expect(s.control(messages.share.more)).toBeUndefined();
    await s.control(messages.share.posterTitle)!.props.onClick();
    expect(s.poster).toHaveBeenCalledOnce();
    expect(runtime.shareEventApi.record).not.toHaveBeenCalled();
    s.control(messages.share.cancel)!.props.onClick(); await flush();
    expect(s.nodes("ss-root")).toHaveLength(0);
  });

  it("keeps all three core invitation actions with an empty channel list and retries optional channels", async () => {
    const cfg = useConfig(); cfg.config.share.channels = [];
    const s = mount(); await flush();
    expect(text(s.root)).toContain(en.share.channelsEmpty);
    expect(s.nodes("ss-ch")).toHaveLength(2);
    expect(text(s.root)).toContain("SHARE-DEMO");
    await s.control(en.share.copyCode)!.props.onClick();
    expect(uni.setClipboardData).toHaveBeenLastCalledWith(expect.objectContaining({ data: "SHARE-DEMO" }));
    await s.control(en.share.copyLink)!.props.onClick();
    expect(uni.setClipboardData).toHaveBeenLastCalledWith(expect.objectContaining({ data: share.buildShareLink() }));
    await s.control(en.share.posterTitle)!.props.onClick();
    expect(s.poster).toHaveBeenCalledOnce();
    expect(runtime.shareEventApi.record).not.toHaveBeenCalled();
    let resolve!: (snapshot: Awaited<ReturnType<typeof api.platformConfig>>) => void;
    runtime.platformConfigApi.platformConfig.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const retry = s.control(en.share.retry)!;
    const pending = retry.props.onClick(); await flush();
    expect(text(s.root)).toContain(en.share.channelsLoading);
    expect(retry.props["aria-disabled"]).toBe(true);
    expect(s.control(en.share.copyLink)!.props["aria-disabled"]).toBe(false);
    expect(s.control(en.share.posterTitle)!.props["aria-disabled"]).toBe(false);
    await retry.props.onClick();
    expect(runtime.platformConfigApi.platformConfig).toHaveBeenCalledOnce();
    resolve(await api.platformConfig()); await pending; await flush();
    expect(s.open.value).toBe(true);
    expect(s.control(en.share.copyLink)!.props["aria-disabled"]).toBe(false);
    expect(useConfig().config.share.channels).toHaveLength(3);
  });

  it("joins an initial load, exposes failure and recovers only from a new valid response", async () => {
    const cfg = useConfig(); cfg.configStatus = "idle"; cfg.config.share.channels = []; cfg.config.share.baseUrl = "";
    runtime.platformConfigApi.platformConfig.mockRejectedValueOnce(new Error("offline"));
    const s = mount();
    expect(text(s.root)).toContain(en.share.channelsLoading);
    await flush();
    expect(text(s.root)).toContain(en.share.channelsLoadFailed);
    expect(s.nodes("ss-ch")).toHaveLength(2);
    expect(s.control(en.share.copyLink)!.props["aria-disabled"]).toBe(true);
    expect(s.control(en.share.posterTitle)!.props["aria-disabled"]).toBe(true);
    expect(s.control(en.share.copyCode)!.props["aria-disabled"]).toBe(false);
    await s.control(en.share.copyCode)!.props.onClick();
    expect(uni.setClipboardData).toHaveBeenLastCalledWith(expect.objectContaining({ data: "SHARE-DEMO" }));
    await s.control(en.share.retry)!.props.onClick(); await flush();
    expect(runtime.platformConfigApi.platformConfig).toHaveBeenCalledTimes(2);
    expect(cfg.configStatus).toBe("ready");
    expect(s.control(en.share.copyLink)).toBeDefined();
  });

  it("blocks stale channel handlers after authority is lost and keeps poster closed without a link", async () => {
    const s = mount(); await flush();
    const poster = s.control(en.share.posterTitle)!;
    useConfig().configStatus = "failed"; await flush();
    await poster.props.onClick();
    expect(s.poster).not.toHaveBeenCalled();
    expect(uni.setClipboardData).not.toHaveBeenCalled();
    useConfig().configStatus = "ready"; useConfig().config.share.baseUrl = ""; await flush();
    expect(text(s.root)).toContain(en.share.linkUnavailable);
    expect(poster.props["aria-disabled"]).toBe(true);
  });

  it("does not let disabled or misconfigured channel entries suppress or hijack local actions", async () => {
    useConfig().config.share.channels = [
      { key: "copy", intentType: "web", enabled: true, urlTemplate: "https://example.test/?url={link}", textTemplate: "{link}" },
      { key: "poster", intentType: "poster", enabled: false },
    ];
    const openExternal = vi.fn(); vi.stubGlobal("window", { open: openExternal });
    const s = mount(); await flush();
    expect(s.nodes("ss-ch")).toHaveLength(2);
    await s.control(en.share.copyLink)!.props.onClick();
    await s.control(en.share.posterTitle)!.props.onClick();
    expect(uni.setClipboardData).toHaveBeenCalledOnce();
    expect(s.poster).toHaveBeenCalledOnce();
    expect(openExternal).not.toHaveBeenCalled();
    expect(runtime.shareEventApi.record).not.toHaveBeenCalled();
  });

  it("reports a failed code copy honestly and allows another attempt", async () => {
    const s = mount(); await flush();
    vi.mocked(uni.setClipboardData).mockImplementationOnce(({ fail }) => { fail?.({ errMsg: "denied" }); });
    await s.control(en.share.copyCode)!.props.onClick();
    expect(feedback.info).toHaveBeenLastCalledWith(en.share.copyFailed);
    expect(feedback.success).not.toHaveBeenCalled();
    await s.control(en.share.copyCode)!.props.onClick();
    expect(feedback.success).toHaveBeenCalledWith(en.team.inviteCodeCopied);
    expect(runtime.shareEventApi.record).not.toHaveBeenCalled();
  });

  it("copies the actual link once, reports success only on completion, and records no share event", async () => {
    const s = mount(); await flush();
    let finish!: () => void;
    vi.mocked(uni.setClipboardData).mockImplementationOnce(({ success }) => { finish = () => success?.({ errMsg: "ok" }); });
    const button = s.control(en.share.copyLink)!;
    const pending = button.props.onClick(); await flush();
    await button.props.onClick();
    expect(uni.setClipboardData).toHaveBeenCalledOnce();
    expect(uni.setClipboardData).toHaveBeenCalledWith(expect.objectContaining({ data: share.buildShareLink() }));
    expect(feedback.success).not.toHaveBeenCalled();
    finish(); await pending; await flush();
    expect(feedback.success).toHaveBeenCalledWith(en.team.inviteLinkCopied);
    expect(button.props["aria-disabled"]).toBe(false);
    expect(runtime.shareEventApi.record).not.toHaveBeenCalled();
  });

  it("recovers when copying fails or its platform API throws", async () => {
    const s = mount(); await flush();
    vi.mocked(uni.setClipboardData).mockImplementationOnce(({ fail }) => { fail?.({ errMsg: "denied" }); });
    await s.control(en.share.copyLink)!.props.onClick();
    expect(feedback.info).toHaveBeenLastCalledWith(en.share.copyFailed);
    vi.mocked(uni.setClipboardData).mockImplementationOnce(() => { throw new Error("clipboard missing"); });
    await s.control(en.share.copyLink)!.props.onClick();
    expect(feedback.info).toHaveBeenLastCalledWith(en.share.copyFailed);
    expect(feedback.success).not.toHaveBeenCalled();
    await s.control(en.share.copyLink)!.props.onClick();
    expect(feedback.success).toHaveBeenCalledOnce();
    expect(runtime.shareEventApi.record).not.toHaveBeenCalled();
  });

  it("provides a retry for missing referral authority without opening a blank poster", async () => {
    const referral = useReferralReward(); referral.snapshot = null;
    runtime.referralRewardApi.snapshot.mockRejectedValue(new Error("offline"));
    const s = mount(); await flush();
    expect(text(s.root)).toContain(en.share.linkUnavailable);
    expect(s.control(en.share.retry)).toBeDefined();
    expect(s.control(en.share.copyCode)!.props["aria-disabled"]).toBe(true);
    await s.control(en.share.posterTitle)!.props.onClick();
    expect(s.poster).not.toHaveBeenCalled();
  });
});

describe("actual channel capabilities and honest system feedback", () => {
  it("does not invent channels and hides disabled and unimplemented native intents", () => {
    useConfig().config.share.channels = [copy, { ...copy, enabled: false }, system,
      { key: "zalo", intentType: "scheme", enabled: true, textTemplate: "{link}" }];
    expect(share.visibleChannels().map(c => c.key)).toEqual(["copy"]);
    vi.stubGlobal("navigator", { share: vi.fn() });
    expect(share.visibleChannels().map(c => c.key)).toEqual(["copy", "system"]);
    useConfig().config.share.channels = [];
    expect(share.visibleChannels()).toEqual([]);
  });

  it("keeps system cancellation silent and reports actual failure without a receipt", async () => {
    const send = vi.fn().mockRejectedValueOnce({ name: "AbortError" }).mockRejectedValueOnce({ name: "NotAllowedError" });
    vi.stubGlobal("navigator", { share: send });
    const s = mount(); await flush();
    expect(s.nodes("ss-ch")).toHaveLength(3);
    await s.control(en.share.more)!.props.onClick();
    expect(feedback.info).not.toHaveBeenCalled();
    await s.control(en.share.more)!.props.onClick();
    expect(feedback.info).toHaveBeenCalledWith(en.share.actionFailed);
    expect(runtime.shareEventApi.record).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ url: share.buildShareLink() }));
  });
});


describe("share sheet current-account actions and scroll boundary", () => {
  it.each(["code", "link"])("drops late %s copy feedback after closing or rebinding the same-code account", async kind => {
    const s = mount(); await flush();
    let finish!: () => void;
    vi.mocked(uni.setClipboardData).mockImplementationOnce(({ success }: any) => { finish = () => success(); });
    const action = s.control(kind === "code" ? en.share.copyCode : en.share.copyLink)!;
    const pending = action.props.onClick(); await flush();
    expect(action.props["aria-disabled"]).toBe(true);
    s.account.accountBindingEpoch++; await flush();
    expect(s.open.value).toBe(false);
    finish(); await pending; await flush();
    expect(feedback.success).not.toHaveBeenCalled(); expect(feedback.info).not.toHaveBeenCalled();
    expect(runtime.shareEventApi.record).not.toHaveBeenCalled();
  });

  it("keeps the close control outside scrolling content and expands neutral rules", async () => {
    const s = mount(); await flush();
    const head = s.nodes("ss-head")[0], body = s.nodes("ss-body")[0];
    expect(head.parent).toBe(body.parent);
    expect(all(body)).not.toContain(s.control(en.ui.close));
    const rules = s.control(teamRedesignCopy("en").inviteRules)!;
    expect(rules.props["aria-expanded"]).toBe(false);
    rules.props.onClick(); await flush();
    expect(rules.props["aria-expanded"]).toBe(true);
    expect(text(s.nodes("ss-rules")[0])).toContain(teamRedesignCopy("en").inviteRuleSettlement);
    expect(text(s.root)).not.toContain(en.team.perFriendCooldown);
    s.control(en.ui.close)!.props.onClick(); await flush();
    expect(s.open.value).toBe(false);
  });

  it("hides stale reward amounts and retries the reward read without losing local sharing", async () => {
    const rewards = useReferralReward(); rewards.snapshot!.rewardEnabled = true; rewards.snapshot!.inviterRewardNex = 12.34;
    const s = mount(); await flush();
    expect(text(s.nodes("ss-reward")[0])).toContain("12.34 UVT");
    rewards.error = "offline"; await flush();
    expect(text(s.root)).not.toContain("12.34 UVT");
    expect(s.control(en.share.copyLink)!.props["aria-disabled"]).toBe(false);
    runtime.referralRewardApi.snapshot.mockResolvedValue({ ...rewards.snapshot!, inviterRewardNex: 23.45 });
    await s.control(en.share.retry)!.props.onClick(); await flush();
    expect(runtime.referralRewardApi.snapshot).toHaveBeenCalledOnce();
    expect(text(s.nodes("ss-reward")[0])).toContain("23.45 UVT");
  });
});
