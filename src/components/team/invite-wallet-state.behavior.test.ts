import * as displayDate from "@/lib/display-date";
import { formatFinanceAmount } from "@/lib/finance-amount-display";
import * as Vue from "vue";
import { renderToString } from '@vue/server-renderer';
import { chromium } from 'playwright';
// @ts-expect-error Node builtins are used only by the test runner.
import { readFileSync, writeFileSync } from 'node:fs';
// @ts-expect-error Node builtins are used only by the test runner.
import { env } from 'node:process';
import { createPinia, setActivePinia } from "pinia";
import { useDataVisibility } from '@/store/data-visibility';
import { formatAmount } from "@/lib/amount-display";
import type { Component } from "vue";
import { compileScript, compileStyle, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import detailSource from "./invite-detail-sheet.vue?raw";
import { teamRedesignCopy, referralSettlementStatus } from "@/i18n/team-redesign";
import inviteSource from "./invite-earn-card.vue?raw";
import walletSource from "../me/wallet-card.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt, fmtMoney, openSlotsTemplate, dateLocale } from "@/i18n/format";
import { auditUiCopy, useAuditUiCopy } from "@/i18n/audit-ui";
import { useLocaleStore } from "@/store/locale";
import { remoteAuthorityStatus } from "@/lib/remote-authority-display";
import type { ReferralRewardSnapshot } from "@/api/referral-reward-api";
import { advanceRuntimeRevision, captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import * as tabLifecycle from "@/composables/use-tab-page-lifecycle";
vi.mock("@dcloudio/uni-app", () => ({ onLoad: vi.fn(), onShow: vi.fn(), onHide: vi.fn(), onUnload: vi.fn() }));

// Run the production SFC scripts and templates. These isolated read states
// supplement the device acceptance; they are not evidence of a live backend.
type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (tag: string, text = ""): Host => ({ tag, text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => node(tag), createText: text => node("#text", text), createComment: () => node("#comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
    child.parent = parent;
    const at = anchor ? parent.children.indexOf(anchor) : -1;
    if (at < 0) parent.children.push(child); else parent.children.splice(at, 0, child);
  },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); },
});
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const text = (root: Host): string => root.text + root.children.map(text).join("");
const accessibleText = (root: Host): string => root.props['aria-hidden'] === true || root.props['aria-hidden'] === 'true'
  ? '' : root.text + root.children.map(accessibleText).join('');
const hasClass = (target: Host, name: string) => Vue.normalizeClass(target.props.class).split(" ").includes(name);
const find = (root: Host, name: string) => all(root).find(target => hasClass(target, name))!;
const unmounts: Array<() => void> = [];
const lifecycles = new WeakMap<Host, ReturnType<typeof tabLifecycle.createTabLifecycle>>();

function compile(source: string, dependencies: Record<string, unknown>) {
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "invite-wallet-state", inlineTemplate: true,
    // The in-memory host has no HTML parser for Vue's static SVG cache.
    templateOptions: { compilerOptions: { hoistStatic: false } } });
  const code = ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (id === "@/lib/finance-amount-display") return { formatFinanceAmount };
    if (id === "@/lib/amount-display") return { formatAmount };
    if (id === "vue") return Vue;
    if (id === '@/store/data-visibility') return { useDataVisibility };
    if (id === "@/composables/use-tab-page-lifecycle") return tabLifecycle;
    if (id in dependencies) return dependencies[id];
    if (id === "@/lib/route") return { navTo: vi.fn() };
    if (id === "./invite-detail-sheet.vue") return { default: compile(detailSource, dependencies) };
    if (id.endsWith(".vue")) return { default: { render: () => Vue.h("view") } };
    throw new Error(`Unexpected component import: ${id}`);
  }, exports);
  return exports.default;
}
async function mount(source: string, dependencies: Record<string, unknown>) {
  const root = node("root");
  const content = compile(source, dependencies);
  const lifecycle = tabLifecycle.createTabLifecycle({}, true);
  lifecycles.set(root, lifecycle);
  const app = renderer.createApp({ setup() {
    Vue.provide(tabLifecycle.TAB_LIFECYCLE, lifecycle);
    return () => Vue.h(content);
  } });
  app.mount(root); unmounts.push(() => app.unmount());
  await Vue.nextTick();
  return root;
}

function snapshot(rewardEnabled = false): ReferralRewardSnapshot {
  return { referralCode: "INVITE123", rewardEnabled, inviterRewardNex: rewardEnabled ? 12 : 0,
    invitedCount: 2, pendingCount: 1, settledCount: 1, lifetimeInviterNex: 7, walletNexAvailable: 7,
    recentRewards: [], limit: 5, source: "ledger", sourceEnvironment: "PRODUCTION", runId: null,
    factSources: ["nx_referral_reward_settlement", "nx_wallet_ledger", "nx_earnings_release_entry", "nx_user_wallet"],
    refreshedAt: "2026-10-01T00:00:00Z" };
}

async function invitation(copy = en, initial: ReferralRewardSnapshot | null = snapshot()) {
  useLocaleStore().setLocale(copy === zh ? "zh" : copy === vietnamese ? "vi" : "en");
  const rewards = Vue.reactive({ snapshot: initial,
    error: "", loading: false, invalidateReadOwner: vi.fn(), ensure: vi.fn(async () => true), refresh: vi.fn(async () => true) });
  const pageApp = Vue.reactive({ accountKey: 'user:fixture', accountBindingEpoch: 1, user: { referralCode: 'STALE_LOCAL_CODE' } });
  const runtime = Vue.reactive({ environment: 'dev' });
  const catalog = Vue.reactive({ serverCanonical: true, sourceEnvironment: 'PRODUCTION', runId: '', status: 'ready' });
  const catalogProof = Vue.ref({ sourceEnvironment: 'PRODUCTION', runId: '', runtimeEpoch: captureRuntimeRevision().epoch });
  const copyText = vi.fn(async () => true);
  const recordShareEvent = vi.fn();
  const notifyUnavailableShareLink = vi.fn();
  const toast = { info: vi.fn(), success: vi.fn() };
  const root = await mount(inviteSource, {
    "@/i18n/use-t": { useT: () => Vue.ref(copy) }, "@/lib/display-date": displayDate, "@/i18n/format": { fmt, dateLocale },
    "@/store/locale": { useLocaleStore }, "@/i18n/team-redesign": { teamRedesignCopy, referralSettlementStatus },
    "@/composables/use-dialog-a11y": { useDialogA11y: () => {} },
    "@/store/app": { useApp: () => pageApp },
    "@/store/referral-reward": { useReferralReward: () => rewards },
    "@/api/runtime": { remoteApiEnabled: true, apiRuntimeConfig: runtime },
    "@/store/product-catalog": { productCatalogState: catalog, productCatalogDisplayProof: Vue.readonly(catalogProof),
      isProductCatalogDisplayCurrent: (scope = captureRuntimeRevision()) => isCurrentRuntimeRevision(scope) && scope.epoch === catalogProof.value.runtimeEpoch },
    "@/api/order-api": { subscribeRuntimeRevision },
    "@/store/ui": { toast },
    "@/lib/share": { copyText, recordShareEvent, notifyUnavailableShareLink,
      buildShareLink: (code: string) => code ? `https://invite.example/?ref=${code}` : "" },
  });
  return { root, rewards, copyText, recordShareEvent, notifyUnavailableShareLink, toast, pageApp, runtime, catalog };
}

beforeEach(() => { vi.stubGlobal('uni', { getStorageSync: () => undefined, setStorageSync: vi.fn() }); vi.useFakeTimers(); setActivePinia(createPinia()); });
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); setActivePinia(undefined); vi.useRealTimers(); vi.unstubAllGlobals(); });
test.each([
  { dictionary: zh, language: 'zh', label: '奖励' },
  { dictionary: en, language: 'en', label: 'Rewards' },
  { dictionary: vietnamese, language: 'vi', label: 'Thưởng' },
])('033 $language receipt entry retains records, rules and retry through pointer and keyboard actions', async ({ dictionary, language, label }) => {
  const card = await invitation(dictionary, snapshot(true)), copy = teamRedesignCopy(language);
  const before = JSON.stringify(card.rewards.snapshot);
  const reward = find(card.root, 'invite-card__history');
  expect(text(reward)).toBe(label); expect(reward.props['aria-label']).toBe(label);
  expect(reward.props.role).toBe('button'); expect(Number(reward.props.tabindex)).toBe(0);
  const icon = reward.children.find(child => child.tag === 'svg')!;
  expect(icon.props).toMatchObject({ width: '18', height: '18', 'aria-hidden': 'true' });
  expect(icon.children.filter(child => child.tag === 'path')).toHaveLength(2);

  for (const activation of ['click', 'Enter', ' ']) {
    for (const [entry, title] of [['invite-card__history', copy.rewardRecords], ['invite-card__rules', copy.inviteRules]]) {
      const target = find(card.root, entry);
      if (activation === 'click') target.props.onClick();
      else [target.props.onKeydown].flat().forEach(handler => handler({ key: activation, preventDefault: vi.fn() }));
      await Vue.nextTick();
      expect(find(card.root, 'invite-detail').props['aria-label']).toBe(title);
      find(card.root, 'invite-detail__close').props.onClick(); await Vue.nextTick();
      expect(find(card.root, 'invite-detail')).toBeUndefined();
    }
  }
  expect(card.rewards.refresh).not.toHaveBeenCalled();
  card.rewards.error = 'read failed'; await Vue.nextTick();
  const retry = find(card.root, 'invite-card__retry');
  expect(retry.props['aria-label']).toBe(dictionary.network.retry);
  expect(text(retry)).not.toContain(label);
  retry.props.onClick();
  for (const key of ['Enter', ' ']) [retry.props.onKeydown].flat().forEach(handler => handler({ key, preventDefault: vi.fn() }));
  expect(card.rewards.refresh).toHaveBeenCalledTimes(3);
  find(card.root, 'invite-card__rules').props.onClick(); await Vue.nextTick();
  expect(find(card.root, 'invite-detail').props['aria-label']).toBe(copy.inviteRules);
  expect(JSON.stringify(card.rewards.snapshot)).toBe(before);
});

test('033 localized header fits 320/360/390 with 44px controls in both themes and retry state', async () => {
  vi.useRealTimers();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const tokens = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8').replace(/@import[^;]+;/g, '');
  const css = parse(inviteSource).descriptor.styles.map(style => style.content).join('\n');
  const fonts = readFileSync(new URL('../../styles/fonts.css', import.meta.url), 'utf8').replace(/url\("\.\.\/static\/fonts\/([^"/]+)"\)/g, (_match: string, name: string) => `url(data:font/${name.endsWith('.ttf') ? 'ttf' : 'woff2'};base64,${readFileSync(new URL(`../../static/fonts/${name}`, import.meta.url)).toString('base64')})`);
  const renderHost = (host: Host): Vue.VNode => host.tag === '#text' ? Vue.createTextVNode(host.text)
    : host.tag === '#comment' ? Vue.createCommentVNode('') : Vue.h(host.tag, host.props, [host.text, ...host.children.map(renderHost)]);
  const measurements: unknown[] = [];
  try {
    for (const [language, dictionary] of [['zh', zh], ['en', en], ['vi', vietnamese]] as const) {
      const card = await invitation(dictionary, snapshot(true));
      for (const retry of [false, true]) {
        card.rewards.error = retry ? 'read failed' : ''; await Vue.nextTick();
        const html = await renderToString(Vue.createSSRApp({ render: () => renderHost(find(card.root, 'invite-card__header')) }));
        for (const width of [320, 360, 390]) for (const theme of ['light', 'dark']) {
          await page.setViewportSize({ width, height: 180 });
          await page.setContent(`<html data-theme="${theme}" lang="${language}"><style>${tokens}\n${fonts}\n${css}
            * { box-sizing: border-box; } body { margin: 0; padding: 16px; background: var(--v5-bg); font-family: var(--font-v5); } view { display: block; }
          </style><body><div class="invite-card">${html}</div></body></html>`);
          await page.evaluate(async () => { await document.fonts.ready; });
          const geometry = await page.evaluate(() => {
            const box = (selector: string) => {
              const el = document.querySelector<HTMLElement>(selector)!, rect = el.getBoundingClientRect();
              return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height,
                overflow: el.scrollWidth > el.clientWidth + 1 };
            };
            return { title: box('.invite-card__title'), actions: box('.invite-card__header-actions'),
              reward: box('.invite-card__history'), rules: box('.invite-card__rules'), icon: box('.invite-card__history svg'),
              header: box('.invite-card__header'), pageOverflow: document.documentElement.scrollWidth > innerWidth,
              titleFont: getComputedStyle(document.querySelector('.invite-card__title')!).fontFamily,
              columnGap: getComputedStyle(document.querySelector('.invite-card__header')!).columnGap };
          });
          const { title, actions, reward, rules, icon, header } = geometry;
          // P-42 puts the record/rules pills above the title; they only must not overlap it.
          expect(title.right <= actions.x + 1 || title.bottom <= actions.y + 1 || actions.bottom <= title.y + 1).toBe(true);
          expect(reward.right).toBeLessThanOrEqual(rules.x);
          for (const control of [reward, rules]) {
            expect(control.width).toBeGreaterThanOrEqual(44); expect(control.height).toBeGreaterThanOrEqual(44);
            expect(control.right).toBeLessThanOrEqual(header.right + 1); expect(control.bottom).toBeLessThanOrEqual(header.bottom + 1);
            expect(control.overflow).toBe(false);
          }
          expect(icon.width).toBe(18); expect(icon.height).toBe(18);
          expect(geometry.titleFont).toContain('Inter'); expect(geometry.columnGap).toBe('12px');
          expect(title.overflow).toBe(false); expect(geometry.pageOverflow).toBe(false);
          measurements.push({ language, width, theme, retry, ...geometry });
          if (env.UI_OPT_033_EVIDENCE_DIR && width === 320 && !retry) await page.screenshot({ path: `${env.UI_OPT_033_EVIDENCE_DIR}/invite-reward-033-header-${language}-${theme}-320.png` });
        }
      }
    }
    expect(measurements).toHaveLength(36);
    if (env.UI_OPT_033_EVIDENCE_DIR) writeFileSync(`${env.UI_OPT_033_EVIDENCE_DIR}/invite-reward-033-layout.json`, JSON.stringify(measurements, null, 2));
  } finally { await browser.close(); }
}, 30000);

test.each([en, zh, vietnamese])('shared hiding masks personal reward records but retains the public reward and dates', async copy => {
  const card = await invitation(copy), visibility = useDataVisibility();
  card.rewards.snapshot = { ...snapshot(true), inviterRewardNex: 10, lifetimeInviterNex: 876.54, invitedCount: 55, settledCount: 34, pendingCount: 21,
    recentRewards: [{ settlementNo: 'private-row', amountNex: 123.45, balanceAfter: 876.54,
      ledgerStatus: 'SUCCESS', releaseBucket: 'withdrawable', sourceEnvironment: 'PRODUCTION', settledAt: '2026-10-19T12:00:00Z' }] };
  await Vue.nextTick();
  find(card.root, 'invite-card__history').props.onClick(); await Vue.nextTick();
  const dateBefore = text(find(card.root, 'invite-detail__record').children[0]);
  expect(text(find(card.root, 'invite-detail__total'))).toContain('876.54');
  visibility.toggle(); await Vue.nextTick();
  expect(text(find(card.root, 'invite-card__amount'))).toBe('10');
  expect(text(find(card.root, 'invite-detail__total'))).toContain('•••• UVT');
  expect(text(find(card.root, 'invite-detail__counts'))).not.toMatch(/34|21/);
  expect(text(find(card.root, 'invite-detail__record'))).not.toContain('123.45');
  expect(text(find(card.root, 'invite-detail__record').children[0])).toBe(dateBefore);
  expect(accessibleText(find(card.root, 'invite-detail'))).not.toMatch(/876\.54|123\.45/);
  expect(card.rewards.snapshot.lifetimeInviterNex).toBe(876.54);
  visibility.toggle(); await Vue.nextTick();
  expect(text(find(card.root, 'invite-detail__total'))).toContain('876.54');
  expect(text(find(card.root, 'invite-detail__record'))).toContain('+123.45');
});
test('visible invitation refreshes after a catalog revision invalidates its snapshot', async () => {
  const card=await invitation();const before=card.rewards.ensure.mock.calls.length;
  advanceRuntimeRevision();await Vue.nextTick();expect(card.rewards.ensure.mock.calls.length).toBe(before+1);
});

test("hidden invitation defers catalog refresh until it becomes visible again", async () => {
  const card = await invitation();
  const before = card.rewards.ensure.mock.calls.length;
  lifecycles.get(card.root)!.setVisible(false);
  advanceRuntimeRevision(); await Vue.nextTick();
  expect(card.rewards.ensure.mock.calls.length).toBe(before);
  lifecycles.get(card.root)!.setVisible(true); await Vue.nextTick();
  expect(card.rewards.ensure.mock.calls.length).toBe(before + 1);
});

test.each([en, zh, vietnamese])("disabled invitation rewards keep sharing without reward or cooldown promises", async copy => {
  const card = await invitation(copy);
  expect(card.rewards.ensure).toHaveBeenCalledOnce();
  const status = text(find(card.root, "invite-card__reward"));
  expect(status).toContain(copy.team.referralRewardsDisabled);
  expect(status).toContain(copy.team.sharingStillAvailable);
  find(card.root, "invite-card__history").props.onClick(); await Vue.nextTick();
  expect(text(find(card.root, "invite-detail__total"))).toContain("7.00 UVT");
  expect(text(find(card.root, "invite-detail__counts"))).toContain(teamRedesignCopy(useLocaleStore().code).settled + " 1");
  expect(status).not.toContain('serverRewardPerSettlement');
  expect(status).not.toContain(copy.team.perFriendCooldown);
  expect(status).not.toContain("0.00 UVT");
  expect(text(find(card.root, "nx-team-share-now"))).toBe(teamRedesignCopy(useLocaleStore().code).inviteFriends);
  expect(text(find(card.root, "invite-card__header"))).not.toContain(copy.team.earnForEachFriend);
  expect(find(card.root, "invite-card__rules").props.role).toBe("button");
  expect(all(card.root).some(target => target.props.role === "link")).toBe(false);
  for (const name of ["nx-team-share-poster", "nx-team-copy-code", "nx-team-copy-link", "nx-team-share-now"]) {
    expect(find(card.root, name).props["aria-disabled"]).not.toBe(true);
  }
  await find(card.root, "nx-team-copy-code").props.onClick();
  await find(card.root, "nx-team-copy-link").props.onClick();
  expect(card.copyText.mock.calls).toEqual([["INVITE123"], ["https://invite.example/?ref=INVITE123"]]);
  expect(card.recordShareEvent).not.toHaveBeenCalled();
});

test("the same invitation card follows server enablement, unavailable reads and the retry action", async () => {
  const card = await invitation();
  card.rewards.snapshot = snapshot(true); await Vue.nextTick();
  let status = text(find(card.root, "invite-card__reward"));
  expect(status).toContain("12UVT");
  expect(status).not.toContain(en.team.perFriendCooldown);
  expect(status).toContain(teamRedesignCopy("en").qualifiedFriendReward);
  card.rewards.error = "read failed"; await Vue.nextTick();
  status = text(find(card.root, "invite-card__reward"));
  expect(text(find(card.root, "invite-card__amount"))).toBe("—");
  expect(status).not.toContain("12UVT");
  const retry = find(card.root, "invite-card__retry");
  expect(retry.props.role).toBe("button");
  card.rewards.refresh.mockClear();
  let resolveRead!: () => void;
  const pendingRead = new Promise<void>(resolve => { resolveRead = resolve; });
  card.rewards.refresh.mockImplementationOnce(async () => {
    card.rewards.loading = true;
    await pendingRead;
    card.rewards.snapshot = snapshot(true);
    card.rewards.error = "";
    card.rewards.loading = false;
    return true;
  });
  const refresh = retry.props.onClick(); await Vue.nextTick();
  expect(card.rewards.refresh).toHaveBeenCalledOnce();
  expect(find(card.root, "invite-card__reward").props["aria-busy"]).toBe(true);
  expect(text(find(card.root, "invite-card__amount"))).toBe("—");
  resolveRead(); await refresh; await Vue.nextTick();
  expect(find(card.root, "invite-card__retry")).toBeUndefined();
  expect(text(find(card.root, "invite-card__reward"))).toContain("12UVT");
  expect(text(find(card.root, "invite-card__reward"))).not.toContain(en.team.perFriendCooldown);
  card.rewards.error = ""; card.rewards.snapshot = null; card.rewards.loading = true; await Vue.nextTick();
  expect(find(card.root, "invite-card__reward").props["aria-busy"]).toBe(true);
  expect(text(find(card.root, "invite-card__amount"))).toBe('12');
  expect(find(card.root, "nx-team-share-now").props["aria-disabled"]).toBe(true);
  expect(find(card.root, "nx-team-share-now").props.tabindex).toBe(-1);
  expect(accessibleText(find(card.root, 'invite-card__descriptions'))).toBe(teamRedesignCopy('en').qualifiedFriendReward);
  expect(find(card.root, "invite-card__retry")).toBeUndefined();
  card.rewards.loading = false; card.rewards.error = 'unavailable'; await Vue.nextTick();
  card.rewards.refresh.mockImplementationOnce(async () => {
    card.rewards.snapshot = snapshot(true); card.rewards.error = ''; return true;
  });
  await find(card.root, "invite-card__retry").props.onClick(); await Vue.nextTick();
  expect(find(card.root, "nx-team-share-now").props["aria-disabled"]).not.toBe(true);
  expect(find(card.root, "nx-team-share-now").props.tabindex).toBe(0);
  expect(accessibleText(find(card.root, 'invite-card__descriptions'))).toBe(teamRedesignCopy('en').qualifiedFriendReward);
});

test.each([en, zh, vietnamese])("H5 share emphasis only names a reward after a successful enabled server read", async copy => {
  const card = await invitation(copy);
  card.rewards.snapshot = snapshot(true); await Vue.nextTick();
  expect(text(find(card.root, "nx-team-share-now"))).toBe(teamRedesignCopy(useLocaleStore().code).inviteFriends);
  expect(text(find(card.root, "invite-card__reward"))).toContain(teamRedesignCopy(useLocaleStore().code).qualifiedFriendReward);
  card.rewards.loading = true; await Vue.nextTick();
  expect(text(find(card.root, "invite-card__amount"))).toBe("12");
  expect(text(find(card.root, "nx-team-share-now"))).toBe(teamRedesignCopy(useLocaleStore().code).inviteFriends);
  expect(text(find(card.root, "nx-team-share-now"))).not.toContain("12UVT");
  expect(accessibleText(find(card.root, "invite-card__descriptions"))).toBe(teamRedesignCopy(useLocaleStore().code).qualifiedFriendReward);
  expect(text(card.root)).not.toContain("+7.00 UVT");
  expect(text(card.root)).not.toContain(copy.team.perFriendCooldown);
  card.rewards.loading = false; card.rewards.error = "unavailable"; await Vue.nextTick();
  expect(text(find(card.root, "nx-team-share-now"))).toBe(teamRedesignCopy(useLocaleStore().code).inviteFriends);
  expect(accessibleText(find(card.root, "invite-card__descriptions"))).toBe(copy.team.settlementUnavailable);
  expect(find(card.root, "invite-card__retry").props['aria-label']).toBe(copy.network.retry);
  expect(text(card.root)).not.toContain("12UVT");
});

test("a cold invitation read never invents an amount or enables share actions", async () => {
  const card = await invitation(en, null);
  card.rewards.snapshot = null; card.rewards.loading = true; await Vue.nextTick();
  expect(text(find(card.root, 'invite-card__amount'))).toBe('—');
  expect(find(card.root, 'nx-team-share-now').props['aria-disabled']).toBe(true);
  expect(accessibleText(find(card.root, 'invite-card__descriptions'))).toBe(teamRedesignCopy('en').qualifiedFriendReward);
});

test.each([en, zh, vietnamese])("invitation amounts remain accurate without Native Intl or locale number formatting", async copy => {
  vi.stubGlobal("Intl", undefined);
  const nativeLocale = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(() => { throw new Error("NATIVE_LOCALE_UNAVAILABLE"); });
  try {
    const card = await invitation(copy);
    card.rewards.snapshot = snapshot(true); await Vue.nextTick();
    expect(text(find(card.root, "nx-team-share-now"))).toBe(teamRedesignCopy(useLocaleStore().code).inviteFriends);
    expect(text(find(card.root, "invite-card__amount"))).toBe("12");
    card.rewards.snapshot!.inviterRewardNex = 12.34; await Vue.nextTick();
    expect(text(find(card.root, "invite-card__amount"))).toBe("12.34");
    find(card.root, "invite-card__history").props.onClick(); await Vue.nextTick();
    expect(text(find(card.root, "invite-detail__total"))).toContain("7.00 UVT");
  } finally {
    nativeLocale.mockRestore();
    vi.unstubAllGlobals();
  }
});

test("sharing tools retain clipboard failure feedback and never copy or export an empty code", async () => {
  const card = await invitation();
  card.copyText.mockResolvedValue(false);
  await find(card.root, "nx-team-copy-code").props.onClick();
  await find(card.root, "nx-team-copy-link").props.onClick();
  await Vue.nextTick();
  expect(card.toast.info.mock.calls).toEqual([[en.share.copyFailed], [en.share.copyFailed]]);
  expect(card.toast.success).not.toHaveBeenCalled();
  expect(text(find(card.root, "nx-team-copy-code"))).not.toContain(en.team.copied);
  expect(text(find(card.root, "nx-team-copy-link"))).not.toContain(en.team.copied);
  expect(card.recordShareEvent).not.toHaveBeenCalled();
  const oldTools = ["nx-team-share-poster", "nx-team-copy-code", "nx-team-copy-link", "nx-team-share-now"].map(name=>find(card.root,name));
  card.rewards.snapshot!.referralCode = ""; await Vue.nextTick();
  card.copyText.mockClear(); card.toast.info.mockClear();
  expect(find(card.root,"nx-invite-actions")).toBeDefined();
  expect(accessibleText(find(card.root, 'invite-card__descriptions'))).toBe(en.share.linkUnavailable);
  for (const tool of oldTools) {
    expect(tool.props['aria-disabled']).toBe(true);
    expect(tool.props.tabindex).toBe(-1);
  }
  for (const tool of oldTools) {
    // Retained callbacks cannot copy/export missing data or open a share sheet.
    await tool.props.onClick();
  }
  expect(card.copyText).not.toHaveBeenCalled();
  expect(card.toast.info.mock.calls).toEqual(oldTools.map(() => [en.share.noCodeYet]));
  expect(card.notifyUnavailableShareLink).not.toHaveBeenCalled();
  expect(all(card.root).filter(node => node.props.open === true)).toHaveLength(0);
  expect(card.recordShareEvent).not.toHaveBeenCalled();
});

test.each([en, zh, vietnamese])('initial invitation keeps its content slots and isolates loading, failure and ready messages', async copy => {
  const card = await invitation(copy, null);
  const language = copy === zh ? 'zh' : copy === vietnamese ? 'vi' : 'en';
  const classes = ['nx-invite-body', 'invite-card__reward', 'invite-card__art', 'nx-invite-actions',
    'nx-team-share-now', 'nx-team-copy-code', 'nx-team-copy-link', 'nx-team-share-poster'];
  const nodes = classes.map(name => find(card.root, name));
  card.rewards.snapshot = null; card.rewards.loading = true; await Vue.nextTick();
  classes.forEach((name, i) => expect(find(card.root, name)).toBe(nodes[i]));
  for (const node of nodes.slice(4)) {
    expect(node.props['aria-disabled']).toBe(true); expect(node.props.tabindex).toBe(-1);
  }
  expect(text(find(card.root, 'invite-card__amount'))).toBe('—');
  expect(accessibleText(find(card.root, 'invite-card__descriptions'))).toBe(teamRedesignCopy(language).qualifiedFriendReward);
  card.rewards.loading = false; card.rewards.error = 'failed'; await Vue.nextTick();
  expect(accessibleText(find(card.root, 'invite-card__descriptions'))).toBe(copy.team.settlementUnavailable);
  expect(Number(find(card.root, 'invite-card__retry').props.tabindex)).toBe(0);
  card.rewards.snapshot = snapshot(true); card.rewards.error = ''; await Vue.nextTick();
  classes.forEach((name, i) => expect(find(card.root, name)).toBe(nodes[i]));
  for (const node of nodes.slice(4)) {
    expect(node.props['aria-disabled']).toBe(false); expect(node.props.tabindex).toBe(0);
  }
  expect(text(find(card.root, 'invite-card__amount'))).toBe('12');
  expect(accessibleText(find(card.root, 'invite-card__descriptions'))).toBe(teamRedesignCopy(language).qualifiedFriendReward);
});

test.each([en, zh, vietnamese].flatMap(copy => [true, false].map(enabled => ({ copy, enabled }))))('confirmed enabled/disabled invitation refresh is silent, without retaining share permission', async ({ copy, enabled }) => {
  const card = await invitation(copy, snapshot(enabled));
  const amount = text(find(card.root, 'invite-card__amount'));
  card.rewards.snapshot = null; card.rewards.loading = true; await Vue.nextTick();
  expect(text(find(card.root, 'invite-card__amount'))).toBe(amount);
  const caption = enabled ? teamRedesignCopy(useLocaleStore().code).qualifiedFriendReward : copy.team.referralRewardsDisabled + copy.team.sharingStillAvailable;
  expect(accessibleText(find(card.root, 'invite-card__descriptions'))).toBe(caption);
  expect(find(card.root, 'invite-card__reward').props['aria-busy']).toBe(true);
  expect(find(card.root, 'nx-team-share-now').props['aria-disabled']).toBe(true);
  find(card.root, 'nx-team-share-now').props.onClick(); expect(card.copyText).not.toHaveBeenCalled();
  card.rewards.loading = false; card.rewards.error = 'offline'; await Vue.nextTick();
  expect(accessibleText(find(card.root, 'invite-card__descriptions'))).toBe(copy.team.settlementUnavailable);
  expect(find(card.root, 'invite-card__retry')).toBeDefined();
  card.rewards.error = ''; card.rewards.loading = true; await Vue.nextTick();
  expect(accessibleText(find(card.root, 'invite-card__descriptions'))).toBe(caption);
});

test.each(['account', 'binding', 'catalog', 'environment'])('old disabled caption is discarded on %s while static unknown copy and action guards remain', async boundary => {
  const card = await invitation(en, snapshot(false));
  card.rewards.snapshot = null; card.rewards.loading = true;
  if (boundary === 'account') card.pageApp.accountKey = 'user:next';
  if (boundary === 'binding') card.pageApp.accountBindingEpoch++;
  if (boundary === 'catalog') card.catalog.serverCanonical = false;
  if (boundary === 'environment') card.runtime.environment = 'prod';
  await Vue.nextTick();
  expect(accessibleText(find(card.root, 'invite-card__descriptions'))).toBe(teamRedesignCopy('en').qualifiedFriendReward);
  for (const cls of ['nx-team-share-poster', 'nx-team-copy-code', 'nx-team-copy-link', 'nx-team-share-now']) {
    const button = find(card.root, cls);
    expect(button.props['aria-disabled']).toBe(true); expect(button.props.tabindex).toBe(-1);
    button.props.onClick();
  }
  expect(card.copyText).not.toHaveBeenCalled(); expect(card.recordShareEvent).not.toHaveBeenCalled();
  expect(all(card.root).filter(n => n.props.open === true)).toHaveLength(0);
});

async function wallet(copy = en, initialBalance = 11, confirmed = true) {
  useLocaleStore().setLocale(copy === zh ? "zh" : copy === vietnamese ? "vi" : "en");
  const market = Vue.reactive({ isMockMode: false, remoteReady: true, nexPriceUSDT: 0.124,
    change24hAvailable: false, change24hPct: 0 });
  const bills = Vue.reactive({ summaryStatus: "ready", summary: { monthBillCount: 0 } as { monthBillCount: number } | null });
  const navTo = vi.fn();
  const navReset = vi.fn();
  const app = Vue.reactive({ user: { usdtBalance: initialBalance, nexBalance: 124,
    earningBuckets: { pendingReviewUsdt: 0, bonusLockedUsdt: 0 } }, activeSlotCount: 0, slotCap: 0,
    visibleDevices: [],
    remoteFleetHasSnapshot: confirmed, remoteFleetStatus: confirmed ? "ready" : "idle",
    remoteWalletReceiptHasSnapshot: false });
  const trial = Vue.reactive({ authorityStatus: confirmed ? "ready" : "unknown",
    authorityServerState: confirmed ? "ELIGIBLE" as string | null : null });
  const release = {
    earningsReleaseHasSnapshot: Vue.ref(confirmed),
    earningsReleaseStatus: Vue.ref(confirmed ? "ready" : "idle"),
    earningsReleaseSnapshot: Vue.ref<{ serverCanonical: boolean; buckets: { pending_review: number; bonus_locked: number } } | null>(
      confirmed ? { serverCanonical: true, buckets: { pending_review: 0, bonus_locked: 0 } } : null),
  };
  const root = await mount(walletSource, {
    "@/i18n/use-t": { useT: () => Vue.ref(copy) }, "@/lib/display-date": displayDate, "@/i18n/format": { fmt, fmtMoney, openSlotsTemplate },
    "@/i18n/audit-ui": { useAuditUiCopy },
    "@/store/app": { useApp: () => app },
    "@/store/earning-release": release,
    "@/lib/remote-authority-display": { remoteAuthorityStatus },
    "@/store/bills": { useBills: () => bills },
    "@/store/market": { useMarket: () => market }, "@/api/runtime": { fundsServerEnabled: true, remoteApiEnabled: true },
    "@/store/free-trial": { trialReservesSlotNow: () => false, useFreeTrial: () => trial },
    "@/store/slot-action-sheet": { useSlotActionSheet: () => ({}) },
    "@/lib/route": { navTo, navReset },
  });
  return { root, app, market, bills, trial, release, navTo, navReset };
}

const balanceDisplays = [
  [92.18022, "92.18"],
  [0, "0.00"],
  [11, "11.00"],
  [0.045005, "0.05"],
  [0.000001, "0.00"],
  [999.995001, "1,000.00"],
  [1234567.123456, "1,234,567.12"],
  [1.005, "1.01"],
  [2.675, "2.68"],
  [0.145, "0.15"],
  [999.995, "1,000.00"],
] as const;

async function checkWalletBalance(copy: typeof en) {
  const card = await wallet(copy, 92.18022);
  for (const [balance, expected] of balanceDisplays) {
    card.app.user.usdtBalance = balance; await Vue.nextTick();
    expect(text(find(card.root, "nx-wallet-amount"))).toBe(expected);
    expect(find(card.root, "nx-wallet-total").props["aria-label"]).toBe(`${copy.me.usdtBalance}: $${expected}`);
    expect(card.app.user.usdtBalance).toBe(balance); // Display rounding must not change the source balance.
  }
  card.app.user = { usdtBalance: 0, nexBalance: 0,
    earningBuckets: { pendingReviewUsdt: 0, bonusLockedUsdt: 0 } };
  await Vue.nextTick();
  expect(text(find(card.root, "nx-wallet-amount"))).toBe("0.00");
  expect(find(card.root, "nx-wallet-total").props["aria-label"]).toBe(`${copy.me.usdtBalance}: $0.00`);
}

test.each([en, zh, vietnamese])("wallet balance uses decimal rounding and two decimals", async copy => {
  await checkWalletBalance(copy);
});

test.each([en, zh, vietnamese])("wallet monthly bills interpolate the count and keep unavailable reads distinct from zero", async copy => {
  const { root, app, bills, navTo } = await wallet(copy);
  const assertCount = (count: number | string) => {
    const link = find(root, "nx-wallet-bills");
    expect(link.props.role).toBe("link");
    expect(link.props.tabindex).toBe("0");
    expect(text(link)).toBe(`${fmt(copy.me.billsThisMonth, { n: count })} ›`);
    expect(text(link)).not.toContain("{n}");
  };
  assertCount(0);
  bills.summary = { monthBillCount: 7 };
  await Vue.nextTick(); assertCount(7);
  for (const status of ["idle", "loading", "error"]) {
    bills.summaryStatus = status;
    await Vue.nextTick(); assertCount("--");
    expect(text(find(root, "nx-wallet-amount"))).toBe("11.00");
    expect(text(find(root, "nx-wallet-nex"))).toBe("124.00 UVT");
  }
  bills.summaryStatus = "ready"; bills.summary = null;
  await Vue.nextTick(); assertCount("--");
  bills.summary = { monthBillCount: 19 };
  app.remoteFleetHasSnapshot = false; app.remoteFleetStatus = "error";
  await Vue.nextTick(); assertCount(19);
  expect(text(find(root, "nx-wallet-amount"))).toBe("—");
  expect(text(find(root, "nx-wallet-nex"))).toBe("— UVT");
  find(root, "nx-wallet-bills").props.onClick();
  expect(navTo).toHaveBeenCalledExactlyOnceWith("/pages/me/wallet-bills");
  bills.summaryStatus = "idle"; bills.summary = null;
  await Vue.nextTick(); assertCount("--");
});

test.each([en, zh, vietnamese])("wallet fixtures keep unknown reads separate from confirmed zero and refresh snapshots", async copy => {
  const { root, app, trial, release } = await wallet(copy, 0, false);
  app.user.nexBalance = 0; app.slotCap = 6;
  await Vue.nextTick();
  const auditCopy = auditUiCopy[copy === zh ? "zh" : copy === vietnamese ? "vi" : "en"];
  const pending = (review: string, locked: string) => `${auditCopy.confirming} ${review} · ${auditCopy.locked} ${locked}`;
  const assertPending = (expected: string) => {
    const line = find(root, "nx-wallet-pending");
    expect(line).toBeDefined();
    expect(text(line)).toBe(expected);
  };
  const assertUnknown = () => {
    expect(text(find(root, "nx-wallet-amount"))).toBe("—");
    expect(text(find(root, "nx-wallet-nex"))).toBe("— UVT");
    assertPending(pending("--", "--"));
    expect(find(root, "nx-wallet-slot-block")).toBeUndefined();
  };
  assertUnknown();
  app.remoteFleetStatus = "error";
  await Vue.nextTick(); assertUnknown();

  app.remoteWalletReceiptHasSnapshot = true;
  await Vue.nextTick();
  expect(text(find(root, "nx-wallet-amount"))).toBe("0.00");
  expect(text(find(root, "nx-wallet-nex"))).toBe("— UVT");
  assertPending(pending("--", "--"));
  expect(find(root, "nx-wallet-slot-block")).toBeUndefined();

  app.remoteFleetHasSnapshot = true; app.remoteFleetStatus = "ready";
  await Vue.nextTick();
  expect(text(find(root, "nx-wallet-nex"))).toBe("0.00 UVT");
  expect(find(root, "nx-wallet-slot-block")).toBeUndefined();
  for (const status of ["idle", "loading", "error"]) {
    release.earningsReleaseStatus.value = status;
    await Vue.nextTick();
    assertPending(pending("--", "--"));
  }
  trial.authorityStatus = "ready"; trial.authorityServerState = "ELIGIBLE";
  release.earningsReleaseHasSnapshot.value = true;
  release.earningsReleaseSnapshot.value = { serverCanonical: true, buckets: { pending_review: 0, bonus_locked: 0 } };
  release.earningsReleaseStatus.value = "ready";
  await Vue.nextTick();
  expect(find(root, "nx-wallet-pending")).toBeUndefined(); // Confirmed zero buckets are hidden.
  expect(find(root, "nx-wallet-slot-block")).toBeDefined();
  app.remoteFleetStatus = "loading"; trial.authorityStatus = "loading";
  release.earningsReleaseStatus.value = "loading";
  await Vue.nextTick();
  expect(text(find(root, "nx-wallet-amount"))).toBe("0.00");
  expect(find(root, "nx-wallet-pending")).toBeUndefined();
  expect(find(root, "nx-wallet-slot-block")).toBeDefined();

  // Canonical buckets remain visible during refresh; local leftovers cannot override them.
  app.user.earningBuckets = { pendingReviewUsdt: 999, bonusLockedUsdt: 888 };
  release.earningsReleaseSnapshot.value = { serverCanonical: true, buckets: { pending_review: 1.005, bonus_locked: 2.675 } };
  await Vue.nextTick();
  assertPending(pending("$1.01", "$2.68"));
  expect(text(find(root, "nx-wallet-amount"))).toBe("0.00"); // Held buckets are outside the available balance.
  release.earningsReleaseSnapshot.value.buckets.pending_review = 0;
  await Vue.nextTick();
  assertPending(`${auditCopy.locked} $2.68`);
  release.earningsReleaseSnapshot.value.buckets = { pending_review: 0.005, bonus_locked: 0 };
  await Vue.nextTick();
  assertPending(`${auditCopy.confirming} <$0.01`);

  release.earningsReleaseStatus.value = "error";
  await Vue.nextTick();
  assertPending(pending("--", "--"));
  release.earningsReleaseStatus.value = "ready";
  release.earningsReleaseSnapshot.value.serverCanonical = false;
  await Vue.nextTick();
  assertPending(pending("--", "--"));
  release.earningsReleaseSnapshot.value.serverCanonical = true;
  await Vue.nextTick();
  assertPending(`${auditCopy.confirming} <$0.01`);

  app.remoteFleetHasSnapshot = false; app.remoteWalletReceiptHasSnapshot = false;
  trial.authorityStatus = "unknown"; trial.authorityServerState = null;
  release.earningsReleaseHasSnapshot.value = false; release.earningsReleaseSnapshot.value = null;
  release.earningsReleaseStatus.value = "idle";
  await Vue.nextTick(); assertUnknown();
});

test.each([en, zh, vietnamese].flatMap(copy => [false, true].map(withoutIntl => ({ copy, withoutIntl }))))(
  "wallet balance survives ignored native locale options (Intl absent: $withoutIntl)", async ({ copy, withoutIntl }) => {
    const nativeNumber = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (this: number) {
      return String(this.valueOf());
    });
    if (withoutIntl) vi.stubGlobal("Intl", undefined);
    try {
      await checkWalletBalance(copy);
    } finally {
      nativeNumber.mockRestore(); vi.unstubAllGlobals();
    }
  },
);

test("wallet keeps its details inside the card", async () => {
  const { root } = await wallet();
  const summary = find(root, "nx-wallet-summary");
  const details = find(root, "nx-wallet-details");
  expect(find(summary, "nx-wallet-details")).toBeDefined();
  expect(details.parent === summary).toBe(true);
  expect(find(details, "nx-wallet-valuation")).toBeDefined();
  expect(text(find(root, "nx-wallet-actions"))).toContain(en.me.quickActions);
});

test("wallet keeps the original lower-right arc and adds only five decorative dots", async () => {
  const { root } = await wallet();
  const summary = find(root, "nx-wallet-summary");
  expect(all(summary).filter(target => hasClass(target, "nx-wallet-arc"))).toHaveLength(1);
  expect(find(summary, "nx-wallet-arc").props["aria-hidden"]).toBe("true");
  expect(find(summary, "nx-wallet-grid")).toBeUndefined();
  expect(find(summary, "nx-wallet-aurora")).toBeUndefined();
  const particles = find(summary, "nx-wallet-particles");
  expect(particles.props["aria-hidden"]).toBe("true");
  const dots = all(particles).filter(target => hasClass(target, "nx-wallet-particle"));
  expect(dots).toHaveLength(5);
  for (const dot of dots) {
    expect(dot.props.style).toEqual(expect.objectContaining({ width: "3px", height: "3px",
      animation: "v5-dot-drift 8s linear infinite" }));
    expect(dot.props).toHaveProperty("data-wallet-particle");
    expect(dot.props).not.toHaveProperty("onClick");
  }
  const { descriptor } = parse(walletSource);
  const css = compileStyle({ source: descriptor.styles[0].content, filename: "wallet-card.vue", id: "data-v-wallet", scoped: true });
  expect(css.errors).toEqual([]);
  expect(css.code).toMatch(/\.nx-wallet-particles\[data-v-wallet\][^{]*\{[^}]*pointer-events: none;[^}]*z-index: 0;/);
  expect(css.code).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.nx-wallet-arc\[data-v-wallet\]\s*\{\s*animation: none;/);
  expect(css.code).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.nx-wallet-particle\[data-v-wallet\]\s*\{\s*animation: none !important;\s*transform: none;\s*\}\s*\.nx-wallet-particle\[data-v-wallet\]\s*\{\s*opacity: .5 !important;/);
});

test("wallet valuation names USDT for both values and preserves the remote unavailable state", async () => {
  const { root, app, market, navTo, navReset } = await wallet();
  expect(text(find(root, "nx-wallet-valuation"))).toContain("≈ 15.38 USDT · 1 UVT = 0.124 USDT");
  market.remoteReady = false; await Vue.nextTick();
  expect(text(find(root, "nx-wallet-valuation"))).toContain("≈ — USDT · 1 UVT = — USDT");
  expect(text(find(root, "nx-wallet-valuation"))).not.toContain("0.124");
  const billsLink = find(root, "nx-wallet-heading-link");
  expect(billsLink.props.role).toBe('link');
  billsLink.props.onClick();
  expect(navTo).toHaveBeenCalledExactlyOnceWith("/pages/me/wallet-bills");
  navTo.mockClear();
  find(root, "nx-wallet-nex").props.onClick();
  expect(navTo).toHaveBeenCalledExactlyOnceWith("/pages/me/wallet-nex");
  expect(find(root, "nx-wallet-slot-block")).toBeUndefined();
  app.slotCap = 1; await Vue.nextTick();
  const slot = find(root, "nx-wallet-slot-block");
  expect(slot).toBeDefined();
  expect(slot.props.style).not.toHaveProperty("gridTemplateColumns");
  find(root, "wallet-add-device").props.onClick();
  expect(navReset).toHaveBeenCalledOnce();
  expect(navReset.mock.calls[0][0].url).toBe("/pages/store/store");
  const icon = find(root, "nx-wallet-symbol");
  expect(icon.tag).toBe("view");
  expect(icon.children[0].props.stroke).toBe("currentColor");
  const { descriptor } = parse(walletSource);
  const css = compileStyle({ source: descriptor.styles[0].content, filename: "wallet-card.vue", id: "data-v-wallet", scoped: true });
  expect(css.errors).toEqual([]);
  expect(css.code).toMatch(/\.nx-wallet-symbol\[data-v-wallet\][^{]*\{[^}]*color: var\(--v5-nex\)/);
  expect(css.code).toMatch(/@media \(max-width: 350px\)\s*\{\s*\.nx-wallet-slot-block\[data-v-wallet\]\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);
});
