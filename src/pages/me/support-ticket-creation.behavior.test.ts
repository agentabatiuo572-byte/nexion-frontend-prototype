// @ts-expect-error Node-only SFC test harness.
import { readFileSync } from 'node:fs';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import * as Vue from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zh } from '@/i18n/messages/zh';
import { fmt } from '@/i18n/format';
import { binarySessionReady } from '@/lib/binary-session-ready';
import { ApiError } from '@/api/errors';
import { TicketCreationDenied, type TicketCreationPolicy } from '@/api/support-ticket-policy';
import { STATUS_COLOR, type Ticket } from '@/domain/support';

// Compile and render the actual page, including inputs, notice and submit actions.
const source = readFileSync(new URL('./support-tickets.vue', import.meta.url), 'utf8');
const compiled = compileScript(parse(source).descriptor, { id: 'ticket-creation-behavior', inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => ['view', 'text', 'input', 'textarea'].includes(tag) } } });
const script = ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
type Node = { tag: string; text: string; props: Record<string, any>; children: Node[]; parent: Node | null };
const node = (tag: string, text = ''): Node => ({ tag, text, props: {}, children: [], parent: null });
const renderer = Vue.createRenderer<Node, Node>({
  createElement: tag => node(tag), createText: text => node('#text', text), createComment: text => node('#comment', text),
  setText: (item, text) => { item.text = text; }, setElementText: (item, text) => { item.text = text; item.children = []; },
  parentNode: item => item.parent, nextSibling: item => item.parent?.children[item.parent.children.indexOf(item) + 1] ?? null,
  patchProp: (item, key, _before, value) => { item.props[key] = value; },
  insert: (item, parent, anchor) => {
    if (item.parent) item.parent.children = item.parent.children.filter(child => child !== item);
    item.parent = parent; const at = anchor ? parent.children.indexOf(anchor) : -1;
    if (at < 0) parent.children.push(item); else parent.children.splice(at, 0, item);
  },
  remove: item => { if (item.parent) item.parent.children = item.parent.children.filter(child => child !== item); },
});
const mounted: Vue.App<Node>[] = [];
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); });
const flatten = (item: Node): Node[] => [item, ...item.children.flatMap(flatten)];
const textOf = (item: Node): string => item.tag === '#comment' ? '' : item.text + item.children.map(textOf).join('');
async function flush() { for (let index = 0; index < 8; index++) await Vue.nextTick(); }
function pending<T>() {
  let resolve!: (value: T) => void, reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const enhanced: TicketCreationPolicy = { allowed: false, reasonCode: 'SUPPORT_TICKET_CREATE_ACTIVE_LIMIT', retryAfterSeconds: 0,
  retryAt: null, existingTicketNo: 'TK-existing', cooldownSeconds: 60, windowHours: 24, maxCreatedInWindow: 10,
  maxActiveTickets: 3, createdInWindow: 0, activeTickets: 3 };
const created: Ticket = { id: 'TK-created', subject: 'Created subject', category: 'withdrawal', status: 'open', priority: 'normal',
  version: 1, createdAt: 1, updatedAt: 1, lastReplyAt: 1, messageCount: 0, unread: 0, owner: 'Support', messages: [] };

function mount(policy = vi.fn(async (): Promise<unknown> => ({ mode: 'BASIC' })), ready = true) {
  const hooks: { load?: (query: Record<string, string>) => void; show?: () => void; hide?: () => void } = {};
  let sessionUserId: number | null = ready ? 42 : null;
  const appState = Vue.reactive({ accountKey: ready ? 'user:42' : 'default', accountBindingEpoch: ready ? 1 : 0 });
  const auth = Vue.reactive({ accountId: ready ? 'user:42' : '', isAuthenticated: ready });
  const store = Vue.reactive({ tickets: [] as Ticket[], loading: false, mutating: false, error: null,
    refresh: vi.fn(async () => undefined), createTicket: vi.fn(async (_input: unknown) => { store.tickets.push(created); return created.id; }),
    load: vi.fn(async (_id: string) => created), markRead: vi.fn(async () => undefined), loadEarlier: vi.fn(),
    replyTicket: vi.fn(), closeTicket: vi.fn() });
  const toast = { info: vi.fn(), warn: vi.fn(), success: vi.fn(), error: vi.fn() };
  const modules: Record<string, unknown> = {
    vue: Vue, '@dcloudio/uni-app': { onLoad: (fn: typeof hooks.load) => { hooks.load = fn; },
      onShow: (fn: typeof hooks.show) => { hooks.show = fn; }, onHide: (fn: typeof hooks.hide) => { hooks.hide = fn; }, onUnload: vi.fn() },
    '@/i18n/use-t': { useT: () => Vue.ref(zh) }, '@/i18n/format': { fmt }, '@/store/ui': { toast },
    '@/store/tickets': { useTickets: () => store }, '@/store/app': { useApp: () => appState }, '@/store/auth': { useAuth: () => auth },
    '@/lib/binary-session-ready': { binarySessionReady }, '@/lib/account-scope': {
      captureAccountScope: () => appState.accountBindingEpoch, isCurrentAccountScope: (epoch: number) => epoch === appState.accountBindingEpoch },
    '@/api/runtime': { remoteApiEnabled: true, sessionVault: { read: () => sessionUserId === null ? null : { user: { userId: sessionUserId } } },
      supportApi: { ticketCreationPolicy: policy, slaTargets: vi.fn(async () => []),
        faqPage: vi.fn(async () => ({ items: [], total: 0, pageNum: 1, pageSize: 20 })) } },
    '@/api/support-ticket-policy': { TicketCreationDenied }, '@/store/locale': { useLocaleStore: () => Vue.reactive({ code: 'zh' }) },
    '@/lib/route': { navReplace: vi.fn() }, '@/domain/support': { STATUS_COLOR },
    '@/components/app-chassis.vue': { default: { setup: (_props: unknown, { slots }: any) => () => Vue.h('main', slots.default?.()) } },
  };
  const component = new Function('require', 'exports', `${script}; return exports.default;`)((name: string) => {
    if (name in modules) return modules[name];
    if (name.endsWith('.vue')) return { default: { render: () => null } };
    throw new Error(`Unexpected dependency: ${name}`);
  }, {});
  const root = node('root'), app = renderer.createApp(component);
  for (const name of ['LiquidGlass', 'GlassSegments']) app.component(name, { render: () => null });
  app.mount(root); mounted.push(app);
  hooks.load?.({ mode: 'create' }); hooks.show?.();
  const nodes = () => flatten(root);
  const submit = () => nodes().find(item => String(item.props.class).split(' ').includes('ticket-submit'))!;
  const field = (tag: string) => nodes().find(item => item.tag === tag)!;
  const input = (subject = 'Draft subject', body = 'Draft body') => {
    field('input').props.onInput({ detail: { value: subject } }); field('textarea').props.onInput({ detail: { value: body } });
  };
  const retry = () => nodes().find(item => item.props.role === 'button' && textOf(item) === zh.ui.retry)!;
  const restore = (userId: number) => { sessionUserId = userId; auth.accountId = `user:${userId}`; auth.isAuthenticated = true;
    appState.accountKey = auth.accountId; appState.accountBindingEpoch++; };
  return { store, toast, policy, hooks, nodes, submit, field, input, retry, restore, text: () => textOf(root) };
}

describe('actual ticket creation page with delivered basic capability', () => {
  it('enables BASIC after pre-read, validates fields, submits once and enters the returned detail', async () => {
    const h = mount(); await flush();
    expect(h.submit().props['aria-disabled']).toBe(false);
    expect(h.text()).toContain(zh.tickets.policyHint);
    await h.submit().props.onClick(); await flush();
    expect(h.store.createTicket).not.toHaveBeenCalled();
    expect(h.toast.info).toHaveBeenCalledWith(zh.tickets.create.missingFields, '');
    h.input(); await flush();
    const result = pending<string>(); h.store.createTicket.mockImplementationOnce(() => result.promise);
    const first = h.submit().props.onClick(), second = h.submit().props.onClick(); await flush();
    expect(h.store.createTicket).toHaveBeenCalledTimes(1);
    expect(h.store.createTicket).toHaveBeenCalledWith({ category: 'withdrawal', subject: 'Draft subject', body: 'Draft body' });
    expect(h.submit().props['aria-busy']).toBe(true); expect(h.submit().props['aria-disabled']).toBe(true);
    h.store.tickets.push(created); result.resolve(created.id); await Promise.all([first, second]); await flush();
    expect(h.nodes().filter(item => String(item.props.class).includes('ticket-submit'))).toHaveLength(0);
    expect(h.text()).toContain(created.id); expect(h.text()).toContain(created.subject);
    expect(h.toast.success).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404, 429, 500])('keeps draft and submission disabled during pre-read and HTTP %s until a successful retry', async status => {
    const read = pending<unknown>(), policy = vi.fn(() => read.promise), h = mount(policy); await flush(); h.input(); await flush();
    expect(h.submit().props['aria-disabled']).toBe(true); await h.submit().props.onClick();
    expect(h.store.createTicket).not.toHaveBeenCalled();
    read.reject(new ApiError({ kind: 'http', status, message: status === 404 ? 'SUPPORT_TICKET_NOT_FOUND' : 'Unavailable' })); await flush();
    expect(h.text()).toContain(zh.tickets.policyUnavailable); expect(h.submit().props['aria-disabled']).toBe(true);
    expect(h.field('input').props.value).toBe('Draft subject'); expect(h.field('textarea').props.value).toBe('Draft body');
    policy.mockResolvedValue({ mode: 'BASIC' }); await h.retry().props.onClick(); await flush();
    expect(h.submit().props['aria-disabled']).toBe(false); expect(h.field('input').props.value).toBe('Draft subject');
  });

  it('retains drafts on failed POST and enforces a newly reached server denial without a second POST', async () => {
    const h = mount(); await flush(); h.input(); await flush();
    h.store.createTicket.mockRejectedValueOnce(new Error('Offline'));
    await h.submit().props.onClick(); await flush();
    expect(h.field('input').props.value).toBe('Draft subject'); expect(h.toast.error).toHaveBeenCalledTimes(1);
    h.store.createTicket.mockRejectedValueOnce(new TicketCreationDenied(enhanced));
    await h.submit().props.onClick(); await flush();
    expect(h.submit().props['aria-disabled']).toBe(true); expect(h.text()).toContain(fmt(zh.tickets.policyActiveLimit, { n: 3 }));
    expect(h.text()).toContain(zh.tickets.policyViewTicket); await h.submit().props.onClick();
    expect(h.store.createTicket).toHaveBeenCalledTimes(2); expect(h.field('textarea').props.value).toBe('Draft body');
  });

  it('waits for cold account binding and ignores an old account capability result', async () => {
    const old = pending<unknown>(), current = pending<unknown>(), policy = vi.fn(() => old.promise), h = mount(policy, false); await flush();
    expect(policy).not.toHaveBeenCalled(); expect(h.submit().props['aria-disabled']).toBe(true);
    h.restore(42); await flush(); expect(policy).toHaveBeenCalled(); h.input(); await flush();
    policy.mockImplementation(() => current.promise); h.restore(43); await flush();
    expect(h.field('input').props.value).toBe(''); old.resolve({ mode: 'BASIC' }); await flush();
    expect(h.submit().props['aria-disabled']).toBe(true);
    current.resolve({ mode: 'BASIC' }); await flush(); expect(h.submit().props['aria-disabled']).toBe(false);
  });

  it('ignores pre-read results after hiding and requires a fresh pre-read on return', async () => {
    const old = pending<unknown>(), current = pending<unknown>(), policy = vi.fn(() => old.promise), h = mount(policy); await flush();
    h.input(); h.hooks.hide?.(); old.resolve({ mode: 'BASIC' }); await flush();
    expect(h.submit().props['aria-disabled']).toBe(true); await h.submit().props.onClick(); expect(h.store.createTicket).not.toHaveBeenCalled();
    policy.mockImplementation(() => current.promise); h.hooks.show?.(); await flush();
    expect(h.submit().props['aria-disabled']).toBe(true); current.resolve({ mode: 'BASIC' }); await flush();
    expect(h.submit().props['aria-disabled']).toBe(false); expect(h.field('textarea').props.value).toBe('Draft body');
  });
});
