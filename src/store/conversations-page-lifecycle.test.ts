import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue';
import ts from 'typescript';
import messagesPage from '../pages/support/messages.vue?raw';
import notificationsPage from '../pages/me/notifications.vue?raw';
import serviceList from '../components/support/service-message-list.vue?raw';
import { installSupportStorage } from '@/test/storage-setup';
import { ApiError } from '@/api/errors';

installSupportStorage();

const runtime = vi.hoisted(() => ({ remoteApiEnabled: true, supportApi: {
  authorityRevision: vi.fn(), commandResult: vi.fn(), conversations: vi.fn(),
  conversationDismissals: vi.fn(), conversationCategories: vi.fn(), tickets: vi.fn(),
  startConversation: vi.fn(), createTicket: vi.fn(),
} }));
const notificationFixture = vi.hoisted(() => ({ store: null as any }));
vi.mock('@/api/runtime', () => runtime);
vi.mock('./notifications', () => ({ useNotifications: () => notificationFixture.store }));
const { useConversations } = await import('./conversations');
const { useTickets } = await import('./tickets');
const { useMessageDrawer } = await import('./message-drawer');
const available = { advisor: true, support: true, ai: false };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const cleanups: Array<() => void> = [];
beforeEach(() => {
  setActivePinia(createPinia()); vi.resetAllMocks();
  runtime.supportApi.authorityRevision.mockResolvedValue('canonical-v1');
  runtime.supportApi.commandResult.mockResolvedValue(null);
  runtime.supportApi.conversations.mockResolvedValue({ items: [] });
  runtime.supportApi.conversationDismissals.mockResolvedValue([]);
  runtime.supportApi.conversationCategories.mockResolvedValue(available);
  runtime.supportApi.tickets.mockResolvedValue({ items: [] });
  notificationFixture.store = reactive({ unread: 0, loading: false, error: null,
    refreshRemote: vi.fn(async () => {}), cancelRefresh: vi.fn() });
});
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); });

// Execute the page's actual lifecycle/watch code against the real Pinia store.
// Only UniApp lifecycle registration and the unrelated Nova transport are stubbed.
function mountPage() {
  const scope = effectScope(); cleanups.push(() => scope.stop());
  const app = reactive({ accountKey: 'user:A', accountBindingEpoch: 1 });
  const store = useConversations(); store.bindAccount(app.accountKey);
  let show!: () => Promise<void>; let hide!: () => void; let unmount!: () => void;
  let activeRefresh!: () => Promise<void>;
  const release = vi.fn();
  const start = messagesPage.indexOf('const selectedType = ref');
  const end = messagesPage.indexOf('// Both human categories', start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const code = ts.transpileModule(messagesPage.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const controls = scope.run(() => new Function(
    'ref', 'watch', 'app', 'convStore', 'remoteApiEnabled', 'NOVA_SUPPORT_VISIBLE', 'nova', 'novaAiApi',
    'registerActivePageRefresh', 'onShow', 'onHide', 'onUnmounted',
    code + '\nreturn { retryConversations };',
  )(ref, watch, app, store, true, false, { ensureRemoteHistory: async () => {} }, {},
    (callback: () => Promise<void>) => { activeRefresh = callback; return release; },
    (callback: () => Promise<void>) => { show = callback; },
    (callback: () => void) => { hide = callback; },
    (callback: () => void) => { unmount = callback; }));
  function bind(key: string) {
    app.accountKey = key; app.accountBindingEpoch++; store.bindAccount(key);
  }
  return { app, store, bind, show: () => show(), hide: () => hide(), unmount: () => unmount(),
    activeRefresh: () => activeRefresh(), retry: () => controls.retryConversations(), release };
}
async function settle() { for (let i = 0; i < 10; i++) await nextTick(); }

it('first authority run preparation does not invalidate category completion', async () => {
  const page = mountPage(); await page.show();
  expect(page.store.categoryAvailabilityStatus).toBe('ready');
  expect(page.store.categoryLoading).toBe(false);
});

it.each(['user:A', 'user:B'])('visible binding to %s replaces the stale request and keeps old data fenced', async key => {
  const old = deferred<typeof available>(); const current = deferred<typeof available>();
  runtime.supportApi.conversationCategories.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const page = mountPage(); const firstShow = page.show(); page.bind(key); await nextTick();
  expect(runtime.supportApi.conversationCategories).toHaveBeenCalledTimes(2);
  current.resolve(available); await settle();
  old.resolve({ advisor: false, support: false, ai: true }); await firstShow;
  expect(page.store.categoryAvailabilityStatus).toBe('ready'); expect(page.store.categoryLoading).toBe(false);
  expect(page.store.categoryReadable('advisor')).toBe(true); expect(page.store.categoryReadable('ai')).toBe(false);
});

it('concurrent rebindings coalesce to the latest account and stale failures cannot replace success', async () => {
  const old = deferred<typeof available>();
  runtime.supportApi.conversationCategories.mockReturnValueOnce(old.promise);
  const page = mountPage(); const firstShow = page.show();
  page.bind('user:B'); page.bind('user:C'); await settle();
  expect(runtime.supportApi.conversationCategories).toHaveBeenCalledTimes(2);
  old.reject(new Error('OLD_ACCOUNT_FAILURE')); await firstShow;
  expect(page.store.categoryAvailabilityStatus).toBe('ready'); expect(page.store.error).toBeNull();
});

it('hidden and unmounted pages do not restart reads; show recovers after a hidden rebind', async () => {
  const page = mountPage(); await page.show(); page.hide();
  page.bind('user:B'); await settle(); await page.activeRefresh();
  expect(runtime.supportApi.conversationCategories).toHaveBeenCalledTimes(1);
  await page.show(); expect(runtime.supportApi.conversationCategories).toHaveBeenCalledTimes(2);
  expect(page.store.categoryAvailabilityStatus).toBe('ready');
  page.unmount(); page.bind('user:C'); await settle(); await page.activeRefresh();
  expect(runtime.supportApi.conversationCategories).toHaveBeenCalledTimes(2);
  expect(page.release).toHaveBeenCalled();
});

it('a failed replacement exposes retry and retry reads the current scope successfully', async () => {
  const page = mountPage(); await page.show();
  runtime.supportApi.conversationCategories.mockRejectedValueOnce(new Error('REQUEST_TIMEOUT'));
  page.bind('user:B'); await settle();
  expect(page.store.categoryAvailabilityStatus).toBe('failed'); expect(page.store.categoryLoading).toBe(false);
  page.retry(); await settle();
  expect(page.store.categoryAvailabilityStatus).toBe('ready'); expect(page.store.categoryLoading).toBe(false);
});

it('the actual template loading branch cannot conceal a known list failure while categories are pending', async () => {
  const pending = deferred<typeof available>();
  runtime.supportApi.conversationCategories.mockReturnValueOnce(pending.promise);
  runtime.supportApi.conversations.mockRejectedValueOnce(new Error('REQUEST_TIMEOUT'));
  const page = mountPage(); const shown = page.show(); await settle();
  expect(page.store.error).toBe('REQUEST_TIMEOUT'); expect(page.store.categoryAvailabilityStatus).toBe('loading');
  const condition = messagesPage.match(/v-if="([^"]+)"\s+class="nx-conv-category-loading"/)?.[1];
  expect(condition).toBeTruthy();
  expect(new Function('convStore', 'TYPES', `return (${condition});`)(page.store, [])).toBe(false);
  pending.resolve(available); await shown;
});

// Run the new message page's actual account watchers/lifecycle and Service retry
// against the real drawer and stores. The unrelated notification IO is controlled.
function mountNotifications() {
  const scope = effectScope();
  const app = reactive({ accountKey: 'user:A', accountBindingEpoch: 1 });
  const conversations = useConversations(), tickets = useTickets(), center = useMessageDrawer();
  conversations.bindAccount(app.accountKey); tickets.bindAccount(app.accountKey);
  const hooks: Record<string, Array<() => void>> = { onMounted: [], onShow: [], onHide: [], onUnmounted: [] };
  const script = notificationsPage.split('<script setup lang="ts">')[1].split('</script>')[0];
  const ast = ts.createSourceFile('notifications.ts', script, ts.ScriptTarget.ES2022, true);
  const variables = new Set(['pageGeneration', 'pageVisible', 'disposed', 'center', 'touchStarts', 'suppressedClick']);
  const parts = ast.statements.filter(node =>
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => variables.has(item.name.getText(ast))))
    || (ts.isFunctionDeclaration(node) && ['invalidatePage', 'invalidatePendingIntents'].includes(node.name?.text ?? ''))
    || (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
      && ((Object.keys(hooks).includes(node.expression.expression.getText(ast)) && /disposed|invalidatePage|center\.refresh/.test(node.getText(ast)))
        || (node.expression.expression.getText(ast) === 'watch' && node.getText(ast).includes('app.account'))))
  ).map(node => node.getText(ast));
  const dependencies = { watch, app, useMessageDrawer: () => center, expandedId: ref(null), filter: ref('all'), serviceFilter: ref('all'),
    resetHeader: vi.fn(), ui: { clearConfirmsBy: vi.fn() }, confirmOwner: 'fixture',
    ...Object.fromEntries(Object.keys(hooks).map(name => [name, (callback: () => void) => hooks[name].push(callback)])) };
  const run = (code: string, deps: Record<string, unknown>) => new Function('deps', `const {${Object.keys(deps).join(',')}}=deps;
    ${ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText}`)(deps);
  scope.run(() => run(parts.join('\n'), dependencies));
  const serviceAst = ts.createSourceFile('service.ts', serviceList.split('<script setup lang="ts">')[1].split('</script>')[0], ts.ScriptTarget.ES2022, true);
  const serviceParts = serviceAst.statements.filter(node =>
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => ['loading', 'failed'].includes(item.name.getText(serviceAst))))
    || (ts.isFunctionDeclaration(node) && node.name?.text === 'retry')
  ).map(node => node.getText(serviceAst));
  let controls!: { loading: { value: boolean }; failed: { value: boolean }; retry: () => void };
  scope.run(() => run(serviceParts.join('\n') + '\ncapture({ loading, failed, retry });', { computed, conversations, tickets, center,
    capture: (value: typeof controls) => { controls = value; } }));
  const emptyCondition = serviceList.match(/v-if="([^"]+)" class="service-state service-empty"/)![1];
  const state = () => ({ loading: controls.loading.value, failed: controls.failed.value,
    empty: new Function('loading', 'failed', 'rows', `return (${emptyCondition});`)(controls.loading.value, controls.failed.value,
      [...conversations.conversations, ...tickets.tickets]) });
  const fire = (name: string) => hooks[name].forEach(callback => callback());
  cleanups.push(() => { fire('onUnmounted'); scope.stop(); center.stopRefresh(); });
  function create(kind: 'conversations' | 'tickets', failure: ApiError) {
    if (kind === 'conversations') {
      runtime.supportApi.startConversation.mockRejectedValueOnce(failure);
      return conversations.startConversation('support', 'controlled request');
    }
    runtime.supportApi.createTicket.mockRejectedValueOnce(failure);
    return tickets.createTicket({ category: 'technical', subject: 'Controlled', body: 'Details' });
  }
  return { conversations, tickets, center, state, retry: () => controls.retry(), show: () => fire('onShow'), hide: () => fire('onHide'),
    create, unmount: () => fire('onUnmounted'), bind(key: string) {
      app.accountKey = key; app.accountBindingEpoch++; center.bindAccount(); conversations.bindAccount(key); tickets.bindAccount(key);
    } };
}

it.each(['user:A', 'user:B'])('message Service replaces an in-flight category read after visible binding to %s', async key => {
  const old = deferred<typeof available>(), current = deferred<typeof available>();
  runtime.supportApi.conversationCategories.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const page = mountNotifications(); page.show(); await settle();
  expect(page.state()).toEqual({ loading: true, failed: false, empty: false });
  page.bind(key); await settle(); current.resolve(available); await settle();
  expect(page.state()).toEqual({ loading: false, failed: false, empty: true });
  old.resolve({ advisor: false, support: false, ai: true }); await settle();
  expect(page.conversations.categoryAvailability).toEqual(available);
  expect(page.state()).toEqual({ loading: false, failed: false, empty: true });
});

it('message Service remains retryable after a failed replacement instead of showing an empty inbox', async () => {
  const page = mountNotifications(); page.show(); await settle();
  runtime.supportApi.conversationCategories.mockRejectedValueOnce(new Error('REQUEST_TIMEOUT'));
  page.bind('user:B'); await settle();
  expect(page.state()).toEqual({ loading: false, failed: true, empty: false });
  expect(page.conversations.categoryEnabled('support')).toBe(false);
  page.retry(); await settle();
  expect(page.state()).toEqual({ loading: false, failed: false, empty: true });
  expect(page.conversations.categoryAvailability).toEqual(available);
});

it('message Service defers hidden bindings until show and never resumes after unmount', async () => {
  const page = mountNotifications(); page.show(); await settle(); page.hide();
  page.bind('user:B'); await settle();
  expect(runtime.supportApi.conversationCategories).toHaveBeenCalledTimes(1);
  expect(page.conversations.categoryAvailabilityStatus).toBe('loading');
  page.show(); await settle(); expect(page.state()).toEqual({ loading: false, failed: false, empty: true });
  page.unmount(); page.bind('user:C'); page.show(); await settle();
  expect(runtime.supportApi.conversationCategories).toHaveBeenCalledTimes(2);
  expect(page.conversations.categoryAvailabilityStatus).toBe('loading');
});

it.each(['conversations', 'tickets'] as const)('message Service exposes a retryable error after current %s recovery fails', async kind => {
  const page = mountNotifications(); page.show(); await settle();
  const api = runtime.supportApi[kind], store = kind === 'conversations' ? page.conversations : page.tickets;
  const older = deferred<any>(), recovery = deferred<any>(), count = api.mock.calls.length;
  api.mockReturnValueOnce(older.promise).mockReturnValueOnce(recovery.promise);
  const initial = store.refresh(); await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(count + 1));
  const originalFailure = new ApiError({ kind: 'network', message: 'original command failure' });
  const outcome = page.create(kind, originalFailure).catch(cause => cause);
  await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(count + 2));
  recovery.reject(new Error('current list read failed')); expect(await outcome).toBe(originalFailure);
  older.resolve({ items: [], total: 0 }); await initial;
  expect(page.state()).toEqual({ loading: false, failed: true, empty: false });
  expect(store.error).toBe('current list read failed');
  api.mockResolvedValueOnce({ items: [], total: 0 }); page.retry(); await settle();
  expect(store.error).toBeNull(); expect(page.state()).toEqual({ loading: false, failed: false, empty: true });
});

it.each(['conversations', 'tickets'] as const)('message Service clears an earlier %s list error when current recovery succeeds', async kind => {
  const page = mountNotifications(); page.show(); await settle();
  const store = kind === 'conversations' ? page.conversations : page.tickets;
  store.error = 'earlier list read failed';
  const originalFailure = new ApiError({ kind: 'network', message: 'original command failure' });
  const outcome = page.create(kind, originalFailure);
  expect(await outcome.catch(cause => cause)).toBe(originalFailure);
  expect(page.state()).toEqual({ loading: false, failed: false, empty: true }); expect(store.error).toBeNull();
});
