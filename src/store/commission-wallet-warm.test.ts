import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia';
import { reactive, watch } from 'vue';
import { ApiError } from '@/api/errors';
import { advanceRuntimeRevision } from '@/api/order-api';
import { refreshProductCatalog, prepareProductCatalog } from './product-catalog';
import { useCommission } from './commission';
import { useLocaleStore } from './locale';
import { notifyPageActivation } from '@/lib/passive-read-window';

const remote = vi.hoisted(() => ({ remoteApiEnabled: true, apiRuntimeConfig: {} as any,
  productCatalogApi: { catalog: vi.fn() }, commissionConfigApi: { rates: vi.fn(), binary: vi.fn() },
  teamInsightsApi: { commissions: vi.fn() } }));
vi.mock('@/api/runtime', () => remote);
const proof = { source: 'server', serverCanonical: true, sourceEnvironment: 'PRODUCTION', runId: '' };
const snapshot = (totalUSDT: number | null = 1313.69) => ({ ...proof, events: [], page: 1, totalRows: 0, aggregate: { totalUSDT } });
function deferred() { let resolve!: (v: any) => void, reject!: (e: unknown) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
let pinia: Pinia, revision = 0;
beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); vi.clearAllMocks(); revision = 0;
  remote.apiRuntimeConfig = reactive({ environment: 'dev', baseUrl: 'https://test.invalid' });
  remote.productCatalogApi.catalog.mockImplementation(async () => ({ ...proof, products: [], revision: String(++revision) }));
  remote.commissionConfigApi.rates.mockResolvedValue({}); remote.commissionConfigApi.binary.mockResolvedValue({});
  remote.teamInsightsApi.commissions.mockResolvedValue(snapshot()); prepareProductCatalog(); });
afterEach(() => { disposePinia(pinia); vi.useRealTimers(); });
async function warm() { await refreshProductCatalog(true); const store = useCommission(); store.bindAccount('user:fixture'); await store.ensureCanonicalEvents(); return store; }
const displayed = (store: ReturnType<typeof useCommission>) => (store as any).eventsLifetimeDisplayUSDT;

it('coalesces manual and passive reads for the current generation rather than superseding its successful response', async () => {
  const s = await warm(), pending = deferred(); remote.teamInsightsApi.commissions.mockReturnValue(pending.promise);
  const first = s.refreshCanonicalEvents(), second = s.refreshCanonicalEvents(), passive = s.ensureCanonicalEvents();
  expect(remote.teamInsightsApi.commissions).toHaveBeenCalledTimes(2);
  pending.resolve(snapshot(23)); await Promise.all([first, second, passive]); expect(s.eventsStatus).toBe('ready');
});

it('registers the current shared request before a synchronous loading watcher can reenter', async () => {
  const s = await warm(), pending = deferred(); remote.teamInsightsApi.commissions.mockReturnValue(pending.promise);
  let nested: Promise<void> | undefined;
  const stop = watch(() => s.eventsStatus, status => { if (status === 'loading') nested = s.refreshCanonicalEvents(); }, { flush: 'sync' });
  const first = s.refreshCanonicalEvents(); expect(remote.teamInsightsApi.commissions).toHaveBeenCalledTimes(2);
  pending.resolve(snapshot(23)); await Promise.all([first, nested]); expect(s.eventsStatus).toBe('ready'); stop();
});

it('keeps only display across a valid catalog revision and drops older success/failure while the current read remains joinable', async () => {
  const s = await warm(), old = deferred(), current = deferred();
  remote.teamInsightsApi.commissions.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const prior = s.refreshCanonicalEvents(); await refreshProductCatalog(true);
  expect(s.eventsEvidence).toBeNull(); expect(displayed(s)).toBe(1313.69); expect(s.eventsStatus).toBe('loading');
  const joined = s.ensureCanonicalEvents(); old.reject(new ApiError({ kind: 'http', status: 503, message: 'old' })); await prior;
  const rejoined = s.refreshCanonicalEvents(); expect(remote.teamInsightsApi.commissions).toHaveBeenCalledTimes(3);
  expect(s.eventsStatus).toBe('loading'); current.resolve(snapshot(23)); await Promise.all([joined, rejoined]);
  expect(s.eventsStatus).toBe('ready'); expect(displayed(s)).toBe(23);
});

it('ignores an old runtime success after a current strict denial and permits an actual fresh successful retry', async () => {
  const s = await warm(), old = deferred(), current = deferred(); remote.teamInsightsApi.commissions.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const prior = s.refreshCanonicalEvents(); advanceRuntimeRevision('business-write'); const joined = s.ensureCanonicalEvents();
  current.reject(new ApiError({ kind: 'http', status: 403, message: 'denied' })); await joined;
  old.resolve(snapshot(999)); await prior; expect(s.eventsStatus).toBe('error'); expect(displayed(s)).toBeNull(); expect(s.eventsReadFailed).toBe(true);
  remote.teamInsightsApi.commissions.mockResolvedValue(snapshot(23)); await s.refreshCanonicalEvents(); expect(displayed(s)).toBe(23); expect(s.eventsReadFailed).toBe(false);
});

it('updates read-only total from a successful load-more aggregate and never retains an older total after it', async () => {
  const s = await warm(); s.eventsTotalRows = 2;
  remote.teamInsightsApi.commissions.mockResolvedValueOnce({ ...snapshot(23), page: 2, totalRows: 2 }); await s.loadMoreCanonicalEvents();
  expect(displayed(s)).toBe(23); expect(s.eventsEvidence?.aggregate.totalUSDT).toBe(23);
  remote.teamInsightsApi.commissions.mockRejectedValue(new ApiError({ kind: 'network', message: 'offline' })); await s.refreshCanonicalEvents(); expect(displayed(s)).toBe(23);
});

it.each(['network', '503', '429'])('retains read-only %s history through failure/loading/failure then a normal visit recovers under protection', async kind => {
  vi.useFakeTimers({ toFake: ['Date'] }); const s = await warm();
  const error = new ApiError({ kind: kind === 'network' ? 'network' : 'http', status: kind === 'network' ? undefined : Number(kind), retryAfterMs: 0, message: kind });
  remote.teamInsightsApi.commissions.mockRejectedValue(error);
  await s.refreshCanonicalEvents(); expect(s.eventsStatus).toBe('error'); expect(s.eventsEvidence).toBeNull(); expect(displayed(s)).toBe(1313.69);
  const pending = deferred(); remote.teamInsightsApi.commissions.mockReturnValueOnce(pending.promise);
  const retry = s.refreshCanonicalEvents(); expect(displayed(s)).toBe(1313.69); expect(s.eventsStatus).toBe('loading');
  pending.reject(error); await retry; expect(displayed(s)).toBe(1313.69);
  for (const route of ['home','earn','team','me']) notifyPageActivation(route, { tabSwitch: true });
  remote.teamInsightsApi.commissions.mockResolvedValue(snapshot(0)); await s.ensureCanonicalEvents();
  expect(s.eventsStatus).toBe('ready'); expect(displayed(s)).toBe(0);
});

it('retains only display through repeated transient catalog failures that restart the current generation', async () => {
  const s = await warm(), offline = new ApiError({ kind: 'network', message: 'offline' });
  remote.productCatalogApi.catalog.mockRejectedValue(offline); remote.teamInsightsApi.commissions.mockRejectedValue(offline);
  for (let attempt = 0; attempt < 2; attempt++) {
    await refreshProductCatalog(true); await s.ensureCanonicalEvents();
    expect(s.eventsStatus).toBe('error'); expect(s.eventsEvidence).toBeNull(); expect(displayed(s)).toBe(1313.69); expect(s.eventsReadFailed).toBe(true);
  }
});

it.each(['401','403','protocol','configuration','business'])('clears confirmed display on strict %s failure', async kind => {
  const s = await warm(); remote.teamInsightsApi.commissions.mockRejectedValue(new ApiError({ kind: Number(kind) ? 'http' : kind as any, status: Number(kind) || undefined, message: kind }));
  await s.refreshCanonicalEvents(); expect(displayed(s)).toBeNull(); expect(s.eventsEvidence).toBeNull();
});

it.each(['account','binding','environment','runtime','locale','catalog'])('clears %s before a late old result can refill it', async boundary => {
  const s = await warm(), old = deferred(), fresh = deferred(); remote.teamInsightsApi.commissions.mockReturnValueOnce(old.promise).mockReturnValue(fresh.promise);
  const prior = s.refreshCanonicalEvents();
  if (boundary === 'account' || boundary === 'binding') s.bindAccount(boundary === 'account' ? 'other' : 'user:fixture');
  if (boundary === 'environment') remote.apiRuntimeConfig.environment = 'prod';
  if (boundary === 'runtime') advanceRuntimeRevision('business-write');
  if (boundary === 'locale') useLocaleStore().setLocale('vi');
  if (boundary === 'catalog') prepareProductCatalog();
  expect(displayed(s)).toBeNull(); old.resolve(snapshot(999)); await prior; expect(displayed(s)).toBeNull();
});

it('keeps first reads unknown and replaces confirmed amounts with authoritative null and zero', async () => {
  const pending = deferred(); remote.teamInsightsApi.commissions.mockReturnValueOnce(pending.promise); const s = useCommission(); s.bindAccount('user:fixture');
  expect(displayed(s)).toBeNull(); pending.resolve(snapshot()); await s.ensureCanonicalEvents(); expect(displayed(s)).toBe(1313.69);
  remote.teamInsightsApi.commissions.mockResolvedValue(snapshot(null)); await s.refreshCanonicalEvents(); expect(displayed(s)).toBeNull();
  remote.teamInsightsApi.commissions.mockResolvedValue(snapshot(0)); await s.refreshCanonicalEvents(); expect(displayed(s)).toBe(0);
});
