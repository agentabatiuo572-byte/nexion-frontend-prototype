import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import source from "./conversion-banner.vue?raw";
import * as carousel from "@/lib/home-task-carousel";
import * as questPresentation from "@/lib/quest-presentation";
import * as questBusiness from "@/lib/quest-business-availability";
import type { CanonicalPromoBanner, CanonicalQuest } from "@/api/quest-api";
import type { LocaleCode } from "@/i18n";
import { en, type Messages } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

// Run the actual SFC setup and template with the real projection/localization helpers.
// All unrelated remote services are inert; rendering and CTA clicks make no requests.
const script = compileScript(parse(source).descriptor, { id: "weekly-promo-ownership", inlineTemplate: true,
  templateOptions: { compilerOptions: { hoistStatic: false } } });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type Host = { text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (text = ""): Host => ({ text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: () => node(), createText: node, createComment: () => node(),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, next) => { target.props[key] = next; },
  parentNode: target => target.parent,
  nextSibling: target => target.parent?.children[target.parent.children.indexOf(target) + 1] ?? null,
  insert: (target, parent, anchor) => {
    if (target.parent) target.parent.children = target.parent.children.filter(entry => entry !== target);
    target.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(target); else parent.children.splice(index, 0, target);
  },
  remove: target => { if (target.parent) target.parent.children = target.parent.children.filter(entry => entry !== target); },
});
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const text = (root: Host): string => root.text + root.children.map(text).join("");
const find = (root: Host, name: string): Host => all(root).find(entry => String(entry.props.class ?? "").split(/\s+/).includes(name))!;
const unmounts: Array<() => void> = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.useRealTimers(); });

const now = Date.parse("2026-10-08T10:14:10Z");
const quest: CanonicalQuest = {
  questCode: "weekly_t2_invite_friend", name: "邀请 1 位朋友注册", layer: "WEEKLY_T2",
  rewardNex: 200, status: "PENDING", category: "social", actionRoute: "/pages/team/team",
  instanceKey: "WEEK:2026-W41", eligibleFrom: "2026-10-05T01:00:00+09:00",
  eligibleUntil: "2026-10-12T01:00:00+09:00", eligible: true,
};
const pausedPromo: CanonicalPromoBanner = {
  bannerCode: "HOME_WEEKLY_UPSELL", baseReward: 800, multiplier: 1.5,
  countdownDays: 4, countdownHours: 12, targetDevice: "StellarBox Pro", targetDaily: 1.5, status: "paused",
};
const activePromo = { ...pausedPromo, status: "active" as const };
const languages = [["en", en], ["zh", zh], ["vi", vietnamese]] as const;

async function mount(locale: LocaleCode, copy: Messages, quests: CanonicalQuest[], promo: CanonicalPromoBanner | null) {
  const navTo = vi.fn();
  const wq = {
    tier1Quests: quests.filter(row => row.layer === "WEEKLY_T1"),
    tier2Quests: quests.filter(row => row.layer === "WEEKLY_T2"),
    snapshot: { quests, promoBanner: promo }, multiplier: 1,
    loading: false, error: null, claimErrorQuestCode: null, refresh: vi.fn(),
  };
  const dependencies: Record<string, unknown> = {
    vue: Vue,
    "@/i18n/use-t": { useT: () => Vue.ref(copy) },
    "@/store/locale": { useLocaleStore: () => ({ code: locale }) },
    "@/store/content-copy": { useContentCopy: () => ({ refresh: async () => {}, deliveries: {}, status: {} }) },
    "@/store/order-canonical": { refreshCanonicalOrders: vi.fn() },
    "@/store/weekly-quest": { useWeeklyQuest: () => wq },
    "@/lib/home-task-carousel": carousel,
    "@/lib/quest-presentation": questPresentation,
    "@/lib/quest-business-availability": questBusiness,
    "@/lib/route": { navTo },
    "@/composables/use-now": { useNow: () => Vue.ref(now / 1000) },
    "@/composables/use-genesis-sale-gate": { useGenesisSaleGate: () => ({ block: Vue.ref(null) }) },
    "@/store/genesis-config": { genesisBlockIsKnownUnavailable: () => false },
    "@/composables/use-quest-target-availability": { useQuestTargetAvailability: () => Vue.ref({ stakingClosed: false, exchangeClosed: false }) },
  };
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected weekly-card import: ${id}`);
    return dependencies[id];
  }, exports);
  const root = node();
  const app = renderer.createApp(exports.default);
  app.mount(root); unmounts.push(() => app.unmount());
  await Vue.nextTick();
  return { root, navTo, wq };
}

test.each(languages.flatMap(([locale, copy]) => [pausedPromo, activePromo, null].map(promo => ({ locale, copy, promo }))))(
  "$locale weekly task retains its own fields with $promo.status independent promo", async ({ locale, copy, promo }) => {
    const original = JSON.stringify({ quest, promo });
    const { root, navTo, wq } = await mount(locale, copy, [quest], promo);
    expect(text(find(root, "weekly-quest__subtitle"))).toBe(questPresentation.weeklyQuestDisplayName(quest, locale, copy));
    expect(text(find(root, "weekly-quest__reward-value"))).toBe("+200");
    expect(text(find(root, "weekly-quest__multiplier"))).toBe("1×");
    expect(text(find(root, "weekly-quest__category"))).toBe(copy.home.dayOneCatSocial);
    expect(text(find(root, "weekly-quest__countdown-value"))).toBe("3d 05h");
    expect(text(find(root, "weekly-quest__cta"))).toContain(copy.weeklyQuest.goComplete);
    expect(find(root, "weekly-quest__rate")).toBeUndefined();
    expect(text(root)).not.toContain("UVELBox Pro");
    const card = find(root, "weekly-quest");
    expect(card.props["data-target-device"]).toBe("");
    expect(card.props["data-quest-category"]).toBe("social");
    expect(card.props.role).toBe("button"); expect(card.props.tabindex).toBe(0);
    card.props.onClick(); expect(navTo).toHaveBeenCalledExactlyOnceWith(quest.actionRoute);
    expect(wq.refresh).not.toHaveBeenCalled();
    expect(JSON.stringify({ quest, promo })).toBe(original);
  },
);

test.each(languages)("%s zero-reward task keeps its own reward instead of the promo reward", async (locale, copy) => {
  const { root, navTo } = await mount(locale, copy, [{ ...quest, rewardNex: 0 }], activePromo);
  expect(text(find(root, "weekly-quest__reward-value"))).toBe("+0");
  expect(find(root, "weekly-quest__rate")).toBeUndefined();
  find(root, "weekly-quest").props.onClick(); expect(navTo).toHaveBeenCalledExactlyOnceWith(quest.actionRoute);
});

test.each(languages.flatMap(([locale, copy]) => [[], [{ ...quest, status: "CLAIMED" as const }]].map(quests => ({ locale, copy, quests }))))(
  "$locale no available task preserves the active promo fallback", async ({ locale, copy, quests }) => {
    const original = JSON.stringify({ quests, activePromo });
    const { root, navTo } = await mount(locale, copy, quests, activePromo);
    expect(text(find(root, "weekly-quest__subtitle"))).toBe("UVELBox Pro");
    expect(text(find(root, "weekly-quest__reward-value"))).toBe("+1,200");
    expect(text(find(root, "weekly-quest__multiplier"))).toBe("1.5×");
    expect(text(find(root, "weekly-quest__countdown-value"))).toBe("4d 12h");
    expect(text(find(root, "weekly-quest__rate-value"))).toBe("$1.50");
    expect(find(root, "weekly-quest__category")).toBeUndefined();
    expect(text(find(root, "weekly-quest__cta"))).toContain(copy.home.weeklyQuestGetNexGridBox);
    find(root, "weekly-quest").props.onClick(); expect(navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/store");
    expect(JSON.stringify({ quests, activePromo })).toBe(original);
  },
);

test.each(languages.flatMap(([locale, copy]) => [[], [{ ...quest, status: "CLAIMED" as const }]].flatMap(quests =>
  [pausedPromo, null].map(promo => ({ locale, copy, quests, promo })))))(
  "$locale no available task and no active promo remains non-actionable", async ({ locale, copy, quests, promo }) => {
    const { root, navTo } = await mount(locale, copy, quests, promo);
    expect(text(root)).toContain(copy.weeklyQuest.noTaskAction);
    expect(find(root, "weekly-quest__reward-value")).toBeUndefined();
    expect(find(root, "weekly-quest__rate")).toBeUndefined();
    const card = find(root, "weekly-quest");
    expect(card.props.role).toBeUndefined(); expect(card.props.tabindex).toBe(-1);
    expect(card.props["aria-disabled"]).toBe("true");
    card.props.onClick(); expect(navTo).not.toHaveBeenCalled();
  },
);
