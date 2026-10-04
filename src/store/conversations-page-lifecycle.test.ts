import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick, reactive, ref, watch } from 'vue';
import ts from 'typescript';
import messagesPage from '../pages/support/messages.vue?raw';
import { installSupportStorage } from '@/test/storage-setup';

installSupportStorage();

const runtime = vi.hoisted(() => ({ remoteApiEnabled: true, supportApi: {
  authorityRevision: vi.fn(), commandResult: vi.fn(), conversations: vi.fn(),
  conversationDismissals: vi.fn(), conversationCategories: vi.fn(),
} }));
vi.mock('@/api/runtime', () => runtime);
const { useConversations } = await import('./conversations');
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
