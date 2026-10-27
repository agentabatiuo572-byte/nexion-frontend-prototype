import * as Vue from 'vue';
import type { Component } from 'vue';
import { compileScript, compileStyle, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import summarySource from './team-summary-card.vue?raw';
import artSource from './team-art.vue?raw';
import ledgerSource from './team-ledger-card.vue?raw';
import teamSource from '@/pages/team/team.vue?raw';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { formatAmount } from '@/lib/amount-display';
import { formatUsd, formatUsdOverviewParts } from '@/lib/usd-display';

// Node-only host: execute the actual SFCs without a browser or layout engine.
type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (tag: string, text = ''): Host => ({ tag, text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => node(tag), createText: text => node('#text', text), createComment: () => node('#comment'),
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
const text = (root: Host): string => root.text + root.children.map(text).join('');
const hasClass = (target: Host, name: string) => Vue.normalizeClass(target.props.class).split(' ').includes(name);
const find = (root: Host, name: string) => all(root).find(target => hasClass(target, name))!;
const accessibleText = (root: Host): string => root.props['aria-hidden'] === true || root.props['aria-hidden'] === 'true'
  ? '' : root.text + root.children.map(accessibleText).join('');
const unmounts: Array<() => void> = [];
afterEach(() => unmounts.splice(0).forEach(unmount => unmount()));
const dictionaries = { en, zh, vi: vietnamese };
type Locale = keyof typeof dictionaries;

function compile(source: string, dependencies: Record<string, unknown>): Component {
  const script = compileScript(parse(source).descriptor, { id: 'team-r2', inlineTemplate: true,
    templateOptions: { compilerOptions: { hoistStatic: false, isCustomElement: tag => tag === 'view' || tag === 'text' } },
  });
  const code = ts.transpileModule(script.content, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports = { default: {} as Component };
  new Function('require', 'exports', code)((id: string) => {
    if (id === 'vue') return Vue;
    if (!(id in dependencies)) throw new Error(`Unexpected team R2 import: ${id}`);
    return dependencies[id];
  }, exports);
  return exports.default;
}
async function mount(source: string, initial: Record<string, unknown>, locale: Locale = 'en') {
  const navTo = vi.fn();
  const dependencies = {
    '@/i18n/use-t': { useT: () => Vue.ref(dictionaries[locale]) },
    '@/store/locale': { useLocaleStore: () => ({ code: locale }) },
    '@/i18n/team-redesign': { teamRedesignCopy },
    '@/lib/route': { navTo }, '@/lib/amount-display': { formatAmount },
    '@/lib/usd-display': { formatUsd, formatUsdOverviewParts },
    './team-art.vue': { default: compile(artSource, {}) },
    '@/components/ui/nx-button.vue': { default: { props: ['label'], emits: ['click'],
      setup: (props: any, { emit }: any) => () => Vue.h('button', { onClick: () => emit('click') }, props.label) } },
  };
  const props = Vue.reactive(initial);
  const component = compile(source, dependencies);
  const root = node('root');
  const app = renderer.createApp({ setup: () => () => Vue.h(component, props) });
  app.mount(root); unmounts.push(() => app.unmount());
  await Vue.nextTick();
  return { root, props, navTo, set: async (next: Record<string, unknown>) => { Object.assign(props, next); await Vue.nextTick(); } };
}
const amounts = { totalUSDTLifetime: 800, contributors: 16, directUSDT: 600, extendedUSDT: 200,
  monthUSDT: 1234.56, monthNEX: 12, unlockedUSDT: 50, coolingUSDT: 25 };

describe('R1-TV04 ledger state continuity', () => {
  it.each(['zh', 'en', 'vi'] as const)('%s preserves the same hero and status slots across initial/read/refresh/error/retry', async locale => {
    const onRetry = vi.fn(), copy = dictionaries[locale];
    const p = await mount(ledgerSource, { ...amounts, available: false, loading: true, failed: false, onRetry }, locale);
    const hero = find(p.root, 'team-ledger'), amount = find(p.root, 'team-ledger__amount');
    const settlement = find(p.root, 'team-ledger__settlement'), feedback = find(p.root, 'team-ledger__feedback');
    const slots = all(feedback).filter(item => hasClass(item, 'team-ledger__feedback-item'));
    expect(slots).toHaveLength(3);
    expect(text(amount)).toBe('—');
    expect(text(settlement)).not.toContain('$');
    expect(accessibleText(feedback)).toBe(copy.network.projectionLoadingTitle);
    expect(hero.props['aria-busy']).toBe(true);
    const retry = find(p.root, 'team-ledger__retry');
    expect(retry.props.tabindex).toBe(-1);
    retry.props.onClick(); expect(onRetry).not.toHaveBeenCalled();
    const sameSlots = () => {
      expect(find(p.root, 'team-ledger')).toBe(hero);
      expect(find(p.root, 'team-ledger__amount')).toBe(amount);
      expect(find(p.root, 'team-ledger__settlement')).toBe(settlement);
      expect(find(p.root, 'team-ledger__feedback')).toBe(feedback);
      slots.forEach((slot, i) => expect(all(feedback).filter(item => hasClass(item, 'team-ledger__feedback-item'))[i]).toBe(slot));
    };
    await p.set({ available: true, loading: false }); sameSlots();
    expect(text(amount)).toBe('$1,234.56');
    expect(accessibleText(feedback)).toBe('');
    expect(hero.props['aria-busy']).toBe(false);
    find(p.root, 'team-ledger__breakdown').props.onClick(); await Vue.nextTick();
    expect(text(find(p.root, 'team-ledger__lifetime'))).toContain('$800.00');
    await p.set({ loading: true }); sameSlots();
    expect(text(amount)).toBe('$1,234.56');
    expect(accessibleText(feedback)).toBe(copy.network.projectionRefreshing);
    expect(find(p.root, 'team-ledger__breakdown').props['aria-expanded']).toBe(true);
    await p.set({ failed: true, loading: false, available: false }); sameSlots();
    expect(text(amount)).toBe('—');
    expect(text(find(p.root, 'team-ledger__lifetime'))).not.toContain('$800.00');
    expect(accessibleText(feedback)).toContain(copy.network.projectionErrorDesc);
    expect(retry.props.tabindex).toBe(0);
    retry.props.onClick(); expect(onRetry).toHaveBeenCalledOnce();
    await p.set({ failed: false, loading: true }); sameSlots();
    expect(accessibleText(feedback)).toBe(copy.network.projectionLoadingTitle);
    await p.set({ available: true, loading: false, monthUSDT: 0, monthNEX: 0, unlockedUSDT: 0, coolingUSDT: 0 }); sameSlots();
    expect(text(amount)).toBe('$0.00');
    expect(text(find(p.root, 'team-ledger__nex'))).toBe('+ 0.00 UVT');
    find(p.root, 'team-ledger__details').props.onClick();
    expect(p.navTo).toHaveBeenCalledWith('/pages/team/commissions');
  });

  it('never exposes previous-account amounts after its snapshot is cleared, even before loading starts', async () => {
    const p = await mount(ledgerSource, { ...amounts, available: true });
    await p.set({ available: false });
    expect(text(find(p.root, 'team-ledger__amount'))).toBe('—');
    expect(text(find(p.root, 'team-ledger__settlement'))).not.toContain('$');
    find(p.root, 'team-ledger__breakdown').props.onClick(); await Vue.nextTick();
    expect(find(p.root, 'team-ledger__breakdown').props['aria-expanded']).toBe(false);
  });

  it('wires the page into a single unconditional ledger rather than a second loading block', () => {
    const template = parse(teamSource).descriptor.template!.content;
    const cards = template.match(/<TeamLedgerCard\b[\s\S]*?\/>/g)!;
    expect(cards).toHaveLength(1);
    expect(cards[0]).not.toMatch(/v-if|v-else/);
    for (const binding of [':available="ledgerVisible"', ':loading="ledgerLoading"', ':failed="ledgerFailed"', '@retry="refreshRemoteLedger"']) expect(cards[0]).toContain(binding);
    expect(template).not.toContain('toolCellStyle(0)');
  });
});

describe('R1-TV01 summary count and container contracts (not pixel measurements)', () => {
  it('preserves default and explicitly requested art sizes for the other consumers', async () => {
    const p = await mount(artSource, { kind: 'gift' });
    const art = find(p.root, 'team-art');
    expect(art.props.style['--team-art-default-size']).toBe('112px');
    expect(art.props.style.backgroundPosition).toBe('100% 0%');
    await p.set({ size: 128 }); expect(art.props.style['--team-art-default-size']).toBe('128px');
    await p.set({ size: 88, kind: 'growth' });
    expect(art.props.style['--team-art-default-size']).toBe('88px');
    expect(art.props.style.backgroundPosition).toBe('100% 100%');
  });

  it.each(['zh', 'en', 'vi'] as const)('%s keeps real multi-digit counts and the existing navigation/retry/invitation states', async locale => {
    const onOpen = vi.fn(), onInvite = vi.fn(), onRetry = vi.fn();
    const p = await mount(summarySource, { status: 'ready', total: 987654, direct: 123456, onOpen, onInvite, onRetry }, locale);
    const count = find(p.root, 'team-summary__number'), card = find(p.root, 'team-summary');
    expect(text(count)).toBe('987654');
    expect(text(find(p.root, 'team-summary__direct'))).toContain('123456');
    expect(find(p.root, 'team-art').props.style).toMatchObject({ '--team-art-default-size': '56px' });
    expect(find(p.root, 'team-art').props.style).not.toHaveProperty('width');
    card.props.onClick(); expect(onOpen).toHaveBeenCalledOnce();
    await p.set({ total: 123456789 }); expect(text(count)).toBe('123456789');
      await p.set({ status: 'loading', hasSnapshot: true }); expect(text(count)).toBe('123456789');
      await p.set({ hasSnapshot: false }); expect(text(count)).toBe('—');
    expect(card.props['aria-busy']).toBe(true);
    card.props.onClick(); expect(onOpen).toHaveBeenCalledOnce();
    await p.set({ status: 'error' });
    all(p.root).find(item => item.tag === 'button')!.props.onClick(); expect(onRetry).toHaveBeenCalledOnce();
    await p.set({ status: 'ready', total: 0, direct: 0 }); expect(text(count)).toBe('0');
    all(p.root).find(item => item.tag === 'button')!.props.onClick(); expect(onInvite).toHaveBeenCalledOnce();
  });

  it('compiles a stacked fallback, real container thresholds and a shared art size variable', () => {
    for (const source of [summarySource, artSource, ledgerSource]) {
      const css = parse(source).descriptor.styles[0].content;
      expect(compileStyle({ source: css, filename: 'team-r2.vue', id: 'team-r2', scoped: true }).errors).toEqual([]);
    }
    const summaryCss = parse(summarySource).descriptor.styles[0].content;
    expect(summaryCss).toContain('container: team-summary / inline-size');
    expect(summaryCss).toMatch(/\.team-summary__body\s*\{[^}]*flex-direction: column/);
    expect(summaryCss).toContain('@container team-summary (min-width: 140px)');
    expect(summaryCss).toContain('@container team-summary (min-width: 260px)');
    expect(summaryCss).toMatch(/\.team-summary__number\s*\{[^}]*white-space: nowrap;[^}]*overflow-x: auto/);
    expect(summaryCss).not.toContain('!important');
    expect(summaryCss).not.toContain('@media');
    const artCss = parse(artSource).descriptor.styles[0].content;
    expect(artCss).toContain('width: var(--team-art-size, var(--team-art-default-size))');
    expect(artCss).toContain('height: var(--team-art-size, var(--team-art-default-size))');
    const ledgerCss = parse(ledgerSource).descriptor.styles[0].content;
    expect(ledgerCss).toMatch(/\.team-ledger__feedback-item\s*\{[^}]*grid-area: 1 \/ 1;[^}]*visibility: hidden/);
    expect(ledgerCss).toMatch(/\.team-ledger__feedback-item\.is-active\s*\{[^}]*visibility: visible/);
  });
});
