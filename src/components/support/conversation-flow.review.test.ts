import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
// @ts-expect-error Node-only review harness; App tsconfig intentionally omits Node declarations.
import { createHash } from 'node:crypto';
// @ts-expect-error Node-only review harness; App tsconfig intentionally omits Node declarations.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import source from './conversation-thread.vue?raw';
import { useConversationEntrance } from './conversation-entrance';
import { conversationScrollChange, preservedConversationTop } from './conversation-scroll';
import * as conversationTime from './conversation-time';
import * as conversationBubbleLayout from './conversation-bubble-layout';
import { zh } from '@/i18n/messages/zh';
// The thread's generic queue controls are exercised with fixed labels.
const queueLabels = { edit: '修改', cancel: '取消', retry: '重试', save: '保存', cancelEdit: '取消修改', failed: '发送失败，请重试。', ready: '等待发送，请稍候…' };

// Independent review fixture: production SFC and Vue scheduling are executed.
// Only the platform, lifecycle registration, and geometry delivery are controlled.
// This file intentionally does not import or modify Jason's test harness.
const code = ts.transpileModule(compileScript(parse(source).descriptor, { id: 'flow-review' }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const render = new Function('Vue', compile(parse(source).descriptor.template!.content, {
  mode: 'function', prefixIdentifiers: true, cacheHandlers: true,
  isCustomElement: tag => ['view', 'text', 'image', 'input', 'textarea', 'scroll-view'].includes(tag),
}).code)(Vue);
const cleanups: Array<() => void> = [];
const flush = async () => { await Vue.nextTick(); await Vue.nextTick(); };
const message = (id: string) => ({ id, side: 'left', tone: 'agent', text: `History ${id}`, timestamp: 1000, meta: 'Support' });
beforeAll(() => console.info('REVIEW_SFC_SHA256', createHash('sha256').update(source).digest('hex')));
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('ResizeObserver', undefined); });
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function bridge() {
  const pending: Array<{ selectors: string[]; done: (rows: any[]) => void }> = [];
  vi.stubGlobal('uni', { createSelectorQuery() {
    const selectors: string[] = [];
    const q: any = { in: () => q, select: (s: string) => { selectors.push(s); return q; },
      selectAll: (s: string) => { selectors.push(s); return q; }, boundingClientRect: () => q,
      exec: (done: (rows: any[]) => void) => pending.push({ selectors, done }) };
    return q;
  } });
  return {
    take(selector: string) {
      const index = pending.findIndex(request => request.selectors.includes(selector));
      if (index < 0) throw new Error(`No queued selector: ${selector}`);
      return pending.splice(index, 1)[0].done;
    },
    replyAll(selector: string, rows: any[]) {
      const matching = pending.filter(request => request.selectors.includes(selector));
      for (const request of matching) { pending.splice(pending.indexOf(request), 1); request.done(rows); }
    },
  };
}

function mount(initial: any[] = []) {
  const mounted: Array<() => void> = [], hidden: Array<() => void> = [], shown: Array<() => void> = [];
  const app = Vue.reactive({ accountKey: 'review:A', accountBindingEpoch: 1 });
  const props = Vue.reactive<any>({ messages: initial, entranceReady: true, topInset: 0, historyContentKey: '',
    timeLocale: 'zh', composerKey: 'conversation:A', revealTick: 0, typing: false, inputLabel: 'Message',
    inputPlaceholder: 'Message', sendLabel: 'Send', maxInputLength: 2000, inputLimitHint: 'Too long',
    imageLabels: zh.conversations.image, attachRetry: false, attachDisabled: true,
    sendSuccessRevision: 0, queueLabels: queueLabels, statusLabels: zh.conversations.delivery });
  const sound = { unlock() {}, play() {}, stop() {}, destroy() {} };
  const modules: Record<string, any> = {
    vue: { ...Vue, onMounted: (fn: () => void) => mounted.push(fn) },
    '@/components/liquid-glass.vue': { default: {} }, './message-status-icon.vue': { default: {} },
    '@/composables/use-dialog-a11y': { useDialogA11y() {} }, '@/store/app': { useApp: () => app },
    '@/store/preferences': { usePreferences: () => ({ soundEnabled: false }) },
    '@/lib/conversation-audio': { createConversationAudio: () => sound },
    '@/composables/use-tab-page-lifecycle': { onShow: (fn: () => void) => shown.push(fn), onHide: (fn: () => void) => hidden.push(fn) },
    './conversation-entrance': { useConversationEntrance },
    './conversation-scroll': { conversationScrollChange, preservedConversationTop },
    './conversation-time': conversationTime, './conversation-bubble-layout': conversationBubbleLayout,
  };
  const exports: Record<string, any> = {};
  new Function('require', 'exports', code)((id: string) => {
    if (!(id in modules)) throw new Error(`Unmocked dependency: ${id}`);
    return modules[id];
  }, exports);
  const scope = Vue.effectScope(), emit = vi.fn();
  const view: any = scope.run(() => exports.default.setup(props, { emit, expose() {} }));
  cleanups.push(() => scope.stop());
  return { view, props, app, emit, mounted: () => mounted.forEach(fn => fn()),
    async node() {
      let node: Vue.VNode | undefined;
      await renderToString(Vue.createSSRApp({ components: { LiquidGlass: { render: () => null }, MessageStatusIcon: { render: () => null } },
        render: () => node = render(Vue.proxyRefs({ ...Vue.toRefs(props), ...view,
          $slots: { 'history-prefix': () => props.historyContentKey === 'history-has-cursor'
            ? [Vue.h('view', { role: 'button' }, 'Load earlier')] : [] },
        }), []) }));
      return node!;
    },
    hide: () => hidden.forEach(fn => fn()), show: () => shown.forEach(fn => fn()), stop: () => scope.stop() };
}

function find(node: Vue.VNode, className: string): Vue.VNode | undefined {
  if (String(node.props?.class ?? '').split(/\s+/).includes(className)) return node;
  if (Array.isArray(node.children)) for (const child of node.children) {
    if (Vue.isVNode(child)) { const found = find(child, className); if (found) return found; }
  }
}

function domScroller(total = 681) {
  let top = 0;
  return Vue.markRaw({
    clientHeight: 681, scrollHeight: total, querySelectorAll: () => [],
    get scrollTop() { return top; },
    set scrollTop(value: number) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
  });
}

it('initial snapshot stays at the tail when prefix geometry settles after the first tail attempt', async () => {
  const native = bridge(), screen = mount(), host = domScroller();
  screen.view.listHost.value = host;
  screen.view.historyPrefixHost.value = {};
  screen.mounted(); await flush();
  native.replyAll('.nx-conv-history-content', [{ height: 0 }]);
  native.replyAll('.nx-conv-composer', [{ height: 86 }]);
  await flush(); await vi.advanceTimersByTimeAsync(100);
  // The first empty snapshot is at its tail. Uni layout may settle after nextTick.
  screen.props.messages = Array.from({ length: 8 }, (_, i) => message(String(i)));
  screen.props.historyContentKey = 'history-ready';
  await flush();
  expect(host.scrollTop).toBe(0);
  host.scrollHeight = 1131;
  native.take('.nx-conv-history-content')([{ height: 93.333333 }]);
  await flush(); await vi.advanceTimersByTimeAsync(150);
  console.info('INITIAL_PREFIX_REVIEW', JSON.stringify({ top: host.scrollTop, max: 450, prefix: screen.view.historyPrefixHeight.value }));
  expect(host.scrollTop).toBe(450);
});

it('a reader who deliberately leaves the tail keeps the reading offset when the prefix grows', async () => {
  const native = bridge(), screen = mount([message('old')]), host = domScroller(1131);
  screen.view.listHost.value = host; screen.view.historyPrefixHost.value = {}; await flush();
  native.replyAll('.nx-conv-history-content', [{ height: 0 }]); await flush();
  host.scrollTop = 120; screen.view.onThreadScroll({ detail: { scrollTop: 120 } });
  screen.props.historyContentKey = 'notice'; await flush();
  native.take('.nx-conv-history-content')([{ height: 93 }]); await flush();
  await vi.advanceTimersByTimeAsync(150);
  expect(host.scrollTop).toBe(213);
});

async function reader() {
  const native = bridge(), screen = mount([message('old')]);
  screen.view.measureBubblePositions(); native.take('.nx-conv-list')([{ top: 0, height: 400 }, [], undefined]);
  screen.view.onThreadScroll({ detail: { scrollTop: 120, scrollHeight: 1000 } });
  screen.view.historyPrefixHost.value = {}; await flush();
  native.take('.nx-conv-history-content')([{ height: 44 }]); await flush();
  return { native, screen };
}

it.each(['prefix-first', 'prefix-last'] as const)('native prepend pays the total header/prefix delta exactly once: %s', async order => {
  const { native, screen } = await reader();
  const prepared = screen.view.prepareHistoryPrepend();
  native.take('.nx-conv-content')([{ top: 0 }, { top: 86 }]); expect(await prepared).toBe(true);
  screen.props.messages = [message('older'), ...screen.props.messages]; screen.props.historyContentKey = 'last-page';
  screen.props.topInset = 20; await flush();
  const anchor = native.take('.nx-conv-content'), prefix = native.take('.nx-conv-history-content');
  if (order === 'prefix-last') { anchor([{ top: 0 }, { top: 264 }]); await flush(); }
  prefix([{ height: 0 }]); await flush();
  if (order === 'prefix-first') {
    anchor([{ top: 0 }, { top: 9999 }]);
    native.take('.nx-conv-content')([{ top: 0 }, { top: 220 }]); await flush();
  }
  expect(screen.view.scrollTop.value).toBe(254); // 120 + 220 - 86
  expect(screen.view.pendingPosition).toBeNull();
});

it.each(['account', 'binding', 'composer', 'host', 'hide', 'dispose'] as const)(
  'native prefix ignores a queued old measurement across %s before the next flush', async boundary => {
    const { native, screen } = await reader();
    screen.props.historyContentKey = 'old-height'; await flush();
    const old = native.take('.nx-conv-history-content');
    if (boundary === 'account') screen.app.accountKey = 'review:B';
    if (boundary === 'binding') screen.app.accountBindingEpoch++;
    if (boundary === 'composer') screen.props.composerKey = 'conversation:B';
    if (boundary === 'host') screen.view.historyPrefixHost.value = {};
    if (boundary === 'hide') screen.hide();
    if (boundary === 'dispose') screen.stop();
    old([{ height: 999 }]);
    expect(screen.view.historyPrefixHeight.value).toBe(44);
  });

it('native composer reads height on limit/retry appearance and disappearance with no line change', async () => {
  const native = bridge(), screen = mount([message('old')]);
  screen.view.onInputLines({ detail: { height: 144 } });
  for (const [length, retry, height] of [[2000, false, 242], [2001, false, 274], [2001, true, 318], [2000, true, 286], [2000, false, 242]] as const) {
    screen.view.onDraft({ detail: { value: '文'.repeat(length) } }); screen.props.attachRetry = retry;
    await flush(); native.replyAll('.nx-conv-composer', [{ height }]); await flush();
    expect(screen.view.composerSpace.value).toBe(height);
    expect(screen.view.inputHeight.value).toBe(144);
    expect(screen.view.canSend.value).toBe(length <= 2000);
  }
  expect(screen.emit.mock.calls.some(call => call[0] === 'send')).toBe(false);
});

it('a late native over-limit height cannot overwrite a newer restored length/retry height', async () => {
  const native = bridge(), screen = mount([message('old')]);
  screen.view.onDraft({ detail: { value: '文'.repeat(2001) } }); screen.props.attachRetry = true; await flush();
  const old = native.take('.nx-conv-composer');
  screen.view.onDraft({ detail: { value: '文'.repeat(2000) } }); screen.props.attachRetry = false; await flush();
  native.take('.nx-conv-composer')([{ height: 242 }]); old([{ height: 318 }]);
  expect(screen.view.composerSpace.value).toBe(242);
});

it.each(['invalid', 'timeout'] as const)('native first nonempty prefix remains reachable after an %s measurement', async failure => {
  const native = bridge(), screen = mount([message('old')]);
  screen.view.historyPrefixHost.value = {}; await flush();
  native.take('.nx-conv-history-content')([{ height: 0 }]); await flush();
  // Initial empty state is legitimately measured at zero. Data then exposes the
  // load-earlier action; a failed bridge must not permanently clip that action.
  screen.props.historyContentKey = 'history-has-cursor'; await flush();
  const response = native.take('.nx-conv-history-content');
  if (failure === 'timeout') await vi.advanceTimersByTimeAsync(501);
  response([{ height: failure === 'invalid' ? NaN : 88 }]); await flush();
  const prefix = find(await screen.node(), 'nx-conv-history-prefix')!;
  const height = prefix.props?.style.height;
  console.info('PREFIX_BRIDGE_FAILURE_REVIEW', JSON.stringify({ failure, height,
    baseline: screen.view.historyPrefixBaseline.value, measuredHeight: screen.view.historyPrefixHeight.value,
    rawStyle: prefix.props?.style, normalizedStyle: Vue.normalizeStyle(prefix.props?.style),
    className: prefix.props?.class,
    renderedPrefix: await renderToString(Vue.createSSRApp({ render: () => prefix })) }));
  expect(height === undefined || parseFloat(height) > 0).toBe(true);
});

it('a failed first prefix read retains the natural flow fallback before any baseline was adopted', async () => {
  const native = bridge(), screen = mount([message('old')]);
  screen.props.historyContentKey = 'history-has-cursor';
  screen.view.historyPrefixHost.value = {}; await flush();
  native.take('.nx-conv-history-content')([{}]); await flush();
  expect(find(await screen.node(), 'nx-conv-history-prefix')!.props?.style.height).toBeUndefined();
});

it('a native prefix with no callback releases at 500ms and adopts recovered flow only once', async () => {
  const native = bridge(), screen = mount([message('old')]);
  screen.view.measureBubblePositions(); native.take('.nx-conv-list')([{ top: 0, height: 400 }, [], undefined]);
  screen.view.onThreadScroll({ detail: { scrollTop: 120, scrollHeight: 1000 } });
  screen.view.historyPrefixHost.value = {}; await flush();
  native.take('.nx-conv-history-content')([{ height: 0 }]); await flush();
  screen.props.historyContentKey = 'history-has-cursor'; await flush();
  const late = native.take('.nx-conv-history-content');
  await vi.advanceTimersByTimeAsync(499);
  expect(find(await screen.node(), 'nx-conv-history-prefix')!.props?.style.height).toBe('0px');
  await vi.advanceTimersByTimeAsync(1); await flush();
  const fallback = find(await screen.node(), 'nx-conv-history-prefix')!;
  expect(fallback.props?.style.height).toBeUndefined();
  expect(fallback.props?.class).not.toContain('nx-conv-history-prefix--measured');
  late([{ height: 9999 }]); await flush();
  expect(find(await screen.node(), 'nx-conv-history-prefix')!.props?.style.height).toBeUndefined();
  screen.props.timeLocale = 'en'; await flush();
  native.take('.nx-conv-history-content')([{ height: 88 }]); await flush();
  expect(find(await screen.node(), 'nx-conv-history-prefix')!.props?.style.height).toBe('88px');
  expect(screen.view.scrollTop.value).toBe(120);
  screen.props.timeLocale = 'vi'; await flush();
  native.take('.nx-conv-history-content')([{ height: 120 }]); await flush();
  expect(screen.view.scrollTop.value).toBe(152);
});

it('an old owner cannot release a newly measured prefix by callback or timeout', async () => {
  const { native, screen } = await reader();
  screen.props.historyContentKey = 'history-has-cursor'; await flush();
  const old = native.take('.nx-conv-history-content');
  await vi.advanceTimersByTimeAsync(250);
  screen.app.accountKey = 'review:B'; await flush();
  native.take('.nx-conv-history-content')([{ height: 88 }]); await flush();
  old([{ height: NaN }]); await flush();
  expect(find(await screen.node(), 'nx-conv-history-prefix')!.props?.style.height).toBe('88px');
  await vi.advanceTimersByTimeAsync(1000);
  old([{ height: 9999 }]); await flush();
  expect(find(await screen.node(), 'nx-conv-history-prefix')!.props?.style.height).toBe('88px');
});

it.each(['initial', 'reentry'] as const)('a stale Uni transition cannot overwrite a newer tail placement on %s', async phase => {
  bridge();
  const screen = mount(Array.from({ length: 8 }, (_, i) => message(String(i)))), host = domScroller(1131);
  Object.assign(host, { offsetHeight: 681, style: {} });
  screen.view.listHost.value = host;
  const callbacks = new Map<string, () => void>();
  const nativeProps = { scrollWithAnimation: false };
  const content = { style: {}, addEventListener: (event: string, callback: () => void) => callbacks.set(event, callback),
    removeEventListener: (event: string, callback: () => void) => { if (callbacks.get(event) === callback) callbacks.delete(event); } };
  // Execute the installed Uni functions which own the deferred write, rather
  // than inventing a timer that forces scrollTop=0. Platform geometry is a shim.
  const uniSource = readFileSync('node_modules/@dcloudio/uni-h5/dist/uni-h5.es.js', 'utf8');
  const slice = (start: string, end: string) => uniSource.slice(uniSource.indexOf(start), uniSource.indexOf(end, uniSource.indexOf(start)));
  const nativeScroll = new Function('props2', 'main', 'content', 'realScrollY', 'realScrollX',
    'let __transitionEnd = () => {};\n' + slice('  function scrollTo2(', '  function _handleScroll(') +
    slice('  function _scrollTopChanged(', '  function _scrollLeftChanged(') +
    slice('  function _transitionEnd(', '  function _setRefreshState(') + 'return _scrollTopChanged;')(
      nativeProps, { value: host },
      { value: content }, { value: true }, { value: false });
  if (phase === 'reentry') {
    screen.mounted(); await flush();
    screen.view.onInputLines({ detail: { height: 144 } });
    for (const length of [2001, 2000, 0]) {
      screen.view.onDraft({ detail: { value: '文'.repeat(length) } }); await flush();
    }
    screen.hide(); await flush();
    screen.show(); screen.props.revealTick++; await flush();
  }
  host.scrollTop = 450;
  const renderedList = find(await screen.node(), 'nx-conv-list')!;
  expect(renderedList.props).toHaveProperty('scroll-with-animation');
  expect(typeof renderedList.props!['scroll-with-animation']).toBe('boolean');
  nativeProps.scrollWithAnimation = renderedList.props!['scroll-with-animation'];
  nativeScroll(0); // a late initial/activation prop carries the old target
  if (phase === 'initial') { screen.mounted(); await flush(); }
  screen.view.scrollToEnd(false); await flush();
  await vi.advanceTimersByTimeAsync(100);
  expect(host.scrollTop).toBe(450);
  callbacks.get('transitionend')?.();
  screen.view.onThreadScroll({ detail: { scrollTop: host.scrollTop, scrollHeight: 1131 } }); await flush();
  console.info('UNI_STALE_TRANSITION_REVIEW', JSON.stringify({ phase, top: host.scrollTop, boundTop: screen.view.scrollTop.value }));
  expect(host.scrollTop).toBe(450);
  expect(screen.view.scrollTop.value).toBe(450);
});
