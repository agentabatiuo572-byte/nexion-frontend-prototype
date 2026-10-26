import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import source from './conversation-thread.vue?raw';
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
function mount(initial: ThreadMsg[] = [], sendSuccessRevision = 0) {
  const app = Vue.reactive({ accountKey: 'user:7', accountBindingEpoch: 1 });
  const shown: Array<() => void> = [], hidden: Array<() => void> = [];
  const props = Vue.reactive({ messages: initial, entranceReady: true, timeLocale: 'zh' as 'zh' | 'en' | 'vi', composerKey: 'conversation:A', revealTick: 0,
    inputPlaceholder: 'Message', inputLabel: 'Message', sendLabel: 'Send', queueLabels: zh.nova.queue, sendSuccessRevision,
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
  new Function('require', 'exports', code)((id: string) => { if (!(id in modules)) throw new Error(id); return modules[id]; }, exports);
  const scope = Vue.effectScope(), view = scope.run(() => exports.default.setup(props, { emit, expose() {} }))!;
  cleanups.push(() => scope.stop());
  let node!: Vue.VNode; const renderCache: unknown[] = [];
  return { props, app, view, emit, sound, hide: () => hidden.forEach(fn => fn()), show: () => shown.forEach(fn => fn()), stop: () => scope.stop(),
    async node() {
      await renderToString(Vue.createSSRApp({ components: { LiquidGlass: { render: () => null }, MessageStatusIcon: { render: () => null } }, render: () => {
        node = render(Vue.proxyRefs({ ...Vue.toRefs(props), ...view }), renderCache); return node;
      } }));
      return node;
    } };
}

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
  expect(host.scrollTop).toBe(520); expect(screen.view.scrollTop.value).toBe(520); expect(screen.view.scrollAnimated.value).toBe(false);
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
  if (atTail) expect(screen.view.scrollAnimated.value).toBe(false);
});

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
  expect(screen.view.timeGroups.value.future).toContain('2026年10月27日');
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
