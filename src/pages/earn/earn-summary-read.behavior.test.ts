import { notifyPageActivation } from '@/lib/passive-read-window';
import { createPassiveTabReadFixture } from '@/lib/passive-tab-read.test-support';
import * as Vue from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import raw from './earn.vue?raw';
import { ApiError } from '@/api/errors';
import { createApiClient } from '@/api/api-client';
import { en } from '@/i18n/messages/en';
import { auditUiCopy } from '@/i18n/audit-ui';
import { remainderUiCopy } from '@/i18n/remainder-ui';
import { fmt } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';
import { formatUsdOverviewParts } from '@/lib/usd-display';
import { dayOnePageObservationFixture } from '@/lib/day-one-page-observation.test-support';

const remote = vi.hoisted(() => ({ remoteApiEnabled: true, fundsServerEnabled: true, expectedApiEnvironment: 'dev',
  apiRuntimeClientOrigin: Object.freeze({ environment: 'dev', baseUrl: 'https://test.example' }),
  apiRuntimeConfig: { environment: 'dev', baseUrl: 'https://test.example' },
  sessionVault: { read: vi.fn() }, appHomeApi: { fetch: vi.fn() },
  deviceE3Api: { fleet: vi.fn() }, taskAssignmentApi: { state: vi.fn() }, withdrawalApi: { list: vi.fn() } }));
vi.mock('@/api/runtime', async () => { const { reactive } = await import('vue'); remote.apiRuntimeConfig = reactive(remote.apiRuntimeConfig); return remote; });
const { useApp } = await import('@/store/app');
const { useLocaleStore } = await import('@/store/locale');
type Host = { text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (text = ''): Host => ({ text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: () => node(), createText: node, createComment: () => node(),
  setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; n.children = []; },
  patchProp: (n, key, _prev, value) => { n.props[key] = value; }, parentNode: n => n.parent,
  nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert: (n, parent, anchor) => {
    if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n);
    n.parent = parent; const at = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(at < 0 ? parent.children.length : at, 0, n);
  }, remove: n => { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); },
});
const all = (n: Host): Host[] => [n, ...n.children.flatMap(all)];
const text = (n: Host): string => n.text + n.children.map(text).join('');
const group = { __esModule: true, default: Vue.defineComponent({ setup: (_, ctx) => () => Vue.h('view', ctx.slots.default?.()) }) };
const blank = { __esModule: true, default: { render: () => null } };
const segments = { __esModule: true, default: Vue.defineComponent({ props: ['options'], emits: ['update:modelValue'],
  setup: (props, ctx) => () => Vue.h('view', props.options.map((option: { value: string; label: string }) =>
    Vue.h('text', { 'data-range': option.value, onClick: () => ctx.emit('update:modelValue', option.value) }, option.label))) }) };
const mounted: Vue.App[] = [];
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(100_000); vi.resetAllMocks();
  remote.apiRuntimeConfig.environment = 'dev'; remote.apiRuntimeConfig.baseUrl = 'https://test.example';
  remote.sessionVault.read.mockReturnValue({ user: { userId: 1001 } }); remote.withdrawalApi.list.mockResolvedValue([]);
  setActivePinia(createPinia());
});
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); vi.useRealTimers(); });
const truth = (amount = 12.5, jobs = 4) => ({ earnings: {
  today: { usdt: amount, nex: 0, jobCount: jobs }, week: { usdt: amount + 10, nex: 1, jobCount: jobs + 1 },
  month: { usdt: amount + 20, nex: 2, jobCount: jobs + 2 }, all: { usdt: amount + 30, nex: 3, jobCount: jobs + 3 },
} });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Vue.nextTick(); }
function screen() {
  const app = useApp(); app.bindAccount('user:1001');
  vi.spyOn(app, 'refreshRemoteFleet').mockResolvedValue(true);
  const show: Array<() => void> = [], hide: Array<() => void> = [];
  const deps: Record<string, unknown> = {
    '@/lib/passive-tab-read': createPassiveTabReadFixture(() => JSON.stringify([app.accountKey, app.accountBindingEpoch, remote.apiRuntimeConfig.environment, remote.apiRuntimeConfig.baseUrl])),
    vue: Vue, '@/store/app': { useApp: () => app }, '@/api/runtime': remote,
    '@/store/data-visibility': { useDataVisibility: () => ({ hidden: false, mask: String }) },
    '@/lib/amount-display': { formatAmount }, '@/lib/usd-display': { formatUsdOverviewParts },
    '@/i18n/use-t': { useT: () => Vue.ref(en) }, '@/i18n/format': { fmt },
    '@/i18n/audit-ui': { useAuditUiCopy: () => Vue.ref(auditUiCopy.en) },
    '@/i18n/remainder-ui': { useRemainderUiCopy: () => Vue.ref(remainderUiCopy.en) },
    '@/store/config': { useConfig: () => ({ configStatus: 'ready', isEnabled: () => false }) },
    '@/lib/native-phone-runtime': { hasNativeAndroidPhoneRuntime: () => false, hasNativePhoneRuntime: () => false }, '@/lib/route': { navTo: vi.fn() },
    '@/composables/use-trial-presentation': { useTrialPresentation: () => ({ reservedSlots: Vue.ref(0), active: Vue.ref(false) }) },
    '@/store/free-trial': { useFreeTrial: () => ({ refreshRemote: async () => {} }) },
    '@/composables/use-capacity-explainer': { useCapacityExplainer: () => ({ open() {} }) },
    '@/composables/use-tab-page-lifecycle': { onShow: (f: () => void) => show.push(f), onHide: (f: () => void) => hide.push(f) },
    '@/lib/device-slot-policy': { isActiveSlotDevice: () => false },
    '@/lib/account-scope': { captureAccountScope: vi.fn(), isCurrentAccountScope: () => false },
    '@/lib/day-one-page-observation': dayOnePageObservationFixture(),
  };
  const compiled = compileScript(parse(raw).descriptor, { id: 'earn-real-store', inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => ['view', 'text'].includes(tag) } } });
  const code = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = { default: {} as Vue.Component };
  new Function('require', 'exports', code)((id: string) => id in deps ? deps[id] : id.endsWith('.vue')
    ? /glass.?segments/i.test(id) ? segments : /tab-page-frame|card-stagger|nx-section/.test(id) ? group : blank : (() => { throw new Error(id); })(), exports);
  const root = node(), page = renderer.createApp(exports.default);
  page.component('GlassSegments', segments.default);
  page.mount(root); mounted.push(page);
  return { app, root, show: () => show.forEach(f => f()), hide: () => hide.forEach(f => f()),
    retry: () => all(root).find(n => n.props.onClick && text(n) === en.ui.retry)!.props.onClick() };
}

test('actual Earn keeps confirmed zero/UVT/jobs on current 429, retains error/retry, and recovers a fresh read', async () => {
  remote.appHomeApi.fetch.mockResolvedValueOnce(truth(0)).mockRejectedValueOnce(new ApiError({ kind: 'http', status: 429, message: 'LIMIT', retryAfterMs: 20_000 })).mockResolvedValueOnce(truth(9));
  const f = screen(); f.show(); await settle(); expect(text(f.root)).toContain('0.00'); expect(text(f.root)).toContain(fmt(en.earn.jobsCount, { n: '4' }));
  await f.app.refreshHomeTruth(); await settle();
  expect(f.app.homeTruthStatus).toBe('error'); expect(text(f.root)).toContain('0.00');
  expect(text(f.root)).toContain(fmt(en.earn.jobsCount, { n: '4' })); expect(text(f.root)).toContain(en.earn.summaryUnavailableTitle);
  f.retry(); f.show(); await settle(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(2); expect(f.app.homeTruthStatus).toBe('error');
  vi.advanceTimersByTime(20_000); f.retry(); await settle(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(3);
  expect(text(f.root)).toContain('9.00'); expect(text(f.root)).not.toContain(en.earn.summaryUnavailableTitle);
});
test('actual show joins pending and same visit while normal return and explicit refresh remain fresh', async () => {
  const pending = deferred<any>(); remote.appHomeApi.fetch.mockReturnValueOnce(pending.promise).mockResolvedValue(truth());
  const f = screen(); f.show(); f.hide(); f.show(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(1);
  pending.resolve(truth()); await settle(); f.hide(); f.show(); await settle(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(1);
  await f.app.refreshHomeTruth(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(9_999); f.show(); await settle(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(2);
  notifyPageActivation('/pages/me/preferences'); notifyPageActivation('/pages/earn/earn'); f.show(); await settle(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(3);
});

test.each([undefined, 0, 20_000])('all read entry points honor RetryAfter %s without timers or automatic retries', async delay => {
  remote.appHomeApi.fetch.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 429, message: 'LIMIT', retryAfterMs: delay })).mockResolvedValue(truth());
  const f = screen(); f.show(); await settle(); expect(f.app.homeTruthStatus).toBe('error'); expect(text(f.root)).toContain('—');
  const deadline = delay ?? 30_000;
  if (deadline > 0) {
    await f.app.refreshHomeTruth(); f.show(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(deadline - 1); await f.app.refreshHomeTruth(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(1);
  }
  await f.app.refreshHomeTruth(); await settle(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(2);
  expect(f.app.homeTruthStatus).toBe('ready'); expect(text(f.root)).toContain('12.50'); expect(vi.getTimerCount()).toBe(0);
});

test.each([
  new ApiError({ kind: 'auth', status: 401, message: 'DENIED' }),
  new ApiError({ kind: 'auth', code: 403, message: 'DENIED' }),
  new ApiError({ kind: 'http', status: 403, message: 'DENIED' }),
  new ApiError({ kind: 'protocol', message: 'INVALID' }),
  new ApiError({ kind: 'business', code: 409, message: 'DISABLED' }),
  new ApiError({ kind: 'configuration', message: 'INVALID' }),
])('strict %s clears the projection and never authorizes from historical numbers', async error => {
  remote.appHomeApi.fetch.mockResolvedValueOnce(truth()).mockRejectedValueOnce(error).mockResolvedValueOnce(truth(8));
  const f = screen(); f.show(); await settle(); expect(text(f.root)).toContain('12.50');
  await f.app.refreshHomeTruth(); await settle(); expect(f.app.homeTruth).toBeNull(); expect(f.app.homeTruthStatus).toBe('error');
  expect(f.app.homeTruthRateLimited).toBe(false); expect(text(f.root)).not.toContain('12.50'); expect(text(f.root)).toContain('—');
  f.retry(); await settle(); expect(text(f.root)).toContain('8.00'); expect(f.app.homeTruthStatus).toBe('ready');
});

test.each(['localeABA', 'account', 'rebind'] as const)('%s immediately clears and rejects old success/429, current read recovers', async owner => {
  const old = deferred<any>(); remote.appHomeApi.fetch.mockResolvedValueOnce(truth()).mockReturnValueOnce(old.promise).mockResolvedValueOnce(truth(8));
  const f = screen(); f.show(); await settle(); const pending = f.app.refreshHomeTruth();
  if (owner === 'localeABA') { const locale = useLocaleStore(); locale.code = 'vi'; locale.code = 'en'; }
  else { const userId = owner === 'account' ? 2002 : 1001; remote.sessionVault.read.mockReturnValue({ user: { userId } }); f.app.bindAccount(`user:${userId}`); }
  expect(f.app.homeTruth).toBeNull(); await settle(); expect(text(f.root)).not.toContain('12.50');
  f.show(); await settle(); expect(text(f.root)).toContain('8.00');
  old.resolve(truth(999)); await expect(pending).resolves.toBe(false); await settle(); expect(text(f.root)).not.toContain('999'); expect(f.app.homeTruthStatus).toBe('ready');
  const late = deferred<any>(); remote.appHomeApi.fetch.mockReturnValueOnce(late.promise).mockResolvedValueOnce(truth(7));
  const oldFailure = f.app.refreshHomeTruth(); const locale = useLocaleStore(); locale.code = 'vi'; locale.code = 'en';
  f.show(); await settle(); late.reject(new ApiError({ kind: 'http', status: 429, message: 'OLD_LIMIT', retryAfterMs: 60_000 }));
  await expect(oldFailure).resolves.toBe(false); expect(f.app.homeTruthStatus).toBe('ready'); expect(f.app.homeTruthRateLimited).toBe(false);
  await f.app.refreshHomeTruth(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(6);
});

test('locale ABA cannot bypass a current server cooldown or resurrect its summary', async () => {
  remote.appHomeApi.fetch.mockResolvedValueOnce(truth()).mockRejectedValueOnce(new ApiError({ kind: 'http', status: 429, message: 'LIMIT', retryAfterMs: 20_000 })).mockResolvedValueOnce(truth(8));
  const f = screen(); f.show(); await settle(); await f.app.refreshHomeTruth();
  const locale = useLocaleStore(); locale.code = 'vi'; locale.code = 'en'; expect(f.app.homeTruth).toBeNull(); expect(f.app.homeTruthStatus).toBe('error');
  f.show(); f.retry(); await settle(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(2); expect(text(f.root)).not.toContain('12.50');
  vi.advanceTimersByTime(20_000); f.show(); await settle(); expect(text(f.root)).toContain('8.00'); expect(f.app.homeTruthStatus).toBe('ready');
});

test.each(['environment', 'baseUrl'] as const)('%s invalidates the old client and rejects delayed old-owner data', async field => {
  const old = deferred<any>(); remote.appHomeApi.fetch.mockResolvedValueOnce(truth()).mockReturnValueOnce(old.promise);
  const f = screen(); f.show(); await settle(); const pending = f.app.refreshHomeTruth();
  remote.apiRuntimeConfig[field] = field === 'environment' ? 'prod' : 'https://other.example';
  expect(f.app.homeTruth).toBeNull(); old.resolve(truth(999)); await expect(pending).resolves.toBe(false);
  f.show(); await f.app.refreshHomeTruth(); await settle(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(2); expect(text(f.root)).not.toContain('999');
});

test('lost session invalidates even a fresh passive summary, and old explicit request cannot fetch for new account', async () => {
  remote.appHomeApi.fetch.mockResolvedValue(truth()); const f = screen(); f.show(); await settle(); const oldRequest = f.app.captureRemoteAccountRequest();
  remote.sessionVault.read.mockReturnValue(null); f.show(); await settle(); expect(f.app.homeTruth).toBeNull(); expect(text(f.root)).not.toContain('12.50');
  remote.sessionVault.read.mockReturnValue({ user: { userId: 2002 } }); f.app.bindAccount('user:2002');
  await f.app.refreshHomeTruth(oldRequest); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(1);
  f.show(); await settle(); expect(f.app.homeTruthStatus).toBe('ready'); expect(text(f.root)).toContain('12.50');
});


test.each([
  new ApiError({ kind: 'network', message: 'NETWORK_UNAVAILABLE' }),
  new ApiError({ kind: 'network', message: 'REQUEST_TIMEOUT' }),
  new ApiError({ kind: 'http', status: 500, message: 'HTTP_500' }),
  new ApiError({ kind: 'http', status: 503, message: 'HTTP_503' }),
])('explicit transient %s preserves only the confirmed hero while live status stays error', async error => {
  remote.appHomeApi.fetch.mockResolvedValueOnce(truth()).mockRejectedValueOnce(error).mockResolvedValueOnce(truth(8));
  const f = screen(); f.show(); await settle(); await f.app.refreshHomeTruth(); await settle();
  expect(text(f.root)).toContain('12.50'); expect(text(f.root)).toContain(fmt(en.earn.jobsCount, { n: '4' }));
  expect(f.app.homeTruthStatus).toBe('error'); expect(text(f.root)).toContain(en.earn.summaryUnavailableTitle);
  f.retry(); await settle(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(3); expect(text(f.root)).toContain('8.00');
});
test.each([new Error('UNKNOWN'), 'UNKNOWN', new ApiError({ kind: 'http', status: 404, message: 'HTTP_404' })])('unknown or non-transient %s removes old numeric projection', async error => {
  remote.appHomeApi.fetch.mockResolvedValueOnce(truth()).mockRejectedValueOnce(error);
  const f = screen(); f.show(); await settle(); await f.app.refreshHomeTruth(); await settle();
  expect(f.app.homeTruth).toBeNull(); expect(text(f.root)).not.toContain('12.50'); expect(f.app.homeTruthStatus).toBe('error');
});

test('the actual range control keeps each confirmed period readable after 429', async () => {
  remote.appHomeApi.fetch.mockResolvedValueOnce(truth()).mockRejectedValueOnce(new ApiError({ kind: 'http', status: 429, message: 'LIMIT' }));
  const f = screen(); f.show(); await settle(); await f.app.refreshHomeTruth(); await settle();
  for (const [range, amount, jobs] of [['Today', '12.50', 4], ['Week', '22.50', 5], ['Month', '32.50', 6], ['All', '42.50', 7]] as const) {
    const control = all(f.root).find(n => n.props['data-range'] === range); expect(control, range).toBeDefined(); control!.props.onClick();
    await Vue.nextTick(); expect(text(f.root)).toContain(amount); expect(text(f.root)).toContain(fmt(en.earn.jobsCount, { n: String(jobs) }));
    expect(f.app.homeTruthStatus).toBe('error'); expect(text(f.root)).toContain(en.earn.summaryUnavailableTitle);
  }
});

test.each(['auth', 'business', 'protocol', 'configuration'] as const)('strict %s cannot be reclassified by status/code429 or 5xx and current retry stays available', async kind => {
  for (const numbers of [{ code: 429 }, { status: 429 }, { status: 503 }]) {
    remote.appHomeApi.fetch.mockResolvedValueOnce(truth()).mockRejectedValueOnce(new ApiError({ kind, ...numbers, message: 'REFUSED' })).mockResolvedValueOnce(truth(8));
    const f = screen(); f.show(); await settle(); expect(text(f.root)).toContain('12.50');
    await f.app.refreshHomeTruth(); await settle();
    expect(f.app.homeTruthTransientFailure).toBe(false); expect(f.app.homeTruthRateLimited).toBe(false);
    expect(f.app.homeTruth).toBeNull(); expect(text(f.root)).not.toContain('12.50'); expect(f.app.homeTruthStatus).toBe('error');
    const calls = remote.appHomeApi.fetch.mock.calls.length; f.retry(); await settle();
    expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(calls + 1); expect(text(f.root)).toContain('8.00'); expect(f.app.homeTruthStatus).toBe('ready');
  }
});
test('only explicit HTTP code429 creates cooldown while network timeout remains immediately retryable', async () => {
  remote.appHomeApi.fetch.mockResolvedValueOnce(truth()).mockRejectedValueOnce(new ApiError({ kind: 'http', code: 429, message: 'LIMIT', retryAfterMs: 2_000 })).mockResolvedValueOnce(truth(8))
    .mockRejectedValueOnce(new ApiError({ kind: 'network', code: 429, message: 'REQUEST_TIMEOUT', retryAfterMs: 60_000 })).mockResolvedValueOnce(truth(7));
  const f = screen(); f.show(); await settle(); await f.app.refreshHomeTruth(); await settle();
  expect(f.app.homeTruthRateLimited).toBe(true); expect(f.app.homeTruthTransientFailure).toBe(true); expect(text(f.root)).toContain('12.50');
  f.retry(); await settle(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(2_000); f.retry(); await settle(); expect(text(f.root)).toContain('8.00');
  await f.app.refreshHomeTruth(); await settle(); expect(f.app.homeTruthRateLimited).toBe(false); expect(f.app.homeTruthTransientFailure).toBe(true); expect(text(f.root)).toContain('8.00');
  f.retry(); await settle(); expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(5); expect(text(f.root)).toContain('7.00');
});


test.each([{status:404,keep:false},{status:503,keep:true}])('real ApiClient transport HTTP$status/body429 respects HTTP status without a false cooldown', async ({status,keep}) => {
  const client=createApiClient({baseUrl:'https://transport.invalid',vault:{read:()=>null,revision:()=>0}as never,transport:{request:async()=>({status,headers:{'Retry-After':'30'},data:{code:429,message:'READ_FAILED',data:null}})}});
  const failure=await client.request({path:'/overview',authenticated:false}).catch(error=>error);expect(failure).toMatchObject({kind:'http',status,code:429});
  remote.appHomeApi.fetch.mockResolvedValueOnce(truth()).mockRejectedValueOnce(failure).mockResolvedValueOnce(truth(8));const f=screen();f.show();await settle();await f.app.refreshHomeTruth();await settle();
  expect.soft(f.app.homeTruthRateLimited).toBe(false);expect.soft(f.app.homeTruthTransientFailure).toBe(keep);expect(f.app.homeTruthStatus).toBe('error');
  if(keep)expect(text(f.root)).toContain('12.50');else{expect.soft(f.app.homeTruth).toBeNull();expect(text(f.root)).not.toContain('12.50')}
  f.retry();await settle();expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(3);expect(f.app.homeTruthStatus).toBe('ready');expect(text(f.root)).toContain('8.00');
});
test.each([0,undefined])('real ApiClient transport HTTP429 header %s preserves actual RetryAfter and current retry recovery',async retryAfter=>{
 const headers:Record<string,string>=retryAfter===undefined?{}:{'Retry-After':String(retryAfter)};
 const client=createApiClient({baseUrl:'https://transport.invalid',vault:{read:()=>null,revision:()=>0}as never,transport:{request:async()=>({status:429,headers,data:{code:429,message:'LIMIT',data:null}})}});
 const failure=await client.request({path:'/overview',authenticated:false}).catch(error=>error);expect(failure).toMatchObject({kind:'http',status:429,code:429});expect((failure as ApiError).retryAfterMs).toBe(retryAfter===undefined?undefined:0);
 remote.appHomeApi.fetch.mockResolvedValueOnce(truth()).mockRejectedValueOnce(failure).mockResolvedValueOnce(truth(8));const f=screen();f.show();await settle();await f.app.refreshHomeTruth();await settle();expect(f.app.homeTruthRateLimited).toBe(true);expect(text(f.root)).toContain('12.50');
 if(retryAfter===undefined){f.retry();f.show();await f.app.refreshHomeTruth();expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(2);vi.advanceTimersByTime(29_999);f.retry();await settle();expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(2);vi.advanceTimersByTime(1)}
 f.retry();await settle();expect(remote.appHomeApi.fetch).toHaveBeenCalledTimes(3);expect(text(f.root)).toContain('8.00');expect(f.app.homeTruthStatus).toBe('ready');
});
