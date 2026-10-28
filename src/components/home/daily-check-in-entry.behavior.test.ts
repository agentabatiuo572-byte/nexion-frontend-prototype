import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import raw from './daily-check-in-row.vue?raw';
import buttonRaw from '@/components/ui/nx-button.vue?raw';
import homeRaw from '@/pages/index/index.vue?raw';
import missionsRaw from '@/pages/missions/missions.vue?raw';
import { auditUiCopy } from '@/i18n/audit-ui';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { fmt } from '@/i18n/format';
import { continuityCopy } from '@/i18n/continuity-fixes';
import { dailyCheckInSuccessCopy } from '@/pages/daily/daily-success-copy';
import * as dailyReward from '@/pages/daily/daily-reward-view';
import { installKeyboardActivation, uninstallKeyboardActivation } from '@/lib/a11y-activate';

type Host = { text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (text = ''): Host => ({ text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: () => node(), createText: node, createComment: () => node(),
  setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; n.children = []; },
  patchProp: (n, key, _old, value) => { n.props[key] = value; }, parentNode: n => n.parent,
  nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert: (n, parent, anchor) => {
    if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n);
    n.parent = parent; const at = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(at < 0 ? parent.children.length : at, 0, n);
  }, remove: n => { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); },
});
const all = (n: Host): Host[] => [n, ...n.children.flatMap(all)];
const text = (n: Host): string => n.text + n.children.map(text).join('');
const hasClass = (n: Host, name: string) => String(n.props.class ?? '').split(/\s+/).includes(name);
const stops: Array<() => void> = [];
const platformKeys: Array<(event: KeyboardEvent) => void> = [];
afterEach(() => {
  stops.splice(0).forEach(stop => stop()); uninstallKeyboardActivation(); vi.unstubAllGlobals(); platformKeys.length = 0;
});
const settle = async () => { await Promise.resolve(); await Vue.nextTick(); await Vue.nextTick(); };
function component(source: string, dependencies: Record<string, unknown>): Vue.Component {
  const code = ts.transpileModule(compileScript(parse(source).descriptor, { id: 'daily-entry', inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => ['view', 'text'].includes(tag) } } }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = { default: {} as Vue.Component };
  new Function('require', 'exports', code)((id: string) => dependencies[id], exports);
  return exports.default;
}
function mount(language: keyof typeof auditUiCopy = 'vi', state = 'ready', checked = false) {
  vi.stubGlobal('document', {
    addEventListener: (_type: string, listener: (event: KeyboardEvent) => void) => platformKeys.push(listener),
    removeEventListener: (_type: string, listener: (event: KeyboardEvent) => void) => platformKeys.splice(platformKeys.indexOf(listener), 1),
  });
  installKeyboardActivation();
  const locale = Vue.reactive({ code: language }), dictionaries = { zh, en, vi: vietnamese };
  const faucet = Vue.reactive({ remoteReadState: state, remoteHasSnapshot: true, remoteCheckedInToday: checked, signInStreak: 2,
    remoteRules: [{ key: 'baseline', value: '2' }], remoteMilestones: [], ensureRemote: vi.fn(),
    checkInRemote: vi.fn(async () => ({ ok: true, gained: 2, streak: 3 })), claimMilestoneRemote: vi.fn(), useSaverRemote: vi.fn() });
  const navTo = vi.fn(), toast = { success: vi.fn(), error: vi.fn() }, shown: Array<() => void> = [], hidden: Array<() => void> = [];
  const button = component(buttonRaw, { vue: Vue, '@/components/liquid-glass.vue': { default: { render: () => null } } });
  const root = node(), app = renderer.createApp(component(raw, {
    vue: Vue, '@/composables/use-tab-page-lifecycle': { onShow: (fn: () => void) => shown.push(fn), onHide: (fn: () => void) => hidden.push(fn) },
    '@/store/nex-faucet': { useNexFaucet: () => faucet }, '@/store/app': { useApp: () => ({ accountKey: 'daily-entry-owner', accountBindingEpoch: 1 }) },
    '@/api/runtime': { remoteApiEnabled: true }, '@/lib/route': { navTo }, '@/i18n/format': { fmt },
    '@/i18n/audit-ui': { useAuditUiCopy: () => Vue.computed(() => auditUiCopy[locale.code]) },
    '@/i18n/use-t': { useT: () => Vue.computed(() => dictionaries[locale.code]) }, '@/store/locale': { useLocaleStore: () => locale },
    '@/i18n/continuity-fixes': { continuityCopy }, '@/store/ui': { toast },
    '@/pages/daily/daily-success-copy': { dailyCheckInSuccessCopy }, '@/pages/daily/daily-reward-view': dailyReward,
    '@/components/ui/nx-button.vue': { default: button },
  }));
  app.mount(root); stops.push(() => app.unmount());
  const link = () => all(root).find(n => hasClass(n, 'daily-check-in-row__copy'))!;
  const action = () => all(root).find(n => hasClass(n, 'daily-check-in-row__action'))!;
  return { root, faucet, navTo, toast, locale, link, action, hide: () => hidden.forEach(fn => fn()), show: () => shown.forEach(fn => fn()) };
}
function click(n: Host) {
  const event = { repeat: false, stopPropagation() {}, preventDefault() {} };
  for (let current: Host | null = n; current; current = current.parent) {
    const handlers = current.props.onClick;
    (Array.isArray(handlers) ? handlers : handlers ? [handlers] : []).forEach(fn => fn(event));
  }
}
function noWrite(s: ReturnType<typeof mount>) {
  expect(s.faucet.checkInRemote).not.toHaveBeenCalled(); expect(s.faucet.claimMilestoneRemote).not.toHaveBeenCalled(); expect(s.faucet.useSaverRemote).not.toHaveBeenCalled();
}
function keydown(n: Host, key: string, options: Partial<KeyboardEvent> = {}) {
  const event = { key, repeat: false, altKey: false, ctrlKey: false, metaKey: false, ...options, defaultPrevented: false,
    target: { tagName: 'UNI-VIEW', isContentEditable: false, getAttribute: (name: string) => n.props[name] == null ? null : String(n.props[name]), click: () => click(n) },
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  };
  const handlers = n.props.onKeydown;
  (Array.isArray(handlers) ? handlers : handlers ? [handlers] : []).forEach(fn => fn(event));
  platformKeys.forEach(fn => fn(event as unknown as KeyboardEvent));
  return event;
}

it.each(['ready', 'idle', 'loading', 'error'])('fixed copy link reads daily while %s without a business write', async state => {
  const s = mount('vi', state); await settle(); const before = text(s.root);
  expect(s.link().props.role).toBe('link'); expect(s.link().props.tabindex).toBe('0');
  click(s.link().children.find(n => hasClass(n, 'daily-check-in-row__title'))!);
  expect(s.navTo).toHaveBeenCalledExactlyOnceWith('/pages/daily/daily'); noWrite(s); expect(text(s.root)).toBe(before);
  expect(all(s.root).find(n => hasClass(n, 'daily-check-in-row'))!.props.onClick).toBeUndefined();
});
it.each(['zh', 'en', 'vi'] as const)('copy link uses existing %s label and actual shared keyboard link semantics', async language => {
  const s = mount(language); await settle(); expect(s.link().props['aria-label']).toBe(auditUiCopy[language].viewDaily);
  expect(s.link().props.onKeydown).toBeUndefined();
  expect(keydown(s.link(), 'Enter').defaultPrevented).toBe(true);
  expect(s.navTo).toHaveBeenCalledExactlyOnceWith('/pages/daily/daily'); s.navTo.mockClear();
  expect(keydown(s.link(), ' ').defaultPrevented).toBe(false);
  for (const options of [{ repeat: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
    expect(keydown(s.link(), 'Enter', options).defaultPrevented).toBe(false);
  }
  expect(s.navTo).not.toHaveBeenCalled(); noWrite(s);
});
it('actual NxButton Enter prevents shared-layer double activation of the original CTA', async () => {
  const s = mount(); await settle(); let finish!: (value: any) => void;
  s.faucet.checkInRemote.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  expect(keydown(s.action(), 'Enter').defaultPrevented).toBe(true); await settle();
  expect(s.faucet.checkInRemote).toHaveBeenCalledOnce(); expect(s.navTo).not.toHaveBeenCalled();
  keydown(s.action(), ' '); await settle(); expect(s.faucet.checkInRemote).toHaveBeenCalledOnce();
  s.hide(); finish({ ok: true, gained: 2, streak: 3 }); await settle();
});
it('copy remains read-only after checked and locale changes, with no conditional label or content row', async () => {
  const s = mount(); await settle(); s.faucet.remoteCheckedInToday = true; s.locale.code = 'en'; await settle();
  expect(s.link().props['aria-label']).toBe(auditUiCopy.en.viewDaily); click(s.link());
  expect(s.navTo).toHaveBeenCalledOnce(); noWrite(s);
});
it('actual NxButton CTA writes once while sibling copy link remains read-only during the pending command', async () => {
  const s = mount(); let finish!: (value: any) => void;
  s.faucet.checkInRemote.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  click(s.action()); click(s.action()); await settle();
  expect(s.faucet.checkInRemote).toHaveBeenCalledOnce(); expect(s.navTo).not.toHaveBeenCalled();
  click(s.link()); expect(s.navTo).toHaveBeenCalledExactlyOnceWith('/pages/daily/daily'); expect(s.faucet.checkInRemote).toHaveBeenCalledOnce();
  s.hide(); finish({ ok: true, gained: 2, streak: 3 }); await settle(); expect(s.toast.success).not.toHaveBeenCalled();
});
it.each(['checked', 'loading', 'error'])('actual CTA keeps original %s read-navigation gate', async condition => {
  const s = mount('vi', condition === 'checked' ? 'ready' : condition, condition === 'checked'); await settle();
  click(s.action()); expect(s.navTo).toHaveBeenCalledExactlyOnceWith('/pages/daily/daily'); noWrite(s);
});
it('hidden old callbacks cannot navigate or write, and show restores the fixed link', async () => {
  const s = mount(); await settle(); s.hide(); click(s.link()); click(s.action());
  expect(s.navTo).not.toHaveBeenCalled(); noWrite(s); s.show(); click(s.link()); expect(s.navTo).toHaveBeenCalledOnce(); noWrite(s);
});
it('Home and Missions both host the same fixed row', () => {
  for (const source of [homeRaw, missionsRaw]) expect(source).toContain('<DailyCheckInRow />');
});

it('shows the confirmed reward once, only after success, and clears it when the animation ends', async () => {
  const s = mount('zh'); let finish!: (value: any) => void;
  s.faucet.checkInRemote.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const reward = () => all(s.root).find(n => hasClass(n, 'daily-check-in-row__reward-flight'));
  click(s.action()); click(s.action()); await settle();
  expect(s.faucet.checkInRemote).toHaveBeenCalledOnce(); expect(reward()).toBeUndefined();
  finish({ ok: true, gained: 17, streak: 3 }); await settle();
  expect(text(reward()!)).toBe('+17 UVT');
  expect(reward()!.props['aria-live']).toBe('polite');
  expect(s.toast.success).not.toHaveBeenCalled();
  reward()!.props.onAnimationend(); await settle(); expect(reward()).toBeUndefined();
});
it('does not celebrate failed or stale check-ins, and removes feedback on hide', async () => {
  const s = mount();
  s.faucet.checkInRemote.mockResolvedValueOnce({ ok: false, gained: 0, streak: 2 });
  click(s.action()); await settle();
  expect(s.toast.error).toHaveBeenCalledOnce();
  expect(all(s.root).some(n => hasClass(n, 'daily-check-in-row__reward-flight'))).toBe(false);
  click(s.action()); await settle();
  expect(all(s.root).some(n => hasClass(n, 'daily-check-in-row__reward-flight'))).toBe(true);
  s.hide(); await settle();
  expect(all(s.root).some(n => hasClass(n, 'daily-check-in-row__reward-flight'))).toBe(false);
});
