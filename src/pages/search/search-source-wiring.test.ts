import { computed, reactive, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { specRow } from '@/lib/product-copy';
import searchPage from './search.vue?raw';

const pageSource = searchPage;
const start = pageSource.indexOf('let searchSourceReadEpoch');
const end = pageSource.indexOf('// Static route');
if (start < 0 || end < start) throw new Error('search source block not found');
const sourceBlock = pageSource.slice(start, end);
const executableSourceBlock = ts.transpileModule(sourceBlock, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function setup(remoteApiEnabled = true, refreshCatalog?: ReturnType<typeof vi.fn>, faqReader: ReturnType<typeof vi.fn> = vi.fn(async () => [])) {
  const app = reactive({
    accountKey: 'user-a',
    accountBindingEpoch: 1,
    visibleDevices: [{ id: 'device-a', name: 'Device A' }],
    remoteFleetStatus: 'ready',
    remoteFleetHasSnapshot: false,
    remoteAssignmentStatus: 'ready',
    refreshRemoteFleet: vi.fn(async () => undefined),
  });
  const network = reactive({
    remoteStatus: 'ready',
    members: [{ id: 'member-a', name: 'Member A' }],
    refreshCanonicalNetwork: vi.fn(async () => undefined),
  });
  const productCatalogState = reactive({ status: 'ready' });
  const productCatalogPresentation = ref<{ products: { id: string; name: string; tagline: string; price: number }[] } | null>({
    products: [{ id: 'server-sku', name: 'Server SKU', tagline: 'Server specification', price: 321 }],
  });
  const PRODUCTS = [{ id: 'mock-sku', name: 'Mock SKU', tagline: 'Mock specification', price: 123 }];
  const refreshProductCatalog = refreshCatalog ?? vi.fn(async () => true);
  const staking = { syncRemote: vi.fn(async () => undefined) };
  const locale = reactive({ code: 'zh' });
  const t = ref({ store: { specGpu: 'GPU', specVram: 'VRAM' } });
  const productCopy = vi.fn(() => ({ tagline: 'Localized fixture tagline' }));
  const factory = new Function(
    'computed', 'app', 'network', 'remoteApiEnabled', 'productCatalogState', 'productCatalogPresentation', 'PRODUCTS',
    'refreshProductCatalog', 'staking', 'locale', 'createPageVisibilityRefresh', 'bindPageVisibilityRefresh',
    'watch', 'onMounted', 'onShow', 'onHide', 'ref', 'supportApi', 'readPublishedFaqPages', 't', 'productCopy', 'specRow',
    `${executableSourceBlock}\nreturn { refreshSearchSources, refreshPublishedFaqs, publishedFaqs, publishedFaqStatus, devices, members, searchableProducts, productSearchDetail };`,
  );
  const value = factory(
    computed, app, network, remoteApiEnabled, productCatalogState, productCatalogPresentation, PRODUCTS,
    refreshProductCatalog, staking, locale, () => ({ dispose: () => undefined }), () => () => undefined,
    () => undefined, () => undefined, () => undefined, () => undefined, ref, {}, faqReader, t, productCopy, specRow,
  );
  return { ...value, app, network, productCatalogState, productCatalogPresentation, refreshProductCatalog, staking, locale, faqReader };
}

describe('search remote source wiring', () => {
  it('shows server SKU specs instead of a conflicting marketing tagline', () => {
    const sku = { id: 'p2', name: 'StellarRack P2', price: 7499, tagline: 'H100 rack', gpu: '8× RTX 4090', vram: '192GB' };
    expect(setup(true).productSearchDetail(sku)).toBe('8× RTX 4090 · 192GB');
    expect(setup(true).productSearchDetail({ ...sku, gpu: 'unavailable', vram: '' })).toBe('');
    expect(setup(false).productSearchDetail(sku)).toBe('Localized fixture tagline');
  });

  it('searches only the current server catalogue in remote mode and no mock product while loading or failed', () => {
    const remote = setup(true);
    expect(remote.searchableProducts.value.map((p: { id: string }) => p.id)).toEqual(['server-sku']);
    remote.productCatalogState.status = 'loading';
    expect(remote.searchableProducts.value).toEqual([]);
    remote.productCatalogState.status = 'error';
    expect(remote.searchableProducts.value).toEqual([]);
    remote.productCatalogState.status = 'ready';
    remote.productCatalogPresentation.value = null;
    expect(remote.searchableProducts.value).toEqual([]);

    const local = setup(false);
    expect(local.searchableProducts.value.map((p: { id: string }) => p.id)).toEqual(['mock-sku']);
  });

  it('starts FAQ reads independently of a pending catalogue and rejects an old language response', async () => {
    let finishFaq!: (value: { id: string }[]) => void;
    const faqReader = vi.fn(() => new Promise<{ id: string }[]>(resolve => { finishFaq = resolve; }));
    const state = setup(true, vi.fn(() => new Promise<boolean>(() => {})), faqReader);
    void state.refreshSearchSources();
    expect(faqReader).toHaveBeenCalledWith(expect.anything(), 'zh', expect.any(Function));
    state.locale.code = 'vi';
    finishFaq([{ id: 'old-zh' }]);
    await Promise.resolve();
    expect(state.publishedFaqs.value).toEqual([]);
  });

  it('keeps a newer same-account read pending when an obsolete request fails, then retries successfully', async () => {
    let failOld!: (reason: Error) => void;
    let finishNew!: (value: { id: string }[]) => void;
    const faqReader = vi.fn<() => Promise<{ id: string }[]>>()
      .mockImplementationOnce(() => new Promise((_, reject) => { failOld = reject; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }))
      .mockResolvedValueOnce([]);
    const state = setup(true, undefined, faqReader);
    const old = state.refreshPublishedFaqs();
    state.app.accountBindingEpoch += 1;
    const current = state.refreshPublishedFaqs();
    failOld(new Error('old account unavailable'));
    await old;
    expect(state.publishedFaqStatus.value).toBe('loading');
    finishNew([{ id: 'current' }]);
    await current;
    expect(state.publishedFaqs.value).toEqual([{ id: 'current' }]);
    await state.refreshPublishedFaqs();
    expect(state.publishedFaqs.value).toEqual([]);
    expect(state.publishedFaqStatus.value).toBe('ready');
  });

  it('does not search stale members or devices while their remote source is not current', () => {
    const state = setup(true);
    state.network.remoteStatus = 'error';
    state.app.remoteFleetStatus = 'loading';

    expect(state.members.value).toEqual([]);
    expect(state.devices.value).toEqual([]);
  });

  it('keeps a confirmed same-account fleet snapshot searchable while a background refresh is loading', () => {
    const state = setup(true);
    state.app.remoteFleetStatus = 'loading';
    state.app.remoteFleetHasSnapshot = true;

    expect(state.devices.value).toEqual([{ id: 'device-a', name: 'Device A' }]);
  });

  it('refreshes the fleet source and keeps local mock sources available', async () => {
    const remote = setup(true);
    await remote.refreshSearchSources(true);
    expect(remote.app.refreshRemoteFleet).toHaveBeenCalledWith(undefined, { coalesce: false });
    expect(remote.refreshProductCatalog).toHaveBeenCalledWith(true);
    expect(remote.network.refreshCanonicalNetwork).toHaveBeenCalledOnce();
    expect(remote.staking.syncRemote).toHaveBeenCalledOnce();

    const local = setup(false);
    local.network.remoteStatus = 'idle';
    local.app.remoteFleetStatus = 'idle';
    local.app.remoteAssignmentStatus = 'idle';
    expect(local.members.value).toHaveLength(1);
    expect(local.devices.value).toHaveLength(1);
  });

  it('waits for the current catalogue revision before starting the fleet read and drops an old account continuation', async () => {
    let finishCatalog!: (value: boolean) => void;
    const catalog = vi.fn(() => new Promise<boolean>((resolve) => { finishCatalog = resolve; }));
    const state = setup(true, catalog);

    const read = state.refreshSearchSources(true);
    expect(state.app.refreshRemoteFleet).not.toHaveBeenCalled();

    state.app.accountKey = 'user-b';
    state.app.accountBindingEpoch = 2;
    finishCatalog(true);
    await read;
    expect(state.app.refreshRemoteFleet).not.toHaveBeenCalled();
  });

  it('lets the newest same-scope read recover independent sources even when its catalogue read fails', async () => {
    let finishFirst!: (value: boolean) => void;
    let finishSecond!: (value: boolean) => void;
    const catalog = vi.fn()
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishSecond = resolve; }));
    const state = setup(true, catalog);

    const oldRead = state.refreshSearchSources(true);
    const currentRead = state.refreshSearchSources(true);
    finishFirst(false);
    await oldRead;
    expect(state.app.refreshRemoteFleet).not.toHaveBeenCalled();

    finishSecond(false);
    await currentRead;
    expect(state.app.refreshRemoteFleet).toHaveBeenCalledWith(undefined, { coalesce: false });
    expect(state.network.refreshCanonicalNetwork).toHaveBeenCalledOnce();
  });
});
