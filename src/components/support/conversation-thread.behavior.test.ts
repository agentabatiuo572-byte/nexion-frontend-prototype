import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import { initPreContext, preJs } from '@dcloudio/uni-cli-shared/dist/preprocess';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import source from './conversation-thread.vue?raw';
import uniScrollSource from '@dcloudio/uni-h5/dist/uni-h5.es.js?raw';
import chatSource from '@/pages/support/chat.vue?raw';
import { useConversationEntrance } from './conversation-entrance';
import { conversationScrollChange, preservedConversationTop } from './conversation-scroll';
import * as conversationTime from './conversation-time';
import * as conversationBubbleLayout from './conversation-bubble-layout';
import type { ThreadMsg } from './thread-types';
import { createSupportApi } from '@/api/support-api';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi as vietnamese } from '@/i18n/messages/vi';

const descriptor = parse(source).descriptor;
const transpile = (text: string) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const code = transpile(compileScript(descriptor, { id: 'thread-behavior' }).content);
const render = new Function('Vue', compile(descriptor.template!.content, { mode: 'function', prefixIdentifiers: true, cacheHandlers: true,
  isCustomElement: tag => ['view', 'text', 'image', 'input', 'textarea', 'scroll-view'].includes(tag) }).code)(Vue);
const cleanups: Array<() => void> = [];
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const flush = async () => { await Vue.nextTick(); await Vue.nextTick(); };
const message = (id: string, side: 'left' | 'right' = 'right', extra: Partial<ThreadMsg> = {}): ThreadMsg => ({
  id, side, tone: side === 'right' ? 'user' : 'agent', text: 'Message ' + id, meta: '18:57', ...extra,
});
function nativeMeasurements() {
  const pending: Array<{ selectors: string[]; done: (rows: unknown[]) => void }> = [];
  vi.stubGlobal('uni', { createSelectorQuery: () => {
    const selectors: string[] = [];
    const query: Record<string, any> = { in: () => query,
      select: (selector: string) => { selectors.push(selector); return query; },
      selectAll: (selector: string) => { selectors.push(selector); return query; },
      boundingClientRect: () => query,
      exec: (done: (rows: unknown[]) => void) => pending.push({ selectors, done }) };
    return query;
  } });
  const take = (selector: string) => {
    const index = pending.findIndex(request => request.selectors.includes(selector));
    if (index < 0) throw new Error('Missing native measurement: ' + selector);
    return pending.splice(index, 1)[0].done;
  };
  return Object.assign(take, { replyAll(selector: string, rows: unknown[]) {
    const requests = pending.filter(request => request.selectors.includes(selector));
    for (const request of requests) { pending.splice(pending.indexOf(request), 1); request.done(rows); }
  } });
}
function findAll(node: Vue.VNode, className: string): Vue.VNode[] {
  const result: Vue.VNode[] = [];
  if (String(node.props?.class ?? '').split(/\s+/).includes(className)) result.push(node);
  if (Array.isArray(node.children)) for (const child of node.children) if (Vue.isVNode(child)) result.push(...findAll(child, className));
  return result;
}
function visibleText(node: Vue.VNode): string {
  if (typeof node.children === 'string') return node.children;
  return Array.isArray(node.children) ? node.children.map(child => Vue.isVNode(child) ? visibleText(child) : typeof child === 'string' ? child : '').join('') : '';
}
function mount(initial: ThreadMsg[] = [], sendSuccessRevision = 0, slots: Vue.Slots = {}, platform: 'app' | 'h5' = 'app') {
  const app = Vue.reactive({ accountKey: 'user:7', accountBindingEpoch: 1 });
  const shown: Array<() => void> = [], hidden: Array<() => void> = [];
  const props = Vue.reactive({ messages: initial, entranceReady: true, typing: false, topInset: 0, timeLocale: 'zh' as 'zh' | 'en' | 'vi', composerKey: 'conversation:A', revealTick: 0,
    inputPlaceholder: 'Message', inputLabel: 'Message', sendLabel: 'Send', queueLabels: zh.nova.queue, sendSuccessRevision, historyContentKey: '',
    imageLabels: zh.conversations.image, statusLabels: zh.conversations.delivery, canRetrySend: true, sendBlocked: false, attachDisabled: false, attachUnavailable: '', attachRetry: false,
    sendSuccessOwner: JSON.stringify(['user:7', 1, 'conversation:A']), maxInputLength: 2000, inputLimitHint: 'Message too long' });
  const exports: Record<string, any> = {}, emit = vi.fn();
  const sound = { unlock: vi.fn(), play: vi.fn(), stop: vi.fn(), destroy: vi.fn() };
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onMounted() {} }, '@/components/liquid-glass.vue': { default: { render: () => null } },
    '@/composables/use-dialog-a11y': { useDialogA11y() {} }, '@/store/app': { useApp: () => app },
    '@/composables/use-tab-page-lifecycle': { onShow: (fn: () => void) => shown.push(fn), onHide: (fn: () => void) => hidden.push(fn) },
    './conversation-entrance': { useConversationEntrance }, './conversation-scroll': { conversationScrollChange, preservedConversationTop },
    './conversation-time': conversationTime,
    './conversation-bubble-layout': conversationBubbleLayout,
    '@/store/preferences': { usePreferences: () => ({ soundEnabled: false }) },
    '@/lib/conversation-audio': { createConversationAudio: () => sound },
    './message-status-icon.vue': { default: { render: () => null } },
  };
  initPreContext(platform);
  const platformCode = platform === 'app' ? code : transpile(compileScript(parse(source.replace(descriptor.scriptSetup!.content,
    preJs(descriptor.scriptSetup!.content, 'conversation-thread.vue'))).descriptor, { id: 'thread-behavior-h5' }).content);
  new Function('require', 'exports', platformCode)((id: string) => { if (!(id in modules)) throw new Error(id); return modules[id]; }, exports);
  const scope = Vue.effectScope(), view = scope.run(() => exports.default.setup(props, { emit, expose() {} }))!;
  cleanups.push(() => scope.stop());
  let node!: Vue.VNode; const renderCache: unknown[] = [];
  return { props, app, view, emit, sound, hide: () => hidden.forEach(fn => fn()), show: () => shown.forEach(fn => fn()), stop: () => scope.stop(),
    async node() {
      await renderToString(Vue.createSSRApp({ components: { LiquidGlass: { render: () => null }, MessageStatusIcon: { render: () => null } }, render: () => {
        node = render(Vue.proxyRefs({ ...Vue.toRefs(props), ...view, $slots: slots }), renderCache); return node;
      } }));
      return node;
    } };
}

it('flow prefix renders inside the scrolling content before message dates', async () => {
  const screen = mount([message('old', 'left', { timestamp: 1 })], 0, {
    'history-prefix': () => [Vue.h('view', { class: 'test-history-action' }, 'Earlier messages')],
  });
  const content = findAll(await screen.node(), 'nx-conv-content')[0];
  expect(findAll(content, 'test-history-action')).toHaveLength(1);
  expect(findAll(content, 'nx-conv-history-prefix')[0].props?.style.height).toBeUndefined();
  expect(visibleText(content).indexOf('Earlier messages')).toBeLessThan(visibleText(content).indexOf('Message old'));
});

function initialFlowScroller() {
  let top = 0;
  return { scrollHeight: 1131, clientHeight: 681, querySelectorAll: () => [],
    get scrollTop() { return top; },
    set scrollTop(value: number) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); } };
}

function nativePreviewMeasurements() {
  const pending: Array<{ selectors: string[]; done: (rows: unknown[]) => void }> = [], fields = vi.fn(), previewImage = vi.fn();
  vi.stubGlobal('uni', { previewImage, createSelectorQuery: () => {
    const selectors: string[] = [];
    const query = { in: () => query, select: (value: string) => { selectors.push(value); return query; },
      selectAll: (value: string) => { selectors.push(value); return query; }, boundingClientRect: () => query,
      fields: (options: unknown) => { fields(options); return query; },
      exec: (done: (rows: unknown[]) => void) => { if (selectors.includes('.nx-conv-msg-row') || selectors.some(selector => selector.endsWith('-preview-image'))) pending.push({ selectors, done }); } };
    return query;
  } });
  return { previewImage, fields,
    reply(rows: unknown[], images: unknown[] = []) { const request = pending.shift(); expect(request?.selectors).toContain('.nx-conv-msg-row'); request!.done([rows, images]); },
    ack(id: string, result = previewImageNode(id, 124)) { const request = pending.shift(); expect(request?.selectors).toEqual(['#' + previewImageNode(id, 124).id]); request!.done([result]); },
    get pending() { return pending.length; } };
}
const previewRow = (id: string, height: number, minimum = 0) => ({
  id: 'nx-conv-message-' + Array.from(id).map(char => char.charCodeAt(0).toString(16)).join('-') + '-preview',
  height, 'min-height': minimum + 'px',
});
const imageOne = 'https://fixture.invalid/one', imageTwo = 'https://fixture.invalid/two';
const previewImageNode = (id: string, height: number, minimum = 0, maximum = 0) => ({
  id: previewRow(id, 0).id + '-image', width: 220, height, 'min-height': minimum + 'px', 'max-height': maximum + 'px',
});

it('native no-DOM preview measures identified rows and confirms real min-height before opening', async () => {
  const native = nativePreviewMeasurements(), screen = mount([message('one', 'left', { imageSrc: imageOne }), message('system', 'left', { tone: 'system' }), message('two', 'left', { imageSrc: imageTwo })]);
  screen.view.listHost.value = {}; screen.view.onThreadScroll({ detail: { scrollTop: 120 } });
  screen.view.openPreview(imageOne); expect(native.previewImage).not.toHaveBeenCalled();
  native.reply([previewRow('two', 180), { id: 'history-prefix', height: 900 }, previewRow('system', 24), previewRow('one', 220)], [previewImageNode('two', 90), previewImageNode('one', 124)]);
  expect(screen.view.previewRowHeights.value).toEqual({ one: 220, two: 180 }); expect(native.previewImage).not.toHaveBeenCalled();
  await flush(); expect(native.previewImage).not.toHaveBeenCalled();
  native.reply([previewRow('two', 180, 180), previewRow('one', 220, 220)], [previewImageNode('one', 124, 124, 124), previewImageNode('two', 90, 90, 90)]);
  expect(native.fields).toHaveBeenCalledWith({ id: true, size: true, computedStyle: ['min-height'] });
  expect(native.fields).toHaveBeenLastCalledWith({ id: true, size: true, computedStyle: ['min-height', 'max-height'] });
  expect(native.previewImage).toHaveBeenCalledOnce(); expect(native.previewImage.mock.calls[0][0]).toMatchObject({ current: imageOne, urls: [imageOne] });
  screen.hide(); screen.props.messages = screen.props.messages.map(row => row.imageSrc ? { ...row, imageSrc: undefined, imageLoading: true } : row); screen.show(); await flush();
  const rows = findAll(await screen.node(), 'nx-conv-msg-row');
  expect(rows.map(row => (Vue.normalizeStyle(row.props?.style) as Vue.CSSProperties)?.minHeight)).toEqual(['220px', undefined, '180px']);
  expect(screen.view.previewImage.value).toBe('');
});

it.each(['missing', 'duplicate', 'nan', 'zero', 'uncommitted'] as const)('native preview falls back in place when geometry is %s', async failure => {
  const native = nativePreviewMeasurements(), screen = mount([message('one', 'left', { imageSrc: imageOne })]); screen.view.listHost.value = {};
  screen.view.openPreview(imageOne);
  native.reply(failure === 'missing' ? [] : failure === 'duplicate' ? [previewRow('one', 220), previewRow('one', 220)] : [previewRow('one', failure === 'nan' ? NaN : failure === 'zero' ? 0 : 220)], [previewImageNode('one', 124)]);
  await flush(); if (failure === 'uncommitted') native.reply([previewRow('one', 220)]);
  expect(native.previewImage).not.toHaveBeenCalled(); expect(screen.view.previewImage.value).toBe(imageOne); expect(screen.view.previewRowHeights.value).toEqual({});
});

it.each(['account', 'binding', 'composer', 'reveal', 'host', 'hide', 'dispose', 'source-aba', 'reorder', 'scroll'] as const)('late native capture cannot launch after %s', async change => {
  const native = nativePreviewMeasurements(), screen = mount([message('one', 'left', { imageSrc: imageOne }), message('two', 'left', { imageSrc: imageTwo })]); screen.view.listHost.value = {};
  screen.view.openPreview(imageOne);
  if (change === 'account') screen.app.accountKey = 'user:8';
  if (change === 'binding') screen.app.accountBindingEpoch++;
  if (change === 'composer') screen.props.composerKey = 'conversation:B';
  if (change === 'reveal') screen.props.revealTick++;
  if (change === 'host') screen.view.listHost.value = {};
  if (change === 'hide') { screen.hide(); screen.show(); }
  if (change === 'dispose') screen.stop();
  if (change === 'source-aba') { screen.props.messages[0].imageSrc = undefined; screen.props.messages[0].imageSrc = imageOne; }
  if (change === 'reorder') screen.props.messages.reverse();
  if (change === 'scroll') screen.view.onThreadScroll({ detail: { scrollTop: 270 } });
  native.reply([previewRow('one', 220), previewRow('two', 180)], [previewImageNode('one', 124), previewImageNode('two', 90)]); await flush();
  expect(native.previewImage).not.toHaveBeenCalled(); expect(screen.view.previewImage.value).toBe(''); expect(screen.view.previewRowHeights.value).toEqual({});
  if (change === 'scroll') expect(screen.view.scrollTop.value).toBe(270);
});

it.each(['scroll', 'binding', 'reveal', 'hide', 'source', 'dispose'] as const)('native style-commit callback is fenced after %s', async change => {
  const native = nativePreviewMeasurements(), screen = mount([message('one', 'left', { imageSrc: imageOne })]); screen.view.listHost.value = {};
  screen.view.openPreview(imageOne); native.reply([previewRow('one', 220)], [previewImageNode('one', 124)]); await flush();
  if (change === 'scroll') screen.view.onThreadScroll({ detail: { scrollTop: 270 } });
  if (change === 'binding') screen.app.accountBindingEpoch++;
  if (change === 'reveal') screen.props.revealTick++;
  if (change === 'hide') { screen.hide(); screen.show(); }
  if (change === 'source') screen.props.messages[0].imageSrc = undefined;
  if (change === 'dispose') screen.stop();
  native.reply([previewRow('one', 220, 220)]); await flush();
  expect(native.previewImage).not.toHaveBeenCalled(); expect(screen.view.previewRowHeights.value).toEqual({});
  if (change === 'scroll') expect(screen.view.scrollTop.value).toBe(270);
});

it('a newer click supersedes both measurement and style-commit callbacks without opening an old image', async () => {
  const native = nativePreviewMeasurements(), screen = mount([message('one', 'left', { imageSrc: imageOne }), message('two', 'left', { imageSrc: imageTwo })]); screen.view.listHost.value = {};
  screen.view.openPreview(imageOne); native.reply([previewRow('one', 220), previewRow('two', 180)], [previewImageNode('one', 124), previewImageNode('two', 90)]); await flush();
  screen.view.openPreview(imageTwo); native.reply([previewRow('one', 220, 220), previewRow('two', 180, 180)]);
  expect(native.previewImage).not.toHaveBeenCalled();
  native.reply([previewRow('one', 220), previewRow('two', 180)], [previewImageNode('one', 124), previewImageNode('two', 90)]); await flush(); native.reply([previewRow('one', 220, 220), previewRow('two', 180, 180)], [previewImageNode('one', 124, 124, 124), previewImageNode('two', 90, 90, 90)]);
  expect(native.previewImage).toHaveBeenCalledOnce(); expect(native.previewImage.mock.calls[0][0].current).toBe(imageTwo);
});

it.each(['missing', 'duplicate', 'zero', 'nan', 'wrong-id'] as const)('native image geometry %s cannot be replaced with a guessed size', async failure => {
  const native = nativePreviewMeasurements(), screen = mount([message('one', 'left', { imageSrc: imageOne })]); screen.view.listHost.value = {};
  screen.view.openPreview(imageOne);
  const image = previewImageNode(failure === 'wrong-id' ? 'another' : 'one', failure === 'zero' ? 0 : failure === 'nan' ? NaN : 124);
  native.reply([previewRow('one', 220)], failure === 'missing' ? [] : failure === 'duplicate' ? [image, image] : [image]); await flush();
  expect(native.previewImage).not.toHaveBeenCalled(); expect(screen.view.previewImage.value).toBe(imageOne);
  expect(screen.view.previewRowHeights.value).toEqual({}); expect(screen.view.previewImageHeights.value).toEqual({});
});

it.each(['missing', 'minimum', 'maximum', 'actual-height'] as const)('both images need committed size bounds before preview, failure=%s', async failure => {
  const native = nativePreviewMeasurements(), screen = mount([message('one', 'left', { imageSrc: imageOne }), message('two', 'left', { imageSrc: imageTwo })]); screen.view.listHost.value = {};
  screen.view.openPreview(imageOne); native.reply([previewRow('one', 220), previewRow('two', 180)], [previewImageNode('one', 124), previewImageNode('two', 90)]); await flush();
  const second = previewImageNode('two', failure === 'actual-height' ? 240 : 90, failure === 'minimum' ? 0 : 90, failure === 'maximum' ? 280 : 90);
  native.reply([previewRow('one', 220, 220), previewRow('two', 180, 180)], failure === 'missing' ? [previewImageNode('one', 124, 124, 124)] : [previewImageNode('one', 124, 124, 124), second]);
  expect(native.previewImage).not.toHaveBeenCalled(); expect(screen.view.previewImage.value).toBe(imageOne); expect(screen.view.previewImageHeights.value).toEqual({});
});

async function nativeReservedPair() {
  const native = nativePreviewMeasurements(), screen = mount([message('one', 'left', { imageSrc: imageOne }), message('two', 'left', { imageSrc: imageTwo })]); screen.view.listHost.value = {};
  screen.view.openPreview(imageOne); native.reply([previewRow('one', 220), previewRow('two', 180)], [previewImageNode('one', 124), previewImageNode('two', 90)]); await flush();
  native.reply([previewRow('one', 220, 220), previewRow('two', 180, 180)], [previewImageNode('one', 124, 124, 124), previewImageNode('two', 90, 90, 90)]);
  const oldImages = findAll(await screen.node(), 'nx-conv-image');
  screen.hide(); screen.props.messages = screen.props.messages.map(row => ({ ...row, imageSrc: undefined, imageLoading: true })); screen.show();
  await activateExistingHumanPage(screen).activate(); await flush();
  screen.props.messages = screen.props.messages.map((row, index) => ({ ...row, imageSrc: index ? imageTwo : imageOne, imageLoading: false }));
  const images = findAll(await screen.node(), 'nx-conv-image'); return { screen, native, oldImages, images };
}
const loadedImage = { detail: { width: 640, height: 360 } };

it('numeric image bounds cover the default-sized reload and release both current loads only after view acknowledgment', async () => {
  const { screen, native, images } = await nativeReservedPair();
  expect(images.map(image => image.props?.style)).toEqual([{ minHeight: '124px', maxHeight: '124px' }, { minHeight: '90px', maxHeight: '90px' }]);
  expect(images.every(image => image.props?.style.height === undefined)).toBe(true);
  images.forEach(image => image.props!.onLoad(loadedImage)); await flush();
  expect(native.pending).toBe(2); expect(screen.view.previewImageHeights.value).toEqual({ one: 124, two: 90 });
  native.ack('one'); expect(screen.view.previewImageHeights.value).toEqual({ two: 90 }); expect(screen.view.previewRowHeights.value).toEqual({ two: 180 });
  native.ack('two'); expect(screen.view.previewImageHeights.value).toEqual({}); expect(screen.view.previewRowHeights.value).toEqual({});
});

it.each(['missing', 'zero', 'nan'] as const)('unknown intrinsic load %s keeps its numeric reservation', async failure => {
  const { screen, native, images } = await nativeReservedPair();
  images[0].props!.onLoad(failure === 'missing' ? undefined : { detail: { width: failure === 'zero' ? 0 : NaN, height: 360 } }); await flush();
  expect(native.pending).toBe(0); expect(screen.view.previewImageHeights.value.one).toBe(124); expect(screen.view.previewRowHeights.value.one).toBe(220);
});

it.each(['wrong-id', 'zero-width', 'zero-height', 'nan-height'] as const)('post-load view acknowledgment %s cannot release pending bounds', async failure => {
  const { screen, native, images } = await nativeReservedPair(); images[0].props!.onLoad(loadedImage); await flush();
  const result = previewImageNode(failure === 'wrong-id' ? 'foreign' : 'one', failure === 'zero-height' ? 0 : failure === 'nan-height' ? NaN : 124);
  if (failure === 'zero-width') result.width = 0;
  native.ack('one', result); expect(screen.view.previewImageHeights.value.one).toBe(124); expect(screen.view.previewRowHeights.value.one).toBe(220);
});

it.each(['owner', 'binding', 'host', 'hide', 'source-aba', 'dispose'] as const)('late post-load view acknowledgment cannot release after %s', async change => {
  const { screen, native, images } = await nativeReservedPair(); images[0].props!.onLoad(loadedImage); await flush();
  if (change === 'owner') screen.app.accountKey = 'user:8';
  if (change === 'binding') screen.app.accountBindingEpoch++;
  if (change === 'host') screen.view.listHost.value = {};
  if (change === 'hide') screen.hide();
  if (change === 'source-aba') { screen.props.messages[0].imageSrc = undefined; screen.props.messages[0].imageSrc = imageOne; }
  if (change === 'dispose') screen.stop();
  const before = JSON.stringify(screen.view.previewImageHeights.value); native.ack('one');
  expect(JSON.stringify(screen.view.previewImageHeights.value)).toBe(before);
});

it('old source load and queued load before another preview cannot release newer measured bounds', async () => {
  const { screen, native, oldImages, images } = await nativeReservedPair(); oldImages[0].props!.onLoad(loadedImage); await flush(); expect(native.pending).toBe(0);
  images[0].props!.onLoad(loadedImage); await flush(); screen.view.openPreview(imageTwo);
  native.ack('one'); native.reply([previewRow('one', 260), previewRow('two', 200)], [previewImageNode('one', 130), previewImageNode('two', 110)]); await flush();
  expect(screen.view.previewImageHeights.value).toEqual({ one: 130, two: 110 });
});

// Execute the current human-page activation, including its reveal revision and
// existing history/policy reads, against the complete thread's real watchers.
function activateExistingHumanPage(screen: ReturnType<typeof mount>) {
  const start = chatSource.indexOf('async function activateHumanPage()');
  const end = chatSource.indexOf('// Bare full-screen page', start);
  const reads = { refreshAdvisor: vi.fn(), refresh: vi.fn(async () => {}), open: vi.fn(async () => {}), images: vi.fn(), policy: vi.fn() };
  const context = { novaPageVisible: true, isAi: Vue.ref(false), supportSessionReady: Vue.ref(true), stopHumanThreadPolling: vi.fn(),
    humanRealtime: { show: () => 1 }, app: screen.app, convStore: { scopeInvalidated: 0, refreshAdvisor: reads.refreshAdvisor, refresh: reads.refresh, composer: () => ({}) },
    loadAttachmentPolicy: reads.policy, restoreCompletedHumanCreate: vi.fn(), restoreRecoveredComposer: vi.fn(), humanComposerKey: Vue.ref('conversation:A'),
    cid: Vue.ref('existing-canonical'), startType: Vue.ref(null), revealTick: Vue.toRef(screen.props, 'revealTick'), remoteApiEnabled: true,
    humanHistoryListError: Vue.ref(false), openHumanConversation: reads.open, loadPrivateImages: reads.images };
  const activate = new Function(...Object.keys(context), transpile(chatSource.slice(start, end)) + '\nreturn activateHumanPage;')(...Object.values(context)) as () => Promise<void>;
  return { activate, reads };
}

it.each(['retained', 'hidden-clamp'] as const)('native image preview returns to historical reading position through the real human activation: %s', async scenario => {
  const screen = mount([message('historical-image', 'left', { imageSrc: 'https://fixture.invalid/readable-image' }), message('latest')]);
  const host = initialFlowScroller(); screen.view.listHost.value = host;
  host.scrollTop = 120; screen.view.onThreadScroll({ detail: { scrollTop: 120 } });
  const previewImage = vi.fn(); vi.stubGlobal('uni', { previewImage });
  screen.view.openPreview('https://fixture.invalid/readable-image'); expect(previewImage).toHaveBeenCalledOnce();
  screen.hide();
  if (scenario === 'hidden-clamp') { host.clientHeight = host.scrollHeight; host.scrollTop = 0; screen.view.onThreadScroll({ detail: { scrollTop: 0 } }); host.clientHeight = 681; }
  screen.show(); const page = activateExistingHumanPage(screen); await page.activate(); await flush();
  expect(host.scrollTop).toBe(120); expect(screen.view.scrollTop.value).toBe(120);
  expect(screen.view.scrollAnchor.value).not.toBe('nx-conv-end');
  expect(page.reads.refresh).toHaveBeenCalledOnce(); expect(page.reads.open).toHaveBeenCalledOnce(); expect(page.reads.images).toHaveBeenCalledOnce(); expect(page.reads.policy).toHaveBeenCalledOnce();
  screen.props.messages.push(message('incoming-after-preview')); await flush(); expect(host.scrollTop).toBe(120);
  screen.hide(); screen.show(); await page.activate(); await flush(); expect(host.scrollTop).toBe(450);
});

it.each(['during', 'after'] as const)('native preview at the tail keeps ordinary append following %s return', async moment => {
  const screen = mount([message('image', 'left', { imageSrc: 'https://fixture.invalid/image' })]);
  const host = initialFlowScroller(); screen.view.listHost.value = host; screen.view.scrollToEnd(); await flush();
  screen.view.onThreadScroll({ detail: { scrollTop: host.scrollTop } }); vi.stubGlobal('uni', { previewImage: vi.fn() });
  screen.view.openPreview('https://fixture.invalid/image'); screen.hide();
  if (moment === 'during') { host.scrollHeight += 100; screen.props.messages.push(message('real-new-message')); await flush(); }
  screen.show(); await activateExistingHumanPage(screen).activate(); await flush();
  if (moment === 'after') { host.scrollHeight += 100; screen.props.messages.push(message('real-new-message')); await flush(); }
  expect(host.scrollTop).toBe(550);
});

it.each(['ready', 'failed'] as const)('native preview reserves only measured image-row height while private sources are cleared and re-read: %s', async outcome => {
  const screen = mount([message('image', 'left', { imageSrc: 'https://fixture.invalid/image' }), message('latest')]);
  const host = initialFlowScroller(); let intrinsicHeight = 220, reservedHeight = 0;
  Object.defineProperty(host, 'scrollHeight', { get: () => 911 + Math.max(intrinsicHeight, reservedHeight) });
  host.querySelectorAll = (selector?: string) => selector === '.nx-conv-msg-row'
    ? [{ getBoundingClientRect: () => ({ height: 220 }) }, { getBoundingClientRect: () => ({ height: 100 }) }] as any : [];
  screen.view.listHost.value = host; host.scrollTop = 400; screen.view.onThreadScroll({ detail: { scrollTop: 400 } });
  vi.stubGlobal('uni', { previewImage: vi.fn() }); screen.view.openPreview('https://fixture.invalid/image');
  const measuredRow = findAll(await screen.node(), 'nx-conv-msg-row')[0];
  reservedHeight = parseFloat(String((Vue.normalizeStyle(measuredRow.props!.style) as Vue.CSSProperties)?.minHeight)) || 0;
  expect(reservedHeight).toBe(220);
  screen.hide(); screen.props.messages[0] = { ...screen.props.messages[0], imageSrc: undefined, imageLoading: true }; intrinsicHeight = 18;
  host.scrollTop = host.scrollTop; expect(host.scrollTop).toBe(400);
  screen.show(); await activateExistingHumanPage(screen).activate(); await flush(); expect(host.scrollTop).toBe(400);
  const loadingRow = findAll(await screen.node(), 'nx-conv-msg-row')[0]; expect((Vue.normalizeStyle(loadingRow.props!.style) as Vue.CSSProperties)?.minHeight).toBe('220px');
  expect(visibleText(loadingRow)).toContain(zh.conversations.image.loading);
  if (outcome === 'failed') {
    screen.props.messages[0] = { ...screen.props.messages[0], imageLoading: false, imageError: true };
    const errorRow = findAll(await screen.node(), 'nx-conv-msg-row')[0];
    expect(visibleText(errorRow)).toContain(zh.conversations.image.failed); expect(findAll(errorRow, 'nx-conv-image')).toHaveLength(0);
    expect(host.scrollTop).toBe(400); return;
  }
  screen.props.messages[0] = { ...screen.props.messages[0], imageSrc: 'https://fixture.invalid/new-current-source', imageLoading: false };
  intrinsicHeight = 220;
  findAll(await screen.node(), 'nx-conv-image')[0].props!.onLoad(); await flush();
  const loadedRow = findAll(await screen.node(), 'nx-conv-msg-row')[0];
  expect((Vue.normalizeStyle(loadedRow.props!.style) as Vue.CSSProperties)?.minHeight).toBeUndefined(); reservedHeight = 0; host.scrollTop = host.scrollTop;
  expect(host.scrollTop).toBe(400);
});

it('native preview restoration respects user scroll during the current layout transaction', async () => {
  const screen = mount([message('image')]), host = initialFlowScroller(); screen.view.listHost.value = host;
  host.scrollTop = 120; screen.view.onThreadScroll({ detail: { scrollTop: 120 } }); vi.stubGlobal('uni', { previewImage: vi.fn() });
  screen.view.openPreview('https://fixture.invalid/image'); screen.hide(); screen.show();
  const resumed = activateExistingHumanPage(screen).activate(); await Vue.nextTick();
  host.scrollTop = 210; screen.view.onThreadScroll({ detail: { scrollTop: 210 } });
  await resumed; await flush(); await vi.advanceTimersByTimeAsync(100); await flush();
  expect(host.scrollTop).toBe(210); expect(screen.view.scrollTop.value).toBe(210);
});

it.each(['before-activation', 'before-watch'] as const)('native preview never replaces a returned user scroll captured %s', async moment => {
  const screen = mount([message('image')]), host = initialFlowScroller(); screen.view.listHost.value = host;
  host.scrollTop = 120; screen.view.onThreadScroll({ detail: { scrollTop: 120 } }); vi.stubGlobal('uni', { previewImage: vi.fn() });
  screen.view.openPreview('https://fixture.invalid/image'); screen.hide(); screen.show();
  let activation: Promise<void> | undefined;
  if (moment === 'before-watch') activation = activateExistingHumanPage(screen).activate();
  host.scrollTop = 270; screen.view.onThreadScroll({ detail: { scrollTop: 270 } });
  await (activation ?? activateExistingHumanPage(screen).activate()); await flush(); await vi.advanceTimersByTimeAsync(100); await flush();
  expect(host.scrollTop).toBe(270); expect(screen.view.scrollTop.value).toBe(270);
});

it('preview geometry is not fabricated when native rows have no measured image heights', async () => {
  const screen = mount([message('image', 'left', { imageSrc: 'https://fixture.invalid/image' })]);
  screen.view.listHost.value = initialFlowScroller(); vi.stubGlobal('uni', { previewImage: vi.fn() }); screen.view.openPreview('https://fixture.invalid/image');
  expect((Vue.normalizeStyle(findAll(await screen.node(), 'nx-conv-msg-row')[0].props!.style) as Vue.CSSProperties)?.minHeight).toBeUndefined();
  screen.app.accountBindingEpoch++; await flush(); expect((Vue.normalizeStyle(findAll(await screen.node(), 'nx-conv-msg-row')[0].props!.style) as Vue.CSSProperties)?.minHeight).toBeUndefined();
});

async function nativePreviewLoadFixture(two = false) {
  const src = 'https://fixture.invalid/load-frame';
  const screen = mount([message('image', 'left', { imageSrc: src }), ...(two ? [message('second-image', 'left', { imageSrc: src + '-second' })] : [])]);
  const host = initialFlowScroller(); screen.view.listHost.value = host;
  host.querySelectorAll = (selector?: string) => selector === '.nx-conv-msg-row'
    ? [{ getBoundingClientRect: () => ({ height: 220 }) }, { getBoundingClientRect: () => ({ height: 180 }) }] as any : [];
  vi.stubGlobal('uni', { previewImage: vi.fn() }); screen.view.openPreview(src);
  const oldImages = findAll(await screen.node(), 'nx-conv-image');
  const height = async (index = 0) => (Vue.normalizeStyle(findAll(await screen.node(), 'nx-conv-msg-row')[index].props!.style) as Vue.CSSProperties)?.minHeight;
  return { screen, src, oldImages, height };
}

it.each(['unavailable', 'replacement', 'same-url-new-frame'] as const)('native preview image load from an old VNode cannot release a current %s slot', async state => {
  const { screen, src, oldImages, height } = await nativePreviewLoadFixture(); screen.hide();
  screen.props.messages[0] = { ...screen.props.messages[0], imageSrc: undefined, imageLoading: true }; await flush();
  screen.show(); await activateExistingHumanPage(screen).activate(); await flush();
  if (state !== 'unavailable') {
    // Mutating the existing message also checks that the listener captures the
    // source/frame while rendering, rather than reading the old VNode's live object.
    screen.props.messages[0].imageSrc = state === 'replacement' ? src + '-new' : src;
    screen.props.messages[0].imageLoading = false; await flush();
  }
  oldImages[0].props!.onLoad(); await flush(); expect(await height()).toBe('220px');
  if (state !== 'unavailable') { findAll(await screen.node(), 'nx-conv-image')[0].props!.onLoad(); await flush(); expect(await height()).toBeUndefined(); }
});

it('native preview image load queued before a new hidden reservation cannot release that reservation', async () => {
  const { screen, src, height } = await nativePreviewLoadFixture(); screen.hide(); screen.show();
  await activateExistingHumanPage(screen).activate(); await flush();
  findAll(await screen.node(), 'nx-conv-image')[0].props!.onLoad();
  screen.view.openPreview(src); screen.hide(); screen.props.messages[0] = { ...screen.props.messages[0], imageSrc: undefined, imageLoading: true };
  await flush(); expect(await height()).toBe('220px');
});

it('native preview image loads from two current frames release both rows in the same turn', async () => {
  const { screen, height } = await nativePreviewLoadFixture(true); screen.hide(); screen.show();
  await activateExistingHumanPage(screen).activate(); await flush();
  findAll(await screen.node(), 'nx-conv-image').forEach(image => image.props!.onLoad()); await flush();
  expect(await height(0)).toBeUndefined(); expect(await height(1)).toBeUndefined();
});

it.each(['account', 'binding', 'composer', 'host'] as const)('native preview reading restore cannot cross %s ownership', async boundary => {
  const screen = mount([message('image', 'left', { imageSrc: 'https://fixture.invalid/image' })]), host = initialFlowScroller(); screen.view.listHost.value = host;
  host.querySelectorAll = (selector?: string) => selector === '.nx-conv-msg-row' ? [{ getBoundingClientRect: () => ({ height: 220 }) }] as any : [];
  host.scrollTop = 120; screen.view.onThreadScroll({ detail: { scrollTop: 120 } }); vi.stubGlobal('uni', { previewImage: vi.fn() });
  screen.view.openPreview('https://fixture.invalid/image'); screen.hide();
  if (boundary === 'account') screen.app.accountKey = 'user:other';
  if (boundary === 'binding') screen.app.accountBindingEpoch++;
  if (boundary === 'composer') screen.props.composerKey = 'conversation:B';
  const currentHost = boundary === 'host' ? initialFlowScroller() : host; screen.view.listHost.value = currentHost;
  screen.show(); await activateExistingHumanPage(screen).activate(); await flush(); expect(currentHost.scrollTop).toBe(450);
  expect((Vue.normalizeStyle(findAll(await screen.node(), 'nx-conv-msg-row')[0].props!.style) as Vue.CSSProperties)?.minHeight).toBeUndefined();
});

it('a failed native preview uses its existing overlay and cannot suppress a later ordinary reentry', async () => {
  const screen = mount([message('image', 'left', { imageSrc: 'https://fixture.invalid/image' })]), host = initialFlowScroller(); screen.view.listHost.value = host;
  host.scrollTop = 120; screen.view.onThreadScroll({ detail: { scrollTop: 120 } });
  vi.stubGlobal('uni', { previewImage: vi.fn((options: { fail: () => void }) => options.fail()) });
  screen.view.openPreview('https://fixture.invalid/image'); expect(screen.view.previewImage.value).toBe('https://fixture.invalid/image');
  screen.hide(); screen.show(); await activateExistingHumanPage(screen).activate(); await flush(); expect(host.scrollTop).toBe(450);
});

it.each([false, true])('native preview failure cannot expose a cleared current-owner private source, hidden=%s', async hidden => {
  let failed!: () => void; const screen = mount([message('image', 'left', { imageSrc: 'https://fixture.invalid/image' })]);
  screen.view.listHost.value = initialFlowScroller();
  vi.stubGlobal('uni', { previewImage: vi.fn((options: { fail: () => void }) => { failed = options.fail; }) });
  screen.view.openPreview('https://fixture.invalid/image'); if (hidden) screen.hide();
  screen.props.messages[0] = { ...screen.props.messages[0], imageSrc: undefined, imageError: true }; await flush(); failed();
  expect(screen.view.previewImage.value).toBe('');
});

it('a late native preview failure cannot expose the previous owner image', async () => {
  let failed!: () => void; const screen = mount([message('image')]); vi.stubGlobal('uni', { previewImage: vi.fn((options: { fail: () => void }) => { failed = options.fail; }) });
  screen.view.listHost.value = initialFlowScroller();
  screen.view.openPreview('https://fixture.invalid/image'); screen.app.accountBindingEpoch++; await flush(); failed();
  expect(screen.view.previewImage.value).toBe('');
});

it('disposed native preview callbacks cannot recreate the image overlay', () => {
  let failed!: () => void; const screen = mount([message('image')]); vi.stubGlobal('uni', { previewImage: vi.fn((options: { fail: () => void }) => { failed = options.fail; }) });
  screen.view.listHost.value = initialFlowScroller();
  screen.view.openPreview('https://fixture.invalid/image'); screen.stop(); failed(); expect(screen.view.previewImage.value).toBe('');
});

it('H5 preview remains a local overlay without native preview or native-return suppression', async () => {
  const screen = mount([message('image')], 0, {}, 'h5'), host = initialFlowScroller(); screen.view.listHost.value = host;
  host.scrollTop = 120; screen.view.onThreadScroll({ detail: { scrollTop: 120 } }); const previewImage = vi.fn(); vi.stubGlobal('uni', { previewImage });
  screen.view.openPreview('https://fixture.invalid/image'); expect(previewImage).not.toHaveBeenCalled(); expect(screen.view.previewImage.value).toBe('https://fixture.invalid/image');
  screen.view.closePreview(); expect(screen.view.previewImage.value).toBe(''); expect(host.scrollTop).toBe(120);
  screen.hide(); screen.show(); await activateExistingHumanPage(screen).activate(); await flush(); expect(host.scrollTop).toBe(450);
});

// Execute the installed UniApp methods which owned the stale transitionend in
// r18-reentry-scroll-trace.json. Only the DOM geometry/event target is replaced.
const makeUniScrollWriter = new Function('props2', 'main', 'content', `
  const realScrollX = { value: false }, realScrollY = { value: true };
  let __transitionEnd = () => {};
  ${[['scrollTo2', '_handleScroll'], ['_scrollTopChanged', '_scrollLeftChanged'], ['_transitionEnd', '_setRefreshState']]
    .map(([start, end]) => uniScrollSource.slice(uniScrollSource.indexOf('  function ' + start + '('), uniScrollSource.indexOf('  function ' + end + '('))).join('\n')}
  return _scrollTopChanged;
`);

it.each(['initial', 'reentry'] as const)('flow tail %s cannot retain a UniApp zero-target transition after reaching the latest message', async entry => {
  const screen = mount(Array.from({ length: 8 }, (_, i) => message(String(i + 1))));
  const host = Object.assign(initialFlowScroller(), { style: {}, offsetHeight: 681 });
  host.scrollHeight = 1166; screen.view.listHost.value = host;
  if (entry === 'reentry') {
    for (const length of [2001, 2000, 0]) { screen.view.onDraft({ detail: { value: '文'.repeat(length) } }); await flush(); }
    screen.hide(); screen.show(); screen.props.revealTick++;
  }
  screen.view.scrollToEnd(); await flush();
  const binding = findAll(await screen.node(), 'nx-conv-list')[0].props!;
  const props = { scrollWithAnimation: binding['scroll-with-animation'] };
  const content = Object.assign(new EventTarget(), { style: {} });
  const write = makeUniScrollWriter(props, { value: host }, { value: content });
  write(0); // the child still receives the earlier zero command
  screen.view.scrollToEnd(); await flush();
  props.scrollWithAnimation = findAll(await screen.node(), 'nx-conv-list')[0].props!['scroll-with-animation'];
  host.scrollHeight = 1131; host.scrollTop = host.scrollTop; // browser layout clamps the shrinking viewport content
  write(screen.view.scrollTop.value); // same-position writes do not cancel an older UniApp animation
  await vi.advanceTimersByTimeAsync(100); await flush();
  expect(host.scrollTop).toBe(450);
  content.dispatchEvent(new Event('transitionend'));
  screen.view.onThreadScroll({ detail: { scrollTop: host.scrollTop, scrollHeight: host.scrollHeight } });
  expect(host.scrollTop).toBe(450);
  expect(screen.view.scrollTop.value).toBe(450);
});

it('flow initial tail survives a prefix measurement before the first queued placement', async () => {
  const screen = mount(Array.from({ length: 8 }, (_, i) => message(String(i + 1))));
  const host = initialFlowScroller(); screen.view.listHost.value = host;
  screen.view.historyPrefixBaseline.value = 0;
  screen.view.scrollToEnd();
  screen.view.historyPrefixHeight.value = 93.39014434814452;
  await flush();
  expect(host.scrollTop).toBe(450);
  expect(screen.view.pendingPosition).toBeNull();
});

it('flow initial tail yields to a reader who scrolls before the queued placement', async () => {
  const screen = mount([message('old')]), host = initialFlowScroller();
  screen.view.listHost.value = host; screen.view.historyPrefixBaseline.value = 0;
  screen.view.scrollToEnd();
  host.scrollTop = 40; screen.view.onThreadScroll({ detail: { scrollTop: 40 } });
  screen.view.historyPrefixHeight.value = 93;
  await flush();
  expect(host.scrollTop).toBe(133); // preserve the chosen message position, not the tail
  await vi.advanceTimersByTimeAsync(100); expect(host.scrollTop).toBe(133);
});

it.each(['owner', 'host', 'hide', 'dispose'] as const)('flow initial tail cannot survive a stale %s boundary', async boundary => {
  const screen = mount([message('old')]), host = initialFlowScroller();
  screen.view.listHost.value = host; screen.view.historyPrefixBaseline.value = 0;
  screen.view.scrollToEnd();
  screen.view.historyPrefixHeight.value = 93;
  await Vue.nextTick(); // prefix transaction has captured the intent, but has not committed it
  if (boundary === 'owner') screen.app.accountBindingEpoch++;
  if (boundary === 'host') screen.view.listHost.value = initialFlowScroller();
  if (boundary === 'hide') screen.hide();
  if (boundary === 'dispose') screen.stop();
  await flush(); await vi.advanceTimersByTimeAsync(100);
  expect(host.scrollTop).toBe(0);
  expect(screen.view.pendingPosition).toBeNull();
});

it('flow initial tail keeps a reader after the initial placement has already completed', async () => {
  const screen = mount([message('old')]), host = initialFlowScroller();
  screen.view.listHost.value = host; screen.view.historyPrefixBaseline.value = 0;
  screen.view.scrollToEnd(); await flush(); expect(host.scrollTop).toBe(450);
  host.scrollTop = 40; screen.view.onThreadScroll({ detail: { scrollTop: 40 } });
  screen.view.historyPrefixHeight.value = 93; await flush();
  expect(host.scrollTop).toBe(133);
});

it('flow initial tail keeps the UniApp scroll binding current through a warm navigation and content shrink', async () => {
  const screen = mount(Array.from({ length: 16 }, (_, i) => message(String(i + 1))));
  const host = initialFlowScroller(); host.scrollHeight = 2140; host.clientHeight = 917;
  screen.view.listHost.value = host; screen.view.scrollToEnd(); await flush();
  expect(host.scrollTop).toBe(1223);
  // UniApp applies the scrollTop prop on its own mounted nextTick, before a
  // native scroll event necessarily reaches the thread. It must not read zero.
  expect(screen.view.scrollTop.value).toBe(1223);
  host.scrollHeight = 1679; host.clientHeight = 832;
  host.scrollTop = screen.view.scrollTop.value;
  expect(host.scrollTop).toBe(847);
  screen.view.onThreadScroll({ detail: { scrollTop: host.scrollTop } });
  await vi.advanceTimersByTimeAsync(100); await flush();
  expect(host.scrollTop).toBe(847); expect(screen.view.scrollTop.value).toBe(847);
});

it.each([zh, en, vietnamese])('glass length keeps complete 1999/2000/2001 drafts and its hint inside the existing surface', async copy => {
  const screen = mount(); screen.props.inputLimitHint = copy.conversations.messageTooLong;
  for (const length of [1799, 1800, 1999, 2000, 2001, 2000]) {
    const text = '文'.repeat(length); screen.view.onDraft({ detail: { value: text } }); await flush();
    const node = await screen.node(), surface = findAll(node, 'nx-conv-compose-field')[0];
    expect(screen.view.draft.value).toBe(text); expect(screen.view.canSend.value).toBe(length <= 2000);
    expect(findAll(surface, 'nx-conv-length')).toHaveLength(length >= 1800 ? 1 : 0);
    expect(findAll(surface, 'nx-conv-length--over')).toHaveLength(length > 2000 ? 1 : 0);
    expect(findAll(surface, 'nx-conv-send')).toHaveLength(1);
    expect(findAll(surface, 'nx-conv-input')[0].props?.maxlength).toBe(-1);
  }
  expect(screen.emit.mock.calls.some(call => call[0] === 'send')).toBe(false);
});

it('glass length remeasures both sides of the limit without ResizeObserver or a line-height change', async () => {
  const take = nativeMeasurements(), screen = mount([message('old')]);
  screen.view.onInputLines({ detail: { height: 144 } });
  for (const [length, height] of [[2000, 242], [2001, 274], [2000, 242]]) {
    screen.view.onDraft({ detail: { value: '文'.repeat(length) } }); await flush();
    take('.nx-conv-composer')([{ height }]); await flush();
    expect(screen.view.composerSpace.value).toBe(height);
    expect(screen.view.inputHeight.value).toBe(144);
  }
});

it('glass length shares its surface with the existing pure-text policy retry and preserves its action', async () => {
  const screen = mount(); screen.props.attachRetry = true;
  screen.view.onDraft({ detail: { value: '文'.repeat(2001) } });
  const surface = findAll(await screen.node(), 'nx-conv-compose-field')[0];
  const retry = findAll(surface, 'nx-conv-policy-retry');
  expect(retry).toHaveLength(1); expect(retry[0].props).toMatchObject({ role: 'button', tabindex: '0' });
  expect(visibleText(retry[0])).toBe(zh.conversations.image.retryPolicy);
  retry[0].props!.onClick(); expect(screen.emit).toHaveBeenLastCalledWith('retry-policy');
  expect(findAll(surface, 'nx-conv-length--over')).toHaveLength(1);
});

async function nativeFlowPrefix(height = 44, slots: Vue.Slots = {}) {
  const take = nativeMeasurements(), screen = mount([message('old')], 0, slots);
  screen.view.measureBubblePositions(); take('.nx-conv-list')([{ top: 0, height: 400 }, [], undefined]);
  screen.view.onThreadScroll({ detail: { scrollTop: 120, scrollHeight: 1000 } });
  screen.view.historyPrefixHost.value = {}; await flush();
  take('.nx-conv-history-content')([{ height }]); await flush();
  expect(screen.view.scrollTop.value).toBe(120); // adopting existing natural flow is not a new delta
  screen.view.onThreadScroll({ detail: { scrollTop: 120, scrollHeight: 1000 } });
  return { screen, take };
}

it.each(['invalid', 'empty', 'timeout'] as const)('flow prefix fallback exposes newly available history after an %s native measurement', async failure => {
  const available = Vue.ref(false);
  const { screen, take } = await nativeFlowPrefix(0, {
    'history-prefix': () => available.value ? [Vue.h('view', { role: 'button' }, 'Earlier messages')] : [],
  });
  expect(findAll(await screen.node(), 'nx-conv-history-prefix')[0].props?.style.height).toBe('0px');
  available.value = true; screen.props.historyContentKey = 'has-earlier'; await flush();
  const reply = take('.nx-conv-history-content');
  if (failure === 'timeout') await vi.advanceTimersByTimeAsync(501);
  else reply(failure === 'empty' ? [] : [{ height: NaN }]);
  await flush();
  const prefix = findAll(await screen.node(), 'nx-conv-history-prefix')[0];
  expect(prefix.props?.style.height).toBeUndefined();
  expect(prefix.props?.class).not.toContain('nx-conv-history-prefix--measured');
  expect(visibleText(prefix)).toContain('Earlier messages');
  expect(screen.view.scrollTop.value).toBe(120);
  expect(screen.view.pendingPosition).toBeNull();
  reply([{ height: 9999 }]); await flush(); // one failed request cannot later overwrite the fallback
  expect(findAll(await screen.node(), 'nx-conv-history-prefix')[0].props?.style.height).toBeUndefined();
  screen.props.historyContentKey = 'retry'; await flush();
  take('.nx-conv-history-content')([{ height: 88 }]); await flush();
  expect(findAll(await screen.node(), 'nx-conv-history-prefix')[0].props?.style.height).toBe('88px');
  expect(screen.view.scrollTop.value).toBe(120); // natural flow already owns this height
  screen.props.historyContentKey = 'notice'; await flush();
  take('.nx-conv-history-content')([{ height: 120 }]); await flush();
  expect(screen.view.scrollTop.value).toBe(152); // subsequent measured changes still compensate once
});

it('flow prefix fallback retains earlier measured compensation when natural flow is adopted again', async () => {
  const { screen, take } = await nativeFlowPrefix();
  screen.props.historyContentKey = 'notice'; await flush();
  take('.nx-conv-history-content')([{ height: 84 }]); await flush();
  expect(screen.view.scrollTop.value).toBe(160);
  screen.props.historyContentKey = 'unmeasurable'; await flush();
  take('.nx-conv-history-content')([{}]); await flush();
  screen.props.historyContentKey = 'retry'; await flush();
  take('.nx-conv-history-content')([{ height: 120 }]); await flush();
  expect(screen.view.scrollTop.value).toBe(160);
  screen.props.historyContentKey = 'notice-more'; await flush();
  take('.nx-conv-history-content')([{ height: 144 }]); await flush();
  expect(screen.view.scrollTop.value).toBe(184);
});

it.each(['same-owner', 'owner', 'host', 'hide', 'dispose'] as const)('flow prefix fallback cannot release a newer or inactive %s layout', async boundary => {
  const { screen, take } = await nativeFlowPrefix(44, { 'history-prefix': () => [Vue.h('view', 'Earlier messages')] });
  screen.props.historyContentKey = 'old-query'; await flush();
  const old = take('.nx-conv-history-content');
  await vi.advanceTimersByTimeAsync(250);
  if (boundary === 'same-owner') screen.props.historyContentKey = 'new-query';
  if (boundary === 'owner') screen.app.accountBindingEpoch++;
  if (boundary === 'host') screen.view.historyPrefixHost.value = {};
  if (boundary === 'hide') screen.hide();
  if (boundary === 'dispose') screen.stop();
  await flush();
  const active = boundary !== 'hide' && boundary !== 'dispose';
  if (active) take('.nx-conv-history-content')([{ height: 88 }]);
  old([{ height: NaN }]); await vi.advanceTimersByTimeAsync(501); await flush();
  const prefix = findAll(await screen.node(), 'nx-conv-history-prefix')[0];
  expect(prefix.props?.style.height).toBe(active ? '88px' : '44px');
  expect(prefix.props?.class).toContain('nx-conv-history-prefix--measured');
});

it('flow prefix preserves the reading position when notices resize without adding any messages', async () => {
  const { screen, take } = await nativeFlowPrefix();
  screen.props.historyContentKey = 'read-error'; await flush();
  take('.nx-conv-history-content')([{ height: 84 }]); await flush();
  expect(screen.view.scrollTop.value).toBe(160);
  screen.props.historyContentKey = 'retry-complete'; await flush();
  take('.nx-conv-history-content')([{ height: 0 }]); await flush();
  expect(screen.view.scrollTop.value).toBe(76);
  expect(screen.props.messages.map(m => m.id)).toEqual(['old']);
  expect(screen.view.pendingPosition).toBeNull();
});

it.each(['before', 'after'] as const)('flow prefix applies its shrink once when the height result arrives %s the prepend result', async order => {
  const { screen, take } = await nativeFlowPrefix();
  const prepared = screen.view.prepareHistoryPrepend();
  take('.nx-conv-content')([{ top: 0 }, { top: 86 }]); expect(await prepared).toBe(true); // slot 44 + old date 42
  screen.props.messages = [message('earlier'), ...screen.props.messages];
  screen.props.historyContentKey = 'last-page'; await flush();
  const post = take('.nx-conv-content'), slot = take('.nx-conv-history-content');
  if (order === 'after') { post([{ top: 0 }, { top: 244 }]); await flush(); }
  slot([{ height: 0 }]); await flush();
  if (order === 'before') {
    post([{ top: 0 }, { top: 244 }]); // stale geometry must not pay the old delta
    take('.nx-conv-content')([{ top: 0 }, { top: 200 }]); await flush();
  }
  expect(screen.view.scrollTop.value).toBe(234); // 120 + new prefix 200 - old prefix 86
  expect(screen.view.pendingPosition).toBeNull();
});

it('flow prefix coalesces the header, slot and prepend while retaining manual scroll', async () => {
  const { screen, take } = await nativeFlowPrefix();
  const prepared = screen.view.prepareHistoryPrepend();
  take('.nx-conv-content')([{ top: 0 }, { top: 44 }]); expect(await prepared).toBe(true);
  screen.props.messages = [message('earlier'), ...screen.props.messages]; await flush();
  const old = take('.nx-conv-content');
  screen.view.onThreadScroll({ detail: { scrollTop: 150, scrollHeight: 1000 } });
  screen.props.topInset = 106; screen.props.historyContentKey = 'notice-gone'; await flush();
  const header = take('.nx-conv-content');
  take('.nx-conv-history-content')([{ height: 0 }]); await flush();
  old([{ top: 0 }, { top: 9999 }]); header([{ top: 0 }, { top: 9999 }]);
  take('.nx-conv-content')([{ top: 0 }, { top: 306 }]); await flush();
  expect(screen.view.scrollTop.value).toBe(412); // 150 + 200 + 106 - 44
  expect(screen.view.pendingPosition).toBeNull();
});

it.each(['hide', 'owner', 'host', 'dispose', 'late', 'invalid'] as const)('flow prefix ignores a height from an obsolete or invalid %s measurement', async boundary => {
  const { screen, take } = await nativeFlowPrefix();
  screen.props.historyContentKey = 'changing'; await flush();
  const old = take('.nx-conv-history-content');
  if (boundary === 'hide') screen.hide();
  if (boundary === 'owner') screen.app.accountBindingEpoch++;
  if (boundary === 'host') screen.view.historyPrefixHost.value = {};
  if (boundary === 'dispose') screen.stop();
  if (boundary === 'late') await vi.advanceTimersByTimeAsync(501);
  old([{ height: boundary === 'invalid' ? NaN : 9999 }]); await flush();
  expect(screen.view.historyPrefixHeight.value).toBe(44);
  expect(screen.view.pendingPosition).toBeNull();
});

it.each([true, false])('glass length follows an expanding hint only if already reading the tail: %s', async tail => {
  const take = nativeMeasurements(), screen = mount([message('old')]);
  const host = { scrollTop: tail ? 600 : 120, scrollHeight: 1000, clientHeight: 400, querySelectorAll: () => [] };
  screen.view.listHost.value = host; screen.view.onThreadScroll({ detail: { scrollTop: host.scrollTop } });
  screen.view.onDraft({ detail: { value: '文'.repeat(2000) } }); await flush();
  take('.nx-conv-composer')([{ height: 242 }]); await flush();
  screen.view.onDraft({ detail: { value: '文'.repeat(2001) } }); await flush();
  take('.nx-conv-composer')([{ height: 274 }]); await flush();
  expect(screen.view.composerSpace.value).toBe(274);
  expect(host.scrollTop).toBe(tail ? 1000 : 120);
  expect(screen.view.draft.value.length).toBe(2001);
});

it.each([
  ['failed', true, 2], ['failed', false, 0], ['tracking', false, 0], ['processing', false, 0], ['queued', true, 2],
] as const)('shows revision actions only for allowed queue entries: %s editable=%s', async (state, editable, count) => {
  const screen = mount([message('queue-item', 'right', { queue: { turnId: 'original-turn', state, editable, label: 'Queue state' } })]);
  const actions = findAll(await screen.node(), 'nx-conv-queue-action');
  expect(actions).toHaveLength(count);
  if (count) {
    expect(actions.map(visibleText)).toEqual([zh.nova.queue.edit, zh.nova.queue.cancel]);
    actions[0].props!.onClick(); expect(screen.emit).toHaveBeenLastCalledWith('queue-action', 'original-turn', 'edit');
    actions[1].props!.onClick(); expect(screen.emit).toHaveBeenLastCalledWith('queue-action', 'original-turn', 'cancel');
  }
});

it('retains the typed queue edit when a failed save leaves the parent in editing state', async () => {
  const row = message('queue-item', 'right', { queue: { turnId: 'original-turn', state: 'editing', editable: true, label: 'Editing' } });
  const screen = mount([row]);
  screen.view.onEditInput('original-turn', { detail: { value: 'Corrected question' } });
  screen.view.saveQueueEdit(row);
  expect(screen.emit).toHaveBeenLastCalledWith('queue-save', 'original-turn', 'Corrected question');
  screen.props.messages = [{ ...row, queue: { ...row.queue! } }]; await flush();
  const editor = findAll(await screen.node(), 'nx-conv-edit-input')[0];
  expect(editor.props!.value).toBe('Corrected question');
  screen.view.saveQueueEdit(screen.props.messages[0]);
  expect(screen.emit.mock.calls.filter(([event]) => event === 'queue-save'))
    .toEqual([['queue-save', 'original-turn', 'Corrected question'], ['queue-save', 'original-turn', 'Corrected question']]);
});

it.each([zh, en, vietnamese])('keeps time inside each bubble and shows delivery status only inside the outgoing bubble', async copy => {
  const timestamp = new Date(2026, 9, 26, 18, 57).getTime(), longText = 'Long '.repeat(50);
  const screen = mount([message('out', 'right', { timestamp, receipt: copy.conversations.receiptSent, meta: 'External outgoing author' }),
    message('in', 'left', { timestamp, receipt: copy.conversations.receiptRead, text: longText, meta: 'External incoming author' }),
    message('unknown', 'left', { timestamp, meta: 'External unknown author' }),
    message('system', 'left', { tone: 'system', receipt: 'invalid system receipt' })]);
  const node = await screen.node(), bubbles = findAll(node, 'nx-conv-bubble');
  expect(bubbles).toHaveLength(3);
  for (const bubble of bubbles) expect(visibleText(bubble)).toContain('18:57');
  expect(findAll(bubbles[0], 'nx-conv-receipt')).toHaveLength(1);
  expect(findAll(bubbles[1], 'nx-conv-receipt')).toHaveLength(0);
  expect(findAll(bubbles[2], 'nx-conv-receipt')).toHaveLength(0);
  expect(findAll(node, 'nx-conv-receipt')).toHaveLength(1);
  expect(findAll(node, 'nx-conv-message-meta')).toHaveLength(0);
  expect(visibleText(bubbles[1])).toContain(longText);
  expect(visibleText(node)).not.toContain('External');
});

it.each(['queued tick', 'queued timer', 'late observer'] as const)('does not restart bubble measurements after disposal through %s', async trigger => {
  nativeMeasurements();
  const query = vi.spyOn(uni, 'createSelectorQuery');
  const screen = mount([message('old')]);
  if (trigger === 'queued tick') screen.props.revealTick++;
  if (trigger === 'queued timer') screen.view.scheduleBubblePositions();
  screen.stop();
  if (trigger === 'late observer') {
    screen.view.scheduleBubblePositions();
    screen.view.measureBubblePositions();
  }
  await flush();
  await vi.advanceTimersByTimeAsync(32);
  expect(query).not.toHaveBeenCalled();
});

it('does not animate initial history, async history snapshots or history pagination', async () => {
  const screen = mount([message('old')]);
  expect(screen.view.entranceBindings(screen.props.messages[0]).class).toBeUndefined();
  screen.props.entranceReady = false; screen.props.messages = [message('old'), message('history-tail', 'left')]; await flush();
  screen.props.entranceReady = true; await flush();
  expect(findAll(await screen.node(), 'nx-conv-enter-left')).toHaveLength(0);
  screen.props.messages = [message('older', 'left'), ...screen.props.messages]; await flush();
  expect(screen.view.entranceBindings(screen.props.messages[0]).class).toBeUndefined();
});

it('seeds an atomic history completion and still animates the next truly live first message', async () => {
  const state = Vue.reactive({ identity: 'same', visible: true, ready: false, messages: [] as ThreadMsg[] });
  const scope = Vue.effectScope(), entrance = scope.run(() => useConversationEntrance(() => state))!;
  cleanups.push(() => scope.stop());
  state.ready = true; state.messages = [message('history', 'left')]; await flush();
  expect(entrance.entranceBindings(state.messages[0]).class).toBeUndefined();
  state.messages = [...state.messages, message('live')]; await flush();
  expect(entrance.entranceBindings(state.messages[1]).class).toBe('nx-conv-enter-right');
});

it('does not animate atomic hidden-to-visible history, even when identity stays the same', async () => {
  const state = Vue.reactive({ identity: 'same', visible: false, ready: true, messages: [] as ThreadMsg[] });
  const scope = Vue.effectScope(), entrance = scope.run(() => useConversationEntrance(() => state))!;
  cleanups.push(() => scope.stop());
  state.visible = true; state.messages = [message('history', 'left')]; await flush();
  expect(entrance.entranceBindings(state.messages[0]).class).toBeUndefined();
});

it('allows the first real send after an empty session has finished becoming ready', async () => {
  const state = Vue.reactive({ identity: 'empty', visible: true, ready: false, messages: [] as ThreadMsg[] });
  const scope = Vue.effectScope(), entrance = scope.run(() => useConversationEntrance(() => state))!;
  cleanups.push(() => scope.stop());
  state.ready = true; await flush(); state.messages = [message('first-send')]; await flush();
  expect(entrance.entranceBindings(state.messages[0]).class).toBe('nx-conv-enter-right');
});

it('animates first outgoing and incoming live IDs in opposite directions and expires each independently', async () => {
  const screen = mount(); screen.props.messages = [message('out')]; await flush();
  expect(findAll(await screen.node(), 'nx-conv-enter-right')).toHaveLength(1);
  screen.props.messages = [...screen.props.messages, message('in', 'left')]; await flush();
  expect(findAll(await screen.node(), 'nx-conv-enter-left')).toHaveLength(1);
  vi.advanceTimersByTime(201); await flush();
  expect(findAll(await screen.node(), 'nx-conv-enter-right')).toHaveLength(0);
  expect(findAll(await screen.node(), 'nx-conv-enter-left')).toHaveLength(0);
});

it('does not replay same-ID failed-send retry, receipt updates or removed-then-restored IDs', async () => {
  const screen = mount(); screen.props.messages = [message('same', 'right', { queue: {
    turnId: 'turn', state: 'failed', label: zh.nova.queue.failed, editable: true,
  } })]; await flush(); vi.advanceTimersByTime(201);
  screen.props.messages[0].queue!.state = 'queued'; screen.props.messages[0].queue!.label = zh.nova.queue.ready; await flush();
  expect(screen.view.entranceBindings(screen.props.messages[0]).class).toBeUndefined();
  screen.props.messages = []; await flush(); screen.props.messages = [message('same', 'right', { receipt: 'Read' })]; await flush();
  expect(screen.view.entranceBindings(screen.props.messages[0]).class).toBeUndefined();
});

it.each(['sent', 'read'] as const)('animates a new pending human send once, then replaces it with canonical %s without a second entrance', async status => {
  const screen = mount([message('history', 'left')]);
  const pending = message('pending-human:1:1', 'right', { text: 'Original request', localSend: true,
    timestamp: Date.now(), deliveryState: 'sending' });
  screen.props.messages.push(pending); await flush();
  expect(findAll(await screen.node(), 'nx-conv-enter-right')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(201);
  for (const deliveryState of ['unknown', 'sending', 'failed', 'sending'] as const) {
    screen.props.messages[1].deliveryState = deliveryState; await flush();
    expect(findAll(await screen.node(), 'nx-conv-enter-right')).toHaveLength(0);
  }
  screen.props.messages = [screen.props.messages[0], message('server-101', 'right', {
    text: pending.text, timestamp: pending.timestamp, deliveryState: status })];
  await flush();
  expect(findAll(await screen.node(), 'nx-conv-enter-right')).toHaveLength(0);
  expect(screen.sound.play).not.toHaveBeenCalled();
  screen.props.messages.push(message('next-pending', 'right', { localSend: true, deliveryState: 'sending' })); await flush();
  expect(findAll(await screen.node(), 'nx-conv-enter-right')).toHaveLength(1);
});

it.each(['atomic', 'store-before-outbox'] as const)('retains the mounted bubble and remaining entrance for a fast %s acknowledgement', async sequence => {
  const screen = mount([message('history', 'left')]);
  const pending = message('pending-fast', 'right', { localSend: true, deliveryState: 'sending' });
  screen.props.messages.push(pending); await flush();
  const key = screen.view.messageKey(pending);
  await vi.advanceTimersByTimeAsync(12);
  const confirmed = message('server-fast', 'right', { deliveryState: 'sent' });
  if (sequence === 'store-before-outbox') {
    screen.props.messages = [screen.props.messages[0], confirmed, pending]; await flush();
    expect(screen.view.messageKey(confirmed)).toBe('server-fast');
  }
  screen.props.messages = [screen.props.messages[0], confirmed]; await flush();
  expect(screen.view.messageKey(confirmed)).toBe(key);
  expect(findAll(await screen.node(), 'nx-conv-enter-right')).toHaveLength(1);
  expect(screen.sound.play).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(187); await flush();
  expect(findAll(await screen.node(), 'nx-conv-enter-right')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(2); await flush();
  expect(findAll(await screen.node(), 'nx-conv-enter-right')).toHaveLength(0);
  expect(screen.view.messageKey(confirmed)).toBe(key);
});

it.each(['atomic', 'incoming-first', 'store-before-outbox'] as const)('continues a quick acknowledgement while animating a simultaneous incoming reply: %s', async sequence => {
  const screen = mount([message('history', 'left')]);
  screen.props.messages.push(message('pending-fast', 'right', { localSend: true })); await flush();
  const history = screen.props.messages[0], pending = screen.props.messages[1];
  const confirmed = message('confirmed'), incoming = message('incoming', 'left');
  if (sequence === 'store-before-outbox') {
    screen.props.messages = [history, confirmed, incoming, pending]; await flush();
    expect(findAll(await screen.node(), 'nx-conv-enter-left')).toHaveLength(1);
    expect(screen.sound.play).toHaveBeenCalledExactlyOnceWith('receive');
  }
  screen.props.messages = sequence === 'incoming-first' ? [history, incoming, confirmed] : [history, confirmed, incoming]; await flush();
  const node = await screen.node();
  expect(screen.view.messageKey(confirmed)).toBe('pending-fast');
  expect(findAll(node, 'nx-conv-enter-right')).toHaveLength(1);
  expect(findAll(node, 'nx-conv-enter-left')).toHaveLength(1);
  expect(screen.sound.play).toHaveBeenCalledExactlyOnceWith('receive');
});

it('does not merge ambiguous outgoing replacements or carry visual aliases into another conversation', async () => {
  const screen = mount([message('history', 'left')]);
  screen.props.messages.push(message('pending', 'right', { localSend: true })); await flush();
  screen.props.messages = [screen.props.messages[0], message('a'), message('b')]; await flush();
  expect(screen.view.messageKey(screen.props.messages[1])).toBe('a');
  expect(screen.view.messageKey(screen.props.messages[2])).toBe('b');
  screen.props.messages.push(message('pending-next', 'right', { localSend: true })); await flush();
  screen.props.messages = [...screen.props.messages.slice(0, -1), message('server-next')]; await flush();
  expect(screen.view.messageKey(screen.props.messages.at(-1))).toBe('pending-next');
  screen.props.composerKey = 'conversation:B'; await flush();
  expect(screen.view.messageKey(screen.props.messages.at(-1))).toBe('server-next');
  expect(findAll(await screen.node(), 'nx-conv-enter-right')).toHaveLength(0);
});

it.each(['queued', 'sending', 'failed', 'unknown', 'sent', 'read'] as const)('renders an accessible %s status icon and permits retry only for unresolved local sends', async deliveryState => {
  const original = message('pending-original', 'right', { text: 'Original text', localSend: true, deliveryState });
  const screen = mount([original]), node = await screen.node();
  const receipts = findAll(node, 'nx-conv-receipt'); expect(receipts).toHaveLength(1);
  const receipt = receipts[0], retryable = deliveryState === 'failed' || deliveryState === 'unknown';
  expect(receipt.props!['data-state']).toBe(deliveryState);
  expect(receipt.props!['aria-label']).toContain(zh.conversations.delivery[deliveryState]);
  expect(receipt.props!.role).toBe(retryable ? 'button' : 'img');
  expect(receipt.props!.tabindex).toBe(retryable ? 0 : undefined);
  expect((receipt.children as Vue.VNode[]).find(child => Vue.isVNode(child) && typeof child.type === 'object')?.props?.state).toBe(deliveryState);
  expect(findAll(node, 'nx-conv-receipt-t')).toHaveLength(0);
  for (const activation of ['click', 'Enter', ' ']) {
    screen.emit.mockClear();
    if (activation === 'click') receipt.props!.onClick();
    else for (const handler of receipt.props!.onKeydown) handler({ key: activation, repeat: false, preventDefault: vi.fn() });
    expect(screen.emit.mock.calls.filter(call => call[0] === 'retry-message')).toHaveLength(retryable ? 1 : 0);
    expect(screen.emit.mock.calls.some(call => call[0] === 'send')).toBe(false);
    expect(screen.props.messages[0]).toEqual(original);
  }
  screen.props.canRetrySend = false;
  screen.emit.mockClear();
  const blocked = findAll(await screen.node(), 'nx-conv-receipt')[0]; blocked.props!.onClick();
  expect(blocked.props!.role).toBe('img'); expect(blocked.props!.tabindex).toBeUndefined();
  expect(screen.emit).not.toHaveBeenCalled();
});

it.each(['account', 'binding', 'conversation', 'return'] as const)('does not replay history across %s or let an old animation event end a new entry', async boundary => {
  const screen = mount(); screen.props.messages = [message('id')]; await flush();
  const old = screen.view.entranceBindings(screen.props.messages[0]);
  if (boundary === 'account') screen.app.accountKey = 'user:8';
  if (boundary === 'binding') screen.app.accountBindingEpoch++;
  if (boundary === 'conversation') screen.props.composerKey = 'conversation:B';
  if (boundary === 'return') { screen.hide(); await flush(); screen.show(); screen.props.revealTick++; }
  await flush(); expect(screen.view.entranceBindings(screen.props.messages[0]).class).toBeUndefined();
  screen.props.messages = [...screen.props.messages, message('new', 'left')]; await flush();
  const target = {}; old.onAnimationend({ target, currentTarget: target });
  expect(screen.view.entranceBindings(screen.props.messages[1]).class).toBe('nx-conv-enter-left');
});

it('keeps one failed queue retry icon inside its outgoing bubble', async () => {
  const screen = mount([message('failed', 'right', { queue: { turnId: 'turn-1', state: 'failed', label: 'Send failed', editable: false } })]);
  const node = await screen.node(), receipts = findAll(node, 'nx-conv-receipt');
  expect(receipts).toHaveLength(1); expect(receipts[0].props!.role).toBe('button');
  expect(findAll(findAll(node, 'nx-conv-bubble')[0], 'nx-conv-receipt')).toHaveLength(1);
  expect(receipts[0].props!['aria-label']).toContain(zh.conversations.delivery.failed);
  expect(findAll(node, 'nx-conv-receipt-t')).toHaveLength(0);
  receipts[0].props!.onClick();
  expect(screen.emit).toHaveBeenCalledWith('queue-action', 'turn-1', 'retry');
});

it('preserves send-blocking, draft restore and attachment retry semantics', async () => {
  const screen = mount([message('attachment', 'left', { imageError: true, imageAttachmentId: 'ATT-1' })]);
  screen.view.onDraft({ detail: { value: 'Original draft' } }); screen.props.sendBlocked = true; screen.view.onSend();
  expect(screen.emit.mock.calls.some(call => call[0] === 'send')).toBe(false);
  screen.props.sendBlocked = false; screen.view.onSend();
  const sent = screen.emit.mock.calls.find(call => call[0] === 'send')!;
  expect(sent[1]).toBe('Original draft'); sent[2](); expect(screen.view.draft.value).toBe('Original draft');
  findAll(await screen.node(), 'nx-conv-image-open')[0].props!.onClick();
  expect(screen.emit).toHaveBeenCalledWith('retry-image', 'ATT-1');
});

it.each(['existing', 'new'] as const)('keeps the rendered %s composer private across same-account and A to B to A rebinding', async kind => {
  const screen = mount();
  for (const account of ['user:7', 'user:8', 'user:7']) {
    const input = findAll(await screen.node(), 'nx-conv-input')[0]; input.props!.onInput({ detail: { value: 'Private draft' } });
    screen.app.accountKey = account; screen.app.accountBindingEpoch++;
    screen.props.composerKey = screen.app.accountBindingEpoch + ':0:' + (kind === 'existing' ? 'CV-same' : 'support');
    await flush(); expect(findAll(await screen.node(), 'nx-conv-input')[0].props!.value).toBe('');
  }
});

it('retains the reading anchor when history prepends, including a simultaneous new tail, and cancels delayed bottom scrolling', async () => {
  const screen = mount([message('old-1'), message('old-2', 'left')]);
  let prefix = 0, reads = 0;
  const host = { scrollTop: 220, scrollHeight: 1000, clientHeight: 400, querySelectorAll: () => [],
    querySelector: (selector: string) => ({ getBoundingClientRect: () => ({ top: selector === '.nx-conv-content' ? 0 : reads++ === 0 ? 0 : prefix }) }) };
  screen.view.listHost.value = host; screen.view.scrollToEnd();
  prefix = 300; host.scrollHeight = 1400;
  screen.props.messages = [message('older'), ...screen.props.messages, message('new-tail', 'left')]; await flush();
  expect(host.scrollTop).toBe(520); expect(screen.view.scrollTop.value).toBe(520);
  expect(findAll(await screen.node(), 'nx-conv-list')[0].props!['scroll-with-animation']).toBe(false);
  vi.advanceTimersByTime(100); await flush(); expect(host.scrollTop).toBe(520);
});

it('preserves native history offsets using scoped row measurements and ignores stale measurements', async () => {
  const pending: Array<(rows: unknown[]) => void> = [], selectors: string[] = [];
  const query: Record<string, any> = { in: vi.fn(() => query), select: (selector: string) => { selectors.push(selector); return query; },
    boundingClientRect: () => query, exec: (done: (rows: unknown[]) => void) => pending.push(done) };
  vi.stubGlobal('uni', { createSelectorQuery: () => query });
  const screen = mount([message('old/1')]); screen.view.onThreadScroll({ detail: { scrollTop: 150 } });
  const ready = screen.view.prepareHistoryPrepend(); pending.shift()!([{ top: 10 }, { top: 10 }]); await ready;
  screen.props.messages = [message('older'), ...screen.props.messages]; await flush();
  pending.shift()!([{ top: 10 }, { top: 310 }]); expect(screen.view.scrollTop.value).toBe(450);
  expect(selectors).toContain('#' + screen.view.messageRowId('old/1'));
  const next = screen.view.prepareHistoryPrepend(); pending.shift()!([{ top: 10 }, { top: 10 }]); await next;
  screen.props.messages = [message('oldest'), ...screen.props.messages]; await flush();
  const stale = pending.shift()!; screen.props.composerKey = 'conversation:B'; await flush();
  stale([{ top: 10 }, { top: 9999 }]); expect(screen.view.scrollTop.value).toBe(450);
});

it('reapplies an identical native history target after the user scrolls back between two pages', async () => {
  const pending: Array<(rows: unknown[]) => void> = [];
  const query: Record<string, any> = { in: () => query, select: () => query,
    boundingClientRect: () => query, exec: (done: (rows: unknown[]) => void) => pending.push(done) };
  vi.stubGlobal('uni', { createSelectorQuery: () => query });
  const screen = mount([message('old')]);
  let nativeTop = 150;
  const applied: number[] = [];
  const stop = Vue.watch(screen.view.scrollTop, value => { nativeTop = Number(value); applied.push(nativeTop); });
  cleanups.push(stop);
  for (const id of ['older', 'oldest']) {
    nativeTop = 150;
    screen.view.onThreadScroll({ detail: { scrollTop: nativeTop } }); await flush();
    const ready = screen.view.prepareHistoryPrepend(); pending.shift()!([{ top: 10 }, { top: 10 }]); await ready;
    screen.props.messages = [message(id), ...screen.props.messages]; await flush();
    pending.shift()!([{ top: 10 }, { top: 310 }]); await flush();
    expect(nativeTop).toBe(450);
  }
  expect(applied.filter(top => top === 450)).toHaveLength(2);
});

it('retains the bubble anchor when a prepended page removes its previous leading time divider', async () => {
  const pending: Array<(rows: unknown[]) => void> = [];
  const query: Record<string, any> = { in: () => query, select: () => query,
    boundingClientRect: () => query, exec: (done: (rows: unknown[]) => void) => pending.push(done) };
  vi.stubGlobal('uni', { createSelectorQuery: () => query });
  const screen = mount([message('old')]); screen.view.onThreadScroll({ detail: { scrollTop: 150 } });
  const prepared = screen.view.prepareHistoryPrepend();
  pending.shift()!([{ top: 0 }, { top: 42 }]); await prepared;
  screen.props.messages = [message('older'), ...screen.props.messages]; await flush();
  pending.shift()!([{ top: 0 }, { top: 300 }]); await flush();
  expect(screen.view.scrollTop.value).toBe(408); // 150 + 300 - old 42px date header
});

it.each(['timeout', 'empty', 'invalid', 'hidden', 'binding', 'superseded'] as const)('does not authorize native prepend when the previous anchor is %s', async failure => {
  const pending: Array<(rows: unknown[]) => void> = [];
  const query: Record<string, any> = { in: () => query, select: () => query,
    boundingClientRect: () => query, exec: (done: (rows: unknown[]) => void) => pending.push(done) };
  vi.stubGlobal('uni', { createSelectorQuery: () => query });
  const screen = mount([message('old')]); screen.view.onThreadScroll({ detail: { scrollTop: 150 } });
  const preparing = screen.view.prepareHistoryPrepend(), oldRead = pending.shift()!;
  if (failure === 'empty') oldRead([]);
  if (failure === 'invalid') oldRead([{ top: 0 }, { top: NaN }]);
  if (failure === 'hidden') { screen.hide(); oldRead([{ top: 0 }, { top: 42 }]); }
  if (failure === 'binding') { screen.app.accountBindingEpoch++; oldRead([{ top: 0 }, { top: 42 }]); }
  if (failure === 'superseded') {
    const latest = screen.view.prepareHistoryPrepend(); pending.shift()!([{ top: 0 }, { top: 42 }]);
    expect(await latest).toBe(true); oldRead([{ top: 0 }, { top: 999 }]);
  }
  await vi.advanceTimersByTimeAsync(501);
  expect(await preparing).toBe(false);
  if (failure === 'timeout') oldRead([{ top: 0 }, { top: 999 }]);
  expect(screen.view.scrollTop.value).toBe(150); expect(screen.props.messages.map(m => m.id)).toEqual(['old']);
  if (failure === 'superseded') {
    screen.props.messages = [message('older'), ...screen.props.messages]; await flush();
    pending.shift()!([{ top: 0 }, { top: 300 }]); await flush();
    expect(screen.view.scrollTop.value).toBe(408);
  }
});

it('accepts a measured native zero prefix and retries after a failed measurement', async () => {
  const pending: Array<(rows: unknown[]) => void> = [];
  const query: Record<string, any> = { in: () => query, select: () => query,
    boundingClientRect: () => query, exec: (done: (rows: unknown[]) => void) => pending.push(done) };
  vi.stubGlobal('uni', { createSelectorQuery: () => query });
  const screen = mount([message('old')]); screen.view.onThreadScroll({ detail: { scrollTop: 150 } });
  const failed = screen.view.prepareHistoryPrepend(); pending.shift()!([]); await vi.advanceTimersByTimeAsync(501);
  expect(await failed).toBe(false);
  const retry = screen.view.prepareHistoryPrepend(); pending.shift()!([{ top: 0 }, { top: 0 }]); expect(await retry).toBe(true);
  screen.props.messages = [message('older'), ...screen.props.messages]; await flush();
  pending.shift()!([{ top: 0 }, { top: 300 }]); await flush(); expect(screen.view.scrollTop.value).toBe(450);
});

it.each([true, false])('keeps the latest bubble above a growing composer only when reading the tail: %s', async atTail => {
  const screen = mount([message('old'), message('latest')]);
  const host = { scrollTop: atTail ? 600 : 120, scrollHeight: 1000, clientHeight: 400, querySelectorAll: () => [] };
  screen.view.listHost.value = host;
  screen.view.onInputLines({ detail: { height: 120 } });
  await flush(); await vi.advanceTimersByTimeAsync(100);
  expect(host.scrollTop).toBe(atTail ? 1000 : 120);
  if (atTail) expect(findAll(await screen.node(), 'nx-conv-list')[0].props!['scroll-with-animation']).toBe(false);
});

it.each([false, true])('preserves the history position or tail through header growth and shrinkage (at tail: %s)', async atTail => {
  const screen = mount([message('old'), message('latest')]);
  let position = atTail ? 600 : 120;
  const host = { scrollHeight: 1000, clientHeight: 400, querySelectorAll: () => [],
    get scrollTop() { return position; },
    set scrollTop(value: number) { position = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); } };
  screen.view.listHost.value = host;
  screen.view.onThreadScroll({ detail: { scrollTop: position } });
  // Vue patches the padded content after the component's pre-flush geometry watch.
  cleanups.push(Vue.watch(() => screen.props.topInset, (height, previous) => {
    host.scrollHeight += height - previous;
  }, { flush: 'post' }));
  const contentY = () => 400 + screen.props.topInset - host.scrollTop;
  const originalY = contentY();
  for (const inset of [106, 0]) {
    screen.props.topInset = inset; await flush(); await vi.advanceTimersByTimeAsync(100);
    expect(host.scrollTop).toBe((atTail ? 600 : 120) + inset);
    if (atTail) expect(host.scrollHeight - host.clientHeight - host.scrollTop).toBe(0);
    else expect(contentY()).toBe(originalY);
    expect(findAll(await screen.node(), 'nx-conv-list')[0].props!['scroll-with-animation']).toBe(false);
  }
});

it('does not count a header adjustment twice when prepared native history is prepended', async () => {
  const take = nativeMeasurements(), screen = mount([message('old'), message('latest')]);
  screen.view.measureBubblePositions(); take('.nx-conv-list')([{ top: 0, height: 400 }, [], undefined]);
  screen.view.onThreadScroll({ detail: { scrollTop: 120, scrollHeight: 1000 } });
  const prepared = screen.view.prepareHistoryPrepend();
  take('.nx-conv-content')([{ top: 0 }, { top: 0 }]); expect(await prepared).toBe(true);
  screen.props.topInset = 106; await flush();
  expect(screen.view.scrollTop.value).toBe(226);
  screen.props.messages = [message('earlier'), ...screen.props.messages]; await flush();
  take('.nx-conv-content')([{ top: 0 }, { top: 306 }]); await flush();
  expect(screen.view.scrollTop.value).toBe(426);
});

it('rejects in-flight history preparation across a header resize and allows a fresh measurement', async () => {
  const take = nativeMeasurements(), screen = mount([message('old')]);
  screen.view.measureBubblePositions(); take('.nx-conv-list')([{ top: 0, height: 400 }, [], undefined]);
  screen.view.onThreadScroll({ detail: { scrollTop: 120, scrollHeight: 1000 } });
  const pending = screen.view.prepareHistoryPrepend(), older = take('.nx-conv-content');
  screen.props.topInset = 106; await flush();
  older([{ top: 0 }, { top: 0 }]); expect(await pending).toBe(false);
  const retry = screen.view.prepareHistoryPrepend();
  take('.nx-conv-content')([{ top: 0 }, { top: 106 }]); expect(await retry).toBe(true);
});

async function preparedNativeHistory(inset = 0) {
  const take = nativeMeasurements(), screen = mount([message('old')]);
  screen.props.topInset = inset; await flush();
  screen.view.measureBubblePositions(); take('.nx-conv-list')([{ top: 0, height: 400 }, [], undefined]);
  screen.view.onThreadScroll({ detail: { scrollTop: 120, scrollHeight: 1000 } });
  const prepared = screen.view.prepareHistoryPrepend();
  take('.nx-conv-content')([{ top: 0 }, { top: inset }]);
  expect(await prepared).toBe(true);
  return { screen, take };
}

it.each([
  { first: 'messages', from: 0, to: 106 }, { first: 'inset', from: 0, to: 106 },
  { first: 'messages', from: 106, to: 0 }, { first: 'inset', from: 106, to: 0 },
])('[HISTORY-R18-P2-01] preserves the total anchor delta with $first first and inset $from -> $to in one flush', async ({ first, from, to }) => {
  const { screen, take } = await preparedNativeHistory(from);
  const prepended = [message('earlier', 'left'), ...screen.props.messages];
  // Both mutations belong to one render; awaiting between them hides the race.
  if (first === 'messages') { screen.props.messages = prepended; screen.props.topInset = to; }
  else { screen.props.topInset = to; screen.props.messages = prepended; }
  await flush();
  const rows = [{ top: 0 }, { top: 200 + to }];
  take('.nx-conv-content')(rows); await flush();
  // Allow an implementation to remeasure after coalescing the layout changes.
  take.replyAll('.nx-conv-content', rows); await flush();
  expect(screen.view.scrollTop.value).toBe(120 + 200 + to - from);
  expect(200 + to - screen.view.scrollTop.value).toBe(from - 120);
  await vi.advanceTimersByTimeAsync(100);
  expect(screen.view.scrollTop.value).toBe(120 + 200 + to - from);
});

it.each([{ from: 0, to: 106 }, { from: 106, to: 0 }])(
  '[HISTORY-R18-P2-01] keeps the anchor when inset $from -> $to changes while the post-prepend measurement is pending', async ({ from, to }) => {
    const { screen, take } = await preparedNativeHistory(from);
    screen.props.messages = [message('earlier', 'left'), ...screen.props.messages]; await flush();
    const afterPrepend = take('.nx-conv-content');
    screen.props.topInset = to; await flush();
    const rows = [{ top: 0 }, { top: 200 + to }];
    afterPrepend(rows); await flush();
    take.replyAll('.nx-conv-content', rows); await flush();
    expect(screen.view.scrollTop.value).toBe(120 + 200 + to - from);
  },
);

it.each(['account', 'conversation', 'hide', 'return'] as const)(
  '[HISTORY-R18-P2-01] rejects a pending post-prepend callback immediately after %s', async boundary => {
    const { screen, take } = await preparedNativeHistory();
    screen.props.messages = [message('earlier', 'left'), ...screen.props.messages]; await flush();
    const afterPrepend = take('.nx-conv-content');
    if (boundary === 'account') screen.app.accountKey = 'user:8';
    if (boundary === 'conversation') screen.props.composerKey = 'conversation:B';
    if (boundary === 'hide' || boundary === 'return') screen.hide();
    if (boundary === 'return') screen.show();
    const top = screen.view.scrollTop.value;
    // The native callback can arrive before owner-change watchers are flushed.
    afterPrepend([{ top: 0 }, { top: 9999 }]);
    expect(screen.view.scrollTop.value).toBe(top);
  },
);

function humanHistoryLoader(screen: ReturnType<typeof mount>) {
  const script = chatSource.split('<script setup lang="ts">')[1].split('</script>')[0];
  const parsed = ts.createSourceFile('chat.ts', script, ts.ScriptTarget.Latest, true);
  const fn = parsed.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'loadEarlierHumanHistory')!;
  const busy = Vue.ref(false), warn = vi.fn();
  let page = 0;
  const loadEarlier = vi.fn(async (_id: string, _current: () => boolean) => {
    screen.props.messages = [message('page-' + ++page), ...screen.props.messages];
    if (page === 1) screen.props.topInset = 106;
  });
  const env = { conversationThread: Vue.ref(screen.view), supportSessionReady: Vue.ref(true), humanEarlierBusy: busy,
    humanHistoryRetryBusy: Vue.ref(false), cid: Vue.ref('A'), humanRealtime: { capture: () => ({ id: 'A', epoch: 1 }), isCurrent: () => true },
    humanHistory: Vue.ref([{ id: 'A', historyNextCursor: 1 }]), convStore: { loadEarlierThread: loadEarlier }, toast: { warn },
    t: Vue.ref({ security: { opFailed: 'Failed' } }) };
  const load = new Function('env', `const { ${Object.keys(env).join(',')} } = env; const historyRetryGeneration = 0;
    ${transpile(fn.getText(parsed))}; return loadEarlierHumanHistory;`)(env) as () => Promise<void>;
  return { load, busy, warn, loadEarlier };
}

it.each(['before-final', 'after-final'] as const)(
  '[HISTORY-R18-REVIEW] keeps both real parent pages and the header delta when an old callback repeats %s', async order => {
    const take = nativeMeasurements(), screen = mount([message('old')]), parent = humanHistoryLoader(screen);
    screen.view.onThreadScroll({ detail: { scrollTop: 120 } });
    const first = parent.load();
    take('.nx-conv-content')([{ top: 0 }, { top: 0 }]); await first; await flush();
    expect(parent.busy.value).toBe(false);
    const firstPost = take('.nx-conv-content');
    const second = parent.load(); await flush();
    firstPost([{ top: 0 }, { top: 306 }]); await flush();
    take('.nx-conv-content')([{ top: 0 }, { top: 106 }]); await second; await flush();
    const secondPost = take('.nx-conv-content');
    if (order === 'before-final') firstPost([{ top: 0 }, { top: 9999 }]);
    secondPost([{ top: 0 }, { top: 306 }]); await flush();
    if (order === 'after-final') firstPost([{ top: 0 }, { top: 9999 }]);
    expect(parent.loadEarlier.mock.calls.map(call => call[0])).toEqual(['A', 'A']);
    expect(parent.warn).not.toHaveBeenCalled();
    expect(screen.view.scrollTop.value).toBe(626); // 120 + 200 + 106 + 200
    expect(screen.view.pendingPosition).toBeNull();
  },
);

it.each(['ref', 'element'] as const)(
  '[HISTORY-R18-REVIEW] rejects a preparation from a replaced list %s and measures the new host', async kind => {
    const take = nativeMeasurements(), screen = mount([message('old')]);
    screen.view.listHost.value = { $el: {} };
    screen.view.onThreadScroll({ detail: { scrollTop: 120 } });
    const first = screen.view.prepareHistoryPrepend(), old = take('.nx-conv-content');
    if (kind === 'ref') screen.view.listHost.value = { $el: {} };
    else screen.view.listHost.value.$el = {};
    old([{ top: 0 }, { top: 42 }]);
    expect(await first).toBe(false);
    const retry = screen.view.prepareHistoryPrepend();
    take('.nx-conv-content')([{ top: 0 }, { top: 0 }]); expect(await retry).toBe(true);
    screen.props.messages = [message('earlier'), ...screen.props.messages]; await flush();
    take('.nx-conv-content')([{ top: 0 }, { top: 200 }]); await flush();
    expect(screen.view.scrollTop.value).toBe(320);
  },
);

it('[HISTORY-R18-REVIEW] carries manual scroll changes through the wait between two real parent pages', async () => {
  const take = nativeMeasurements(), screen = mount([message('old')]), parent = humanHistoryLoader(screen);
  screen.view.onThreadScroll({ detail: { scrollTop: 120 } });
  const first = parent.load();
  take('.nx-conv-content')([{ top: 0 }, { top: 0 }]); await first; await flush();
  const firstPost = take('.nx-conv-content');
  const second = parent.load();
  screen.view.onThreadScroll({ detail: { scrollTop: 170 } });
  firstPost([{ top: 0 }, { top: 306 }]); await flush();
  expect(screen.view.scrollTop.value).toBe(476);
  screen.view.onThreadScroll({ detail: { scrollTop: 446 } });
  take('.nx-conv-content')([{ top: 0 }, { top: 106 }]); await second; await flush();
  take('.nx-conv-content')([{ top: 0 }, { top: 306 }]); await flush();
  expect(screen.view.scrollTop.value).toBe(646); // 120 + user 50 - user 30 + both pages 400 + header 106
});

it.each(['empty', 'nan', 'timeout'] as const)(
  '[HISTORY-R18-REVIEW] bounds the real parent waiting for an %s first post-measurement and permits its retry', async failure => {
    const take = nativeMeasurements(), screen = mount([message('old')]), parent = humanHistoryLoader(screen);
    screen.view.onThreadScroll({ detail: { scrollTop: 120 } });
    const first = parent.load();
    take('.nx-conv-content')([{ top: 0 }, { top: 0 }]); await first; await flush();
    const firstPost = take('.nx-conv-content');
    const second = parent.load(); await flush();
    expect(parent.busy.value).toBe(true); expect(screen.view.pendingPosition).not.toBeNull();
    if (failure === 'empty') firstPost([]);
    if (failure === 'nan') firstPost([{ top: 0 }, { top: NaN }]);
    await vi.advanceTimersByTimeAsync(600); await second;
    expect(parent.busy.value).toBe(false); expect(parent.loadEarlier).toHaveBeenCalledTimes(1);
    expect(parent.warn).toHaveBeenCalledOnce(); expect(screen.view.pendingPosition).toBeNull();
    expect(screen.view.scrollTop.value).toBe(120);
    const retry = parent.load();
    take('.nx-conv-content')([{ top: 0 }, { top: 106 }]); await retry; await flush();
    take('.nx-conv-content')([{ top: 0 }, { top: 306 }]); await flush();
    expect(parent.loadEarlier).toHaveBeenCalledTimes(2);
    expect(screen.view.scrollTop.value).toBe(320); // Preserve the current viewport; never invent the missing first delta.
  },
);

it('[HISTORY-R18-REVIEW] discards an authorized prefix if the host changes while its page is loading', async () => {
  const { screen, take } = await preparedNativeHistory();
  screen.view.listHost.value = { $el: {} };
  screen.props.messages = [message('earlier'), ...screen.props.messages]; await flush();
  expect(screen.view.preparedHistory).toBeNull();
  expect(screen.view.pendingPosition).toBeNull();
  expect(screen.view.scrollTop.value).toBe(120); // There is no measured baseline for the replacement host.
  take.replyAll('.nx-conv-content', [{ top: 0 }, { top: 9999 }]);
  expect(screen.view.scrollTop.value).toBe(120);
});

it.each(['empty', 'nan', 'timeout'] as const)(
  '[HISTORY-R18-REVIEW] releases an %s post-measurement without jumping, then restores explicit tail following', async failure => {
    const { screen, take } = await preparedNativeHistory();
    screen.props.messages = [message('earlier'), ...screen.props.messages]; await flush();
    const post = take('.nx-conv-content');
    if (failure === 'empty') post([]);
    if (failure === 'nan') post([{ top: 0 }, { top: NaN }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(screen.view.pendingPosition).toBeNull();
    expect(screen.view.scrollTop.value).toBe(120);
    // Remaining in history must not turn a failed measurement into a tail jump.
    screen.view.onInputLines({ detail: { height: 120 } }); await flush();
    take.replyAll('.nx-conv-composer', [{ height: 182 }]); await flush();
    expect(screen.view.scrollTop.value).toBe(120); expect(screen.view.scrollAnchor.value).toBe('');
    screen.view.onThreadScroll({ detail: { scrollTop: 800, scrollHeight: 1200 } });
    screen.view.onInputLines({ detail: { height: 144 } }); await flush();
    take.replyAll('.nx-conv-composer', [{ height: 206 }]); await flush();
    expect(screen.view.composerSpace.value).toBe(206);
    expect(screen.view.scrollAnchor.value).toBe('nx-conv-end');
    post([{ top: 0 }, { top: 9999 }]);
    expect(screen.view.scrollTop.value).toBe(800);
  },
);

it.each(['empty', 'nan', 'timeout'] as const)(
  '[HISTORY-R18-REVIEW] permits a fresh transaction after %s and rejects old post results during it', async failure => {
    const { screen, take } = await preparedNativeHistory();
    screen.props.messages = [message('earlier'), ...screen.props.messages]; await flush();
    const old = take('.nx-conv-content');
    if (failure === 'empty') old([]);
    if (failure === 'nan') old([{ top: 0 }, { top: NaN }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(screen.view.pendingPosition).toBeNull();
    const retry = screen.view.prepareHistoryPrepend();
    take('.nx-conv-content')([{ top: 0 }, { top: 0 }]); expect(await retry).toBe(true);
    screen.props.messages = [message('oldest'), ...screen.props.messages]; await flush();
    const current = take('.nx-conv-content');
    old([{ top: 0 }, { top: 9999 }]);
    expect(screen.view.pendingPosition).not.toBeNull(); expect(screen.view.scrollTop.value).toBe(120);
    current([{ top: 0 }, { top: 200 }]); await flush();
    expect(screen.view.pendingPosition).toBeNull(); expect(screen.view.scrollTop.value).toBe(320);
  },
);

it('[HISTORY-R18-REVIEW] bounds the whole pending transaction even when layout changes keep superseding queries', async () => {
  const { screen, take } = await preparedNativeHistory();
  screen.props.messages = [message('earlier'), ...screen.props.messages]; await flush();
  const old = take('.nx-conv-content');
  await vi.advanceTimersByTimeAsync(400);
  screen.props.topInset = 106; await flush();
  const newer = take('.nx-conv-content');
  await vi.advanceTimersByTimeAsync(101);
  expect(screen.view.pendingPosition).toBeNull();
  old([{ top: 0 }, { top: 9999 }]); newer([{ top: 0 }, { top: 9999 }]);
  expect(screen.view.scrollTop.value).toBe(120);
});

it.each(['account', 'host', 'hide', 'dispose'] as const)(
  '[HISTORY-R18-REVIEW] releases the second preparation on %s while the first post-measurement is pending', async boundary => {
    const { screen, take } = await preparedNativeHistory();
    screen.props.messages = [message('earlier'), ...screen.props.messages]; await flush();
    const old = take('.nx-conv-content');
    const second = screen.view.prepareHistoryPrepend();
    if (boundary === 'account') screen.app.accountKey = 'user:8';
    if (boundary === 'host') screen.view.listHost.value = {};
    if (boundary === 'hide') screen.hide();
    if (boundary === 'dispose') screen.stop();
    await vi.advanceTimersByTimeAsync(600);
    expect(await second).toBe(false);
    expect(screen.view.pendingPosition).toBeNull();
    old([{ top: 0 }, { top: 9999 }]);
    expect(screen.view.scrollTop.value).toBe(120);
  },
);

it('rebinds the composer ResizeObserver to a replacement host and measures its subsequent resize', async () => {
  const observers: Array<{ notify: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn(); disconnect = vi.fn();
    constructor(notify: () => void) { observers.push({ notify, observe: this.observe, disconnect: this.disconnect }); }
  });
  const screen = mount([message('latest')]);
  const first = { getBoundingClientRect: () => ({ height: 86 }) };
  screen.view.composerHost.value = first; await flush();
  expect(observers).toHaveLength(1); expect(observers[0].observe).toHaveBeenCalledWith(screen.view.composerHost.value);
  expect(screen.view.composerSpace.value).toBe(86);
  screen.view.composerHost.value = null; await flush();
  expect(observers[0].disconnect).toHaveBeenCalledOnce();
  let height = 130;
  const replacement = { getBoundingClientRect: () => ({ height }) };
  screen.view.composerHost.value = replacement; await flush();
  expect(observers).toHaveLength(2); expect(observers[1].observe).toHaveBeenCalledWith(screen.view.composerHost.value);
  expect(screen.view.composerSpace.value).toBe(130);
  height = 220; observers[1].notify(); await flush();
  expect(screen.view.composerSpace.value).toBe(220);
  expect(observers[0].observe).toHaveBeenCalledOnce();
  screen.stop(); expect(observers[1].disconnect).toHaveBeenCalledOnce();
});

it('keeps the newest native composer height when the older 220px result follows the 86px result', async () => {
  const take = nativeMeasurements(), screen = mount([message('latest')]);
  screen.view.measureComposer(false); await flush();
  const older = take('.nx-conv-composer');
  screen.view.measureComposer(false); await flush();
  const newer = take('.nx-conv-composer');
  newer([{ height: 86 }]); await flush();
  expect(screen.view.composerMeasured.value).toBe(true);
  expect(findAll(await screen.node(), 'nx-conv-content')[0].props?.style.paddingBottom).toBe('86px');
  older([{ height: 220 }]); await flush();
  expect(findAll(await screen.node(), 'nx-conv-content')[0].props?.style.paddingBottom).toBe('86px');
});

it.each(['hide', 'return', 'dispose', 'account', 'binding', 'conversation', 'reveal'] as const)(
  'rejects a native composer measurement from before %s', async boundary => {
    const take = nativeMeasurements(), screen = mount([message('latest')]);
    screen.view.measureComposer(false); await flush();
    take('.nx-conv-composer')([{ height: 112 }]);
    screen.view.measureComposer(false); await flush();
    const older = take('.nx-conv-composer');
    if (boundary === 'hide' || boundary === 'return') screen.hide();
    if (boundary === 'return') screen.show();
    if (boundary === 'dispose') screen.stop();
    if (boundary === 'account') screen.app.accountKey = 'user:8';
    if (boundary === 'binding') screen.app.accountBindingEpoch++;
    if (boundary === 'conversation') screen.props.composerKey = 'conversation:B';
    if (boundary === 'reveal') screen.props.revealTick++;
    await flush(); older([{ height: 220 }]); await flush();
    expect(screen.view.composerSpace.value).toBe(112);
    if (boundary === 'return') {
      screen.view.measureComposer(false); await flush();
      take('.nx-conv-composer')([{ height: 86 }]);
      expect(screen.view.composerSpace.value).toBe(86);
    }
  },
);

it('accepts a late composer height without following after the reader has left the tail', async () => {
  const take = nativeMeasurements(), screen = mount([message('old'), message('latest')]);
  const host = { scrollTop: 600, scrollHeight: 1000, clientHeight: 400, querySelectorAll: () => [] };
  screen.view.listHost.value = host;
  screen.view.onThreadScroll({ detail: { scrollTop: 600 } });
  screen.view.measureComposer(); await flush();
  const measured = take('.nx-conv-composer');
  host.scrollTop = 120; screen.view.onThreadScroll({ detail: { scrollTop: 120 } });
  measured([{ height: 220 }]); await flush(); await vi.advanceTimersByTimeAsync(100);
  expect(screen.view.composerSpace.value).toBe(220);
  expect(host.scrollTop).toBe(120);
  expect(screen.view.scrollTop.value).toBe(120);
});

it('does not apply the 90ms DOM tail correction after the reader scrolls back into history', async () => {
  const screen = mount([message('old'), message('latest')]);
  const host = { scrollTop: 600, scrollHeight: 1000, clientHeight: 400, querySelectorAll: () => [] };
  screen.view.listHost.value = host;
  screen.view.scrollToEnd(); await flush();
  expect(host.scrollTop).toBe(1000);
  host.scrollTop = 120; screen.view.onThreadScroll({ detail: { scrollTop: 120 } });
  await vi.advanceTimersByTimeAsync(89); expect(host.scrollTop).toBe(120);
  await vi.advanceTimersByTimeAsync(1); await flush();
  expect(host.scrollTop).toBe(120);
  expect(screen.view.scrollTop.value).toBe(120);
});

it('does not reissue a native scroll anchor at 90ms after the reader leaves the tail', async () => {
  const take = nativeMeasurements(), screen = mount([message('old'), message('latest')]);
  screen.view.measureBubblePositions();
  take('.nx-conv-list')([{ top: 0, height: 400 }, [], undefined]);
  screen.view.onThreadScroll({ detail: { scrollTop: 600, scrollHeight: 1000 } });
  screen.view.scrollToEnd(); await flush();
  expect(screen.view.scrollAnchor.value).toBe('nx-conv-end');
  const anchorChanges = vi.fn();
  cleanups.push(Vue.watch(screen.view.scrollAnchor, anchorChanges, { flush: 'sync' }));
  screen.view.onThreadScroll({ detail: { scrollTop: 120, scrollHeight: 1000 } });
  await vi.advanceTimersByTimeAsync(90); await flush();
  // Reassigning '' and then the same end ID still commands a native jump.
  expect(anchorChanges).not.toHaveBeenCalled();
  expect(screen.view.scrollTop.value).toBe(120);
});

it.each(['incoming', 'typing'] as const)('follows passive %s only when already reading the tail', async update => {
  const screen = mount([message('old'), message('latest')]);
  const host = { scrollTop: 120, scrollHeight: 1000, clientHeight: 400, querySelectorAll: () => [] };
  screen.view.listHost.value = host;
  screen.view.onThreadScroll({ detail: { scrollTop: 120 } });
  const append = (id: string) => {
    if (update === 'incoming') screen.props.messages = [...screen.props.messages, message(id, 'left')];
    else screen.props.typing = true;
    host.scrollHeight += 100;
  };
  append('incoming-in-history'); await flush(); await vi.advanceTimersByTimeAsync(100);
  expect(host.scrollTop).toBe(120);
  expect(screen.view.scrollTop.value).toBe(120);
  screen.props.typing = false; await flush();
  host.scrollTop = host.scrollHeight - host.clientHeight;
  screen.view.onThreadScroll({ detail: { scrollTop: host.scrollTop } });
  append('incoming-at-tail'); await flush(); await vi.advanceTimersByTimeAsync(100);
  expect(host.scrollTop).toBe(host.scrollHeight);
});

it('reveals an explicit send from history even though passive incoming messages did not move the reader', async () => {
  const screen = mount([message('old'), message('latest')]);
  const host = { scrollTop: 120, scrollHeight: 1000, clientHeight: 400, querySelectorAll: () => [] };
  screen.view.listHost.value = host;
  screen.view.onThreadScroll({ detail: { scrollTop: 120 } });
  screen.props.messages = [...screen.props.messages, message('incoming', 'left')]; host.scrollHeight = 1100;
  await flush(); await vi.advanceTimersByTimeAsync(100); expect(host.scrollTop).toBe(120);
  screen.view.onDraft({ detail: { value: 'My reply' } }); await flush();
  screen.view.onSend();
  expect(screen.emit).toHaveBeenCalledWith('send', 'My reply', expect.any(Function), expect.any(Function));
  screen.props.messages = [...screen.props.messages, message('pending-reply', 'right', { text: 'My reply', localSend: true, deliveryState: 'sending' })];
  host.scrollHeight = 1200; await flush(); await vi.advanceTimersByTimeAsync(100);
  expect(host.scrollTop).toBe(1200);
});

it.each(['left', 'right'] as const)('measures the %s bubble rim through DOMRect prototype getters and clears it when distant', side => {
  const screen = mount([message('near-rim', side)]);
  const bubbleRect = Object.create({ get top() { return 550; }, get left() { return 80; },
    get width() { return 220; }, get height() { return 42; } });
  expect(Object.keys(bubbleRect)).toEqual([]);
  const bubble = { getBoundingClientRect: vi.fn(() => bubbleRect) };
  const root = { getBoundingClientRect: () => ({ top: 0, left: 0, width: 360, height: 760 }),
    querySelectorAll: vi.fn(() => [bubble]) };
  let fieldTop = 600;
  const field = { getBoundingClientRect: () => ({ top: fieldTop, left: 20, width: 320, height: 44 }) };
  const composer = { querySelector: vi.fn(() => field) };
  screen.view.listHost.value = root; screen.view.composerHost.value = composer;
  screen.view.measureBubblePositions();
  expect(root.querySelectorAll).toHaveBeenCalledWith('.nx-conv-bubble');
  expect(composer.querySelector).toHaveBeenCalledWith('.nx-conv-compose-field');
  expect(bubble.getBoundingClientRect).toHaveBeenCalledOnce();
  expect(screen.view.composerLight.value.strength).toBeGreaterThan(.95);
  fieldTop = 900; screen.view.measureBubblePositions();
  expect(screen.view.composerLight.value.strength).toBe(0);
});

const nearbyReflectionRows = () => [{ top: 0, height: 760 }, [{ top: 550, left: 80, width: 220, height: 42 }],
  { top: 600, left: 20, width: 320, height: 44 }];

it.each(['account', 'binding', 'conversation', 'reveal', 'list-host', 'composer-host', 'hide', 'return'] as const)(
  '[REFLECTION-R18-P2-01] rejects the old native light and colour callback before the %s post-flush', async boundary => {
    const take = nativeMeasurements(), screen = mount([message('out')]);
    screen.view.listHost.value = { nativeId: 'list:A' };
    screen.view.composerHost.value = { nativeId: 'composer:A' }; await flush();
    screen.view.measureBubblePositions(); const stale = take('.nx-conv-list');
    expect(screen.view.composerLight.value.strength).toBe(0);
    if (boundary === 'account') screen.app.accountKey = 'user:8';
    if (boundary === 'binding') screen.app.accountBindingEpoch++;
    if (boundary === 'conversation') screen.props.composerKey = 'conversation:B';
    if (boundary === 'reveal') screen.props.revealTick++;
    if (boundary === 'list-host') screen.view.listHost.value = { nativeId: 'list:B' };
    if (boundary === 'composer-host') screen.view.composerHost.value = { nativeId: 'composer:B' };
    if (boundary === 'hide' || boundary === 'return') screen.hide();
    if (boundary === 'return') screen.show();
    // No nextTick: the bridge returns while the post watcher is still queued.
    stale(nearbyReflectionRows());
    expect.soft(screen.view.composerLight.value.strength).toBe(0);
    expect.soft(screen.view.bubblePositions.value).toEqual({});
    if (boundary === 'hide') screen.show();
    await flush();
    screen.view.measureBubblePositions(); take('.nx-conv-list')(nearbyReflectionRows());
    expect(screen.view.composerLight.value.strength).toBeGreaterThan(.95);
    expect(screen.view.bubblePositions.value.out).toBeGreaterThan(0);
  },
);

it.each(['owner', 'list-host', 'composer-host', 'hide'] as const)(
  '[REFLECTION-R18-P2-01] clears an already sampled light and colour synchronously on %s change', async boundary => {
    const take = nativeMeasurements(), screen = mount([message('out')]);
    screen.view.listHost.value = { nativeId: 'list:A' };
    screen.view.composerHost.value = { nativeId: 'composer:A' }; await flush();
    screen.view.measureBubblePositions(); take('.nx-conv-list')(nearbyReflectionRows());
    expect(screen.view.composerLight.value.strength).toBeGreaterThan(.95);
    expect(screen.view.bubblePositions.value.out).toBeGreaterThan(0);
    if (boundary === 'owner') { screen.app.accountKey = 'user:8'; screen.props.composerKey = 'conversation:B'; }
    if (boundary === 'list-host') screen.view.listHost.value = { nativeId: 'list:B' };
    if (boundary === 'composer-host') screen.view.composerHost.value = { nativeId: 'composer:B' };
    if (boundary === 'hide') screen.hide();
    expect.soft(screen.view.composerLight.value.strength).toBe(0);
    expect.soft(screen.view.bubblePositions.value).toEqual({});
  },
);

it('renders date/gap markers independently of precise per-message times and does not animate a clock refresh', async () => {
  const day = new Date(2026, 9, 26, 0, 0).getTime(); vi.setSystemTime(day + 3600000);
  const screen = mount([message('one', 'left', { timestamp: day + 60000, meta: 'Support' }),
    message('two', 'right', { timestamp: day + 120000, meta: 'You' }),
    message('three', 'left', { timestamp: day + 420000, meta: 'Support' })]);
  expect(findAll(await screen.node(), 'nx-conv-time-divider')).toHaveLength(1);
  expect(screen.view.timeGroups.value.one).toContain('今天');
  expect(findAll(await screen.node(), 'nx-conv-message-time').map(visibleText)).toEqual(['00:01', '00:02', '00:07']);
  vi.setSystemTime(new Date(2026, 9, 27, 0, 1)); screen.hide(); screen.show(); await flush();
  expect(screen.view.timeGroups.value.one).toContain('昨天');
  screen.props.timeLocale = 'vi'; await flush();
  expect(screen.view.timeGroups.value.one).toContain('Hôm qua');
  expect(findAll(await screen.node(), 'nx-conv-message-time').map(visibleText)).toEqual(['00:01', '00:02', '00:07']);
  expect(findAll(await screen.node(), 'nx-conv-enter-left')).toHaveLength(0);
});

it('labels a fresh arrival as today between clock ticks without hiding a genuinely future timestamp', async () => {
  const start = new Date(2026, 9, 26, 14, 0).getTime(); vi.setSystemTime(start);
  const screen = mount(); vi.setSystemTime(start + 20_000);
  screen.props.messages = [message('live', 'left', { timestamp: start + 20_000 })]; await flush();
  expect(screen.view.timeGroups.value.live).toBe('今天 14:00');
  screen.props.messages = [...screen.props.messages, message('future', 'left', { timestamp: start + 86_420_000 })]; await flush();
  expect(screen.view.timeGroups.value.future).toContain('2026/10/27');
});

it('disables unavailable image input without a visible caption while text sending and policy recovery remain usable', async () => {
  const screen = mount(); screen.props.attachDisabled = true; screen.props.attachUnavailable = 'Images unavailable';
  let node = await screen.node(); const attach = findAll(node, 'nx-conv-attach-trigger')[0];
  expect(attach.props?.['aria-disabled']).toBe('true'); expect(attach.props?.tabindex).toBe(-1);
  expect(attach.props?.style.opacity).toBe(0.45); expect(attach.props?.['aria-label']).toContain('Images unavailable');
  attach.props!.onClick(); expect(screen.emit).not.toHaveBeenCalledWith('attach');
  expect(findAll(node, 'nx-conv-policy-caption')).toHaveLength(0);
  expect(findAll(node, 'nx-conv-policy-retry')).toHaveLength(0);
  screen.view.onDraft({ detail: { value: 'Text still works' } }); screen.view.onSend();
  expect(screen.emit).toHaveBeenCalledWith('send', 'Text still works', expect.any(Function), expect.any(Function));
  screen.props.attachRetry = true; node = await screen.node();
  findAll(node, 'nx-conv-policy-retry')[0].props!.onClick();
  expect(screen.emit).toHaveBeenCalledWith('retry-policy');
});

it('makes valid send the primary action and gives one bounded tap response without enabling duplicate sends', async () => {
  const screen = mount(); let button = findAll(await screen.node(), 'nx-conv-send')[0];
  expect(button.props?.['aria-disabled']).toBe(true); expect(button.props?.tabindex).toBe(-1);
  button.props!.onClick(); expect(screen.view.sendFeedback.value).toBe(false);
  screen.view.onDraft({ detail: { value: 'Ready to send' } }); button = findAll(await screen.node(), 'nx-conv-send')[0];
  expect(String(button.props?.class)).toContain('nx-conv-send--ready'); expect(button.props?.tabindex).toBe(0);
  button.props!.onClick(); button.props!.onClick();
  expect(screen.emit.mock.calls.filter(call => call[0] === 'send')).toHaveLength(1);
  expect(screen.view.sendFeedback.value).toBe(true); expect(screen.view.canSend.value).toBe(false);
  await vi.advanceTimersByTimeAsync(221); expect(screen.view.sendFeedback.value).toBe(false);
  screen.view.onDraft({ detail: { value: 'Second' } }); screen.view.onSend(); screen.hide();
  expect(screen.view.sendFeedback.value).toBe(false); await vi.advanceTimersByTimeAsync(221);
  expect(screen.view.sendFeedback.value).toBe(false);
});

it('has linear bounded motion, a reduced-motion override and only local inset shadows', () => {
  const css = descriptor.styles.find(style => style.scoped)!.content;
  expect(css).toContain('180ms linear both'); expect(css).toContain('translateX(-12px)'); expect(css).toContain('translateX(12px)');
  expect(css).toMatch(/@media\(prefers-reduced-motion:reduce\)[\s\S]*?animation:none; transform:none; opacity:1/);
  expect(css).toMatch(/\.nx-conv-thread \.nx-conv-cta-row, \.nx-conv-thread \.nx-conv-chip \{ --v5-liquid-shadow: inset 0 1px 0 var\(--v5-border\)/);
});

it('holds the plane until the matching send settles, then returns even on a fast acknowledgement', async () => {
  const screen = mount();
  screen.view.onDraft({ detail: { value: 'Pending acknowledgement' } }); screen.view.onSend();
  const settle = screen.emit.mock.calls.find(call => call[0] === 'send')![3];
  await vi.advanceTimersByTimeAsync(1000);
  expect(screen.view.sendTurning.value).toBe(true);
  expect(screen.view.sendFeedback.value).toBe(false);
  settle(); await vi.advanceTimersByTimeAsync(1);
  expect(screen.view.sendTurning.value).toBe(false);
  screen.view.onDraft({ detail: { value: 'Fast acknowledgement' } }); screen.view.onSend();
  screen.emit.mock.calls.filter(call => call[0] === 'send').at(-1)![3]();
  await vi.advanceTimersByTimeAsync(159); expect(screen.view.sendTurning.value).toBe(true);
  await vi.advanceTimersByTimeAsync(1); expect(screen.view.sendTurning.value).toBe(false);
});

it.each(['hide', 'account', 'conversation', 'dispose'])('discards a late plane completion and draft restore after %s', async boundary => {
  const screen = mount(); screen.view.onDraft({ detail: { value: 'Old text' } }); screen.view.onSend();
  const [, , restore, settle] = screen.emit.mock.calls.find(call => call[0] === 'send')!;
  if (boundary === 'hide') screen.hide();
  else if (boundary === 'account') screen.app.accountBindingEpoch++;
  else if (boundary === 'conversation') screen.props.composerKey = 'conversation:B';
  else screen.stop();
  await flush(); expect(screen.view.sendTurning.value).toBe(false);
  screen.view.onDraft({ detail: { value: 'New text' } }); restore(); settle();
  await vi.advanceTimersByTimeAsync(500);
  expect(screen.view.draft.value).toBe('New text'); expect(screen.view.sendTurning.value).toBe(false);
});

it('does not let an earlier send completion reset a later plane turn', async () => {
  const screen = mount();
  screen.view.onDraft({ detail: { value: 'First' } }); screen.view.onSend();
  const first = screen.emit.mock.calls.find(call => call[0] === 'send')![3];
  screen.view.onDraft({ detail: { value: 'Second' } }); screen.view.onSend();
  const second = screen.emit.mock.calls.filter(call => call[0] === 'send').at(-1)![3];
  first(); await vi.advanceTimersByTimeAsync(400); expect(screen.view.sendTurning.value).toBe(true);
  second(); await vi.advanceTimersByTimeAsync(1); expect(screen.view.sendTurning.value).toBe(false);
});

it('uses post-flush success revisions for sound, with callbacks affecting only button motion', async () => {
  const screen = mount();
  screen.view.onDraft({ detail: { value: 'Hello' } }); screen.view.onSend();
  const settled = screen.emit.mock.calls.find(call => call[0] === 'send')![3];
  settled(true); settled(true); expect(screen.sound.play).not.toHaveBeenCalled();
  screen.props.sendSuccessRevision++;
  expect(screen.sound.play).not.toHaveBeenCalled(); await flush();
  expect(screen.sound.play).toHaveBeenCalledExactlyOnceWith('send');
  screen.props.sendSuccessRevision = 1; await flush(); expect(screen.sound.play).toHaveBeenCalledOnce();
  screen.view.onDraft({ detail: { value: 'Failed' } }); screen.view.onSend();
  screen.emit.mock.calls.filter(call => call[0] === 'send').at(-1)![3](false);
  expect(screen.sound.play).toHaveBeenCalledOnce();
  screen.view.onDraft({ detail: { value: 'Left page' } }); screen.view.onSend(); screen.hide();
  screen.emit.mock.calls.filter(call => call[0] === 'send').at(-1)![3](true);
  expect(screen.sound.play).toHaveBeenCalledOnce();
});

it('sounds for concurrent successes more than 400ms apart even after the button has a newer send epoch', async () => {
  const screen = mount();
  for (const text of ['First', 'Second']) { screen.view.onDraft({ detail: { value: text } }); screen.view.onSend(); }
  const [first, second] = screen.emit.mock.calls.filter(call => call[0] === 'send').map(call => call[3]);
  first(true); screen.props.sendSuccessRevision++; await flush();
  expect(screen.sound.play).toHaveBeenCalledExactlyOnceWith('send');
  expect(screen.view.sendTurning.value).toBe(true);
  await vi.advanceTimersByTimeAsync(401);
  second(true); screen.props.sendSuccessRevision++; await flush();
  expect(screen.sound.play.mock.calls).toEqual([['send'], ['send']]);
  first(true); second(true); await flush(); expect(screen.sound.play).toHaveBeenCalledTimes(2);
});

it('sounds for retry success without a send-button callback and for first creation despite its composer-key change', async () => {
  const screen = mount();
  screen.props.sendSuccessRevision++; await flush(); // Icon retry has no button completion callback.
  expect(screen.emit).not.toHaveBeenCalledWith('send');
  expect(screen.sound.play).toHaveBeenCalledExactlyOnceWith('send');
  await vi.advanceTimersByTimeAsync(401);
  screen.props.composerKey = 'conversation:created-first'; screen.props.sendSuccessRevision++; await flush();
  expect(screen.sound.play.mock.calls).toEqual([['send']]);
  screen.props.sendSuccessOwner = JSON.stringify([screen.app.accountKey, screen.app.accountBindingEpoch, screen.props.composerKey]);
  screen.props.sendSuccessRevision++; await flush();
  expect(screen.sound.play.mock.calls).toEqual([['send'], ['send']]);
});

it.each(['account', 'binding', 'conversation', 'hide'] as const)('drops an already queued success sound if its %s boundary changes before post flush', async boundary => {
  const screen = mount(); screen.props.sendSuccessRevision++;
  if (boundary === 'account') screen.app.accountKey = 'user:8';
  if (boundary === 'binding') screen.app.accountBindingEpoch++;
  if (boundary === 'conversation') screen.props.composerKey = 'conversation:B';
  if (boundary === 'hide') screen.hide();
  await flush(); expect(screen.sound.play).not.toHaveBeenCalled();
});

it('grows a multiline composer within its cap, preserves over-limit input and collapses after sending', async () => {
  const screen = mount();
  screen.view.onInputLines({ detail: { height: 72 } }); expect(screen.view.inputHeight.value).toBe(72);
  screen.view.onInputLines({ detail: { height: 480 } }); expect(screen.view.inputHeight.value).toBe(144);
  const oversized = '文'.repeat(2001); screen.view.onDraft({ detail: { value: oversized } }); await flush();
  expect(screen.view.draft.value).toBe(oversized); expect(screen.view.canSend.value).toBe(false);
  screen.view.onSend(); expect(screen.emit.mock.calls.some(call => call[0] === 'send')).toBe(false);
  const node = await screen.node(); expect(findAll(node, 'nx-conv-length--over')).toHaveLength(1);
  const field = findAll(node, 'nx-conv-input')[0]; expect(field.type).toBe('textarea'); expect(field.props?.['confirm-type']).toBe('return');
  screen.view.onDraft({ detail: { value: '第一行\n第二行' } }); screen.view.onSend(); await flush();
  expect(screen.emit.mock.calls.find(call => call[0] === 'send')?.[1]).toBe('第一行\n第二行');
  expect(screen.view.inputHeight.value).toBe(24);
});

it('does not replay an initial revision, a revision reset, or a disposed watcher', async () => {
  const screen = mount([], 7); await flush(); expect(screen.sound.play).not.toHaveBeenCalled();
  screen.props.sendSuccessRevision = 0; await flush(); expect(screen.sound.play).not.toHaveBeenCalled();
  screen.stop(); screen.props.sendSuccessRevision++; await flush();
  expect(screen.sound.play).not.toHaveBeenCalled(); expect(screen.sound.destroy).toHaveBeenCalledOnce();
});

it('sounds only for unseen live incoming messages, not history, receipts, systems or return', async () => {
  const screen = mount([message('old', 'left')]); await flush();
  expect(screen.sound.play).not.toHaveBeenCalled();
  screen.props.messages.push(message('new', 'left')); await flush();
  expect(screen.sound.play).toHaveBeenCalledExactlyOnceWith('receive');
  screen.props.messages[1].receipt = 'Read'; await flush();
  screen.props.messages.unshift(message('older', 'left')); await flush();
  screen.props.messages.push(message('system', 'left', { tone: 'system' })); await flush();
  screen.hide(); screen.props.messages.push(message('hidden', 'left')); await flush(); screen.show(); await flush();
  expect(screen.sound.play).toHaveBeenCalledOnce();
});

const pageAst = ts.createSourceFile('chat.ts', chatSource.split('<script setup lang="ts">')[1].split('</script>')[0], ts.ScriptTarget.Latest, true);
function extract(names: string[]) {
  return transpile(pageAst.statements.filter(node => ts.isFunctionDeclaration(node) ? names.includes(node.name?.text ?? '')
    : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.includes(d.name.getText(pageAst))))
    .map(node => node.getText(pageAst)).join('\n'));
}
function projection(conversation: unknown, copy = zh) {
  return new Function('deps', `const {computed,ref}=deps, t=ref(deps.copy), conv=ref(deps.conversation),
    isAi=ref(false),nova={},locale={code:'zh'},imageSources=ref({}),imageFailures=ref({}),
    failedHumanSend=ref(null),humanSendBusy=ref(false),localHumanSend=ref(null),humanComposerKey=ref('test'),imageDraft=ref(null);
    const avatarImageKey=()=>undefined,humanMessageRecommendation=()=>({}),localizedIdleClose=()=>null;
    ${extract(['receiptFor', 'threadMessages'])}; return threadMessages;`)(
    { computed: Vue.computed, ref: Vue.ref, copy, conversation });
}
function response(receipt: string | null | undefined, sender = 'agent') {
  return { conversation: { conversationNo: 'CV-1', conversationType: 'support', status: 'OPEN', version: 1, ownerAgentName: 'Agent',
    unreadCount: 1, lastMessage: 'Reply', lastMessageAt: 1760000000000 }, messages: [
    { id: 1, senderType: 'user', content: 'Question', receiptStatus: 'sent', createdAt: 1760000000000 },
    { id: 2, senderType: sender, content: 'Reply', receiptStatus: receipt, createdAt: 1760000001000 },
  ], historyTruncated: false, nextCursor: null };
}
it.each([zh, en, vietnamese])('maps only API-provided incoming sent/read receipts and never fabricates missing/system receipts', async copy => {
  for (const state of ['sent', 'read', null, undefined]) {
    const api = createSupportApi({ request: async () => response(state) } as never);
    const rows = projection(await api.conversation('CV-1'), copy).value;
    expect(rows[1].receipt).toBe(state === 'read' ? copy.conversations.receiptRead : state === 'sent' ? copy.conversations.receiptSent : undefined);
    expect(rows[0].receipt).toBe(copy.conversations.receiptSent);
  }
  const api = createSupportApi({ request: async () => response(null, 'system') } as never);
  const row = projection(await api.conversation('CV-1'), copy).value[1]; expect(row.tone).toBe('system'); expect(row.receipt).toBeUndefined();
});

it('keeps explicit incoming receipts when newer messages have no receipt or a system notice follows', async () => {
  const data = response('sent');
  data.messages.push({ ...data.messages[1], id: 3, receiptStatus: 'read' },
    { ...data.messages[1], id: 4, receiptStatus: undefined }, { ...data.messages[1], id: 5, senderType: 'system', receiptStatus: null });
  const api = createSupportApi({ request: async () => data } as never), rows = projection(await api.conversation('CV-1')).value;
  expect(rows.map((row: ThreadMsg) => row.receipt)).toEqual([
    zh.conversations.receiptSent, zh.conversations.receiptSent, zh.conversations.receiptRead, undefined, undefined,
  ]);
});

it('history recovery retry is single-flight, handles failure and ignores an obsolete account result', async () => {
  let complete!: () => void;
  const refresh = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
  const deps = { ref: Vue.ref, app: Vue.reactive({ accountBindingEpoch: 1 }), cid: Vue.ref('CV-1'),
    convStore: { scopeInvalidated: 1, refresh }, supportSessionReady: Vue.ref(true) };
  const state = new Function('deps', `const {ref,app,cid,convStore,supportSessionReady}=deps;let novaPageVisible=true;
    ${extract(['humanHistoryListError', 'humanHistoryRetry', 'humanHistoryRetryBusy', 'historyRetryGeneration', 'cancelHistoryRetry', 'retryHumanHistory'])};
    return {retryHumanHistory,humanHistoryRetryBusy,humanHistoryRetry,humanHistoryListError,cancelHistoryRetry};`)(deps);
  const first = state.retryHumanHistory(); await state.retryHumanHistory(); expect(refresh).toHaveBeenCalledTimes(1);
  expect(state.humanHistoryRetryBusy.value).toBe(true); complete(); await first; expect(state.humanHistoryRetry.value).toBe(1);
  const stale = state.retryHumanHistory(); deps.app.accountBindingEpoch++; state.cancelHistoryRetry(); complete(); await stale;
  expect(state.humanHistoryRetry.value).toBe(1); expect(state.humanHistoryRetryBusy.value).toBe(false);
  refresh.mockRejectedValueOnce(new Error('read failed')); await state.retryHumanHistory();
  expect(state.humanHistoryListError.value).toBe(true); expect(state.humanHistoryRetryBusy.value).toBe(false);
  const style = parse(chatSource).descriptor.styles.find(item => item.scoped)!.content;
  expect(style).toMatch(/\.cp-history-text-action \{[^}]*min-height:44px[^}]*background:transparent/);
  expect(style).toMatch(/\.cp-history-text-action \{[^}]*justify-content:center/);
});

it.each([
  ['zh', '2025/12/31 23:59:05'], ['en', 'Dec 31, 2025 23:59:05'], ['vi', '31/12/2025 23:59:05'],
] as const)('keeps shared absolute dates accessible while midnight and24h remain separate rules in %s', async (locale, full) => {
  vi.stubGlobal('Intl', undefined);
  const first = new Date(2025, 11, 31, 23, 59, 5).getTime(); vi.setSystemTime(new Date(2026, 0, 3, 12));
  const screen = mount([message('last-year', 'left', { timestamp: first, meta: 'Support' }),
    message('new-year', 'right', { timestamp: first + 60_000, meta: 'You' }),
    message('after24h', 'left', { timestamp: first + 60_000 + 86_400_000, meta: 'Support' })]);
  screen.props.timeLocale = locale; await flush(); const node = await screen.node();
  expect(Object.keys(screen.view.timeGroups.value)).toEqual(['last-year', 'after24h']);
  expect(findAll(node, 'nx-conv-time-divider')).toHaveLength(2);
  const times = findAll(node, 'nx-conv-message-time'); expect(times.map(visibleText)).toEqual(['23:59', '00:00', '00:00']);
  expect(times[0].props?.title).toMatch(new RegExp('^' + full.replaceAll('/', '\\/') + ' GMT[+-]\\d{2}:\\d{2}$'));
  expect(times[0].props?.['aria-label']).toContain(full);
  expect(findAll(node, 'nx-conv-enter-left')).toHaveLength(0);
});
