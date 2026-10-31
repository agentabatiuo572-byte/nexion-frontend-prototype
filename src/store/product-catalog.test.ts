import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from 'vue';
import ts from 'typescript';
import storePage from '@/pages/store/store.vue?raw';
import { isProductAvailable } from './product-availability';
afterEach(()=>vi.useRealTimers());

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  clear: vi.fn(),
  replace: vi.fn(),
  advanceRuntimeRevision: vi.fn(),
}));

vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  apiRuntimeConfig: { environment: "dev", baseUrl: "https://test.invalid" },
  productCatalogApi: { catalog: mocks.catalog },
}));
vi.mock("@/api/order-api", async importOriginal => { const actual = await importOriginal<typeof import("@/api/order-api")>(); return { ...actual, advanceRuntimeRevision: (reason?: unknown, beforeNotify?: (scope: import("@/api/order-api").RuntimeRevisionScope) => void) => { mocks.advanceRuntimeRevision(reason); actual.advanceRuntimeRevision(reason, beforeNotify); } }; });
vi.mock("@/mock/products", () => ({
  clearProductCatalog: mocks.clear,
  replaceProductCatalog: mocks.replace,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("product catalog refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it('merges passive tab reads, shares one activation and reads new visits fresh, and leaves forced epoch refreshes fresh',async()=>{
    vi.useFakeTimers();vi.setSystemTime(0);const catalog=await import('./product-catalog'),pending=deferred<any>();
    mocks.catalog.mockReturnValueOnce(pending.promise);const first=catalog.revalidateProductCatalog(),second=catalog.revalidateProductCatalog();
    expect(first).toBe(second);expect(mocks.catalog).toHaveBeenCalledTimes(1);
    const snapshot={products:[],source:'catalog',sourceEnvironment:'PRODUCTION',runId:'',serverCanonical:true,revision:'one'};
    pending.resolve(snapshot);await first;await catalog.revalidateProductCatalog();expect(mocks.catalog).toHaveBeenCalledTimes(1);
    mocks.catalog.mockResolvedValue(snapshot);const {notifyPageActivation}=await import('@/lib/passive-tab-read');notifyPageActivation('store-reentry');await catalog.revalidateProductCatalog();expect(mocks.catalog).toHaveBeenCalledTimes(2);
    await catalog.refreshProductCatalog(true);expect(mocks.catalog).toHaveBeenCalledTimes(3);expect(mocks.advanceRuntimeRevision).toHaveBeenCalledTimes(1);
    catalog.prepareProductCatalog();await catalog.revalidateProductCatalog();expect(mocks.catalog).toHaveBeenCalledTimes(4);
  });
  it.each([401,403])('clears presentation on exact HTTP %s',async status=>{
    const { ApiError } = await import('@/api/errors');
    const catalog=await import('./product-catalog');mocks.catalog.mockResolvedValueOnce({products:[{id:'p',name:'p'}],serverCanonical:true});await catalog.refreshProductCatalog(true);
    mocks.catalog.mockRejectedValueOnce(new ApiError({kind:'http',status,message:'denied'}));await catalog.refreshProductCatalog(true);expect(catalog.productCatalogPresentation.value).toBeNull();
  });
  it.each([0,5_000,undefined])('cools passive 429 reads for Retry-After %s',async delay=>{
    const { ApiError } = await import('@/api/errors');
    vi.useFakeTimers();vi.setSystemTime(0);const catalog=await import('./product-catalog');
    mocks.catalog.mockRejectedValueOnce(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:delay}));await catalog.revalidateProductCatalog();
    const wait=delay??30_000;if(wait>0){vi.setSystemTime(wait-1);await catalog.revalidateProductCatalog();expect(mocks.catalog).toHaveBeenCalledTimes(1);}
    mocks.catalog.mockResolvedValueOnce({products:[],serverCanonical:true});vi.setSystemTime(wait);const {notifyPageActivation}=await import('@/lib/passive-tab-read');notifyPageActivation('store-after-cooldown');await catalog.revalidateProductCatalog();expect(mocks.catalog).toHaveBeenCalledTimes(2);
  });
  it.each([false,true])('a 429 from force=%s blocks every same-scope reader without promoting retained display to success',async force=>{
    vi.useFakeTimers();vi.setSystemTime(0);const {ApiError}=await import('@/api/errors'),catalog=await import('./product-catalog');
    const snapshot={products:[{id:'confirmed',name:'confirmed'}],source:'catalog',serverCanonical:true,revision:'one'};
    mocks.catalog.mockResolvedValue(snapshot);await catalog.refreshProductCatalog(true);const display=catalog.productCatalogPresentation.value;
    mocks.catalog.mockRejectedValueOnce(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:5_000}));expect(await catalog.refreshProductCatalog(force)).toBe(force?false:true);
    // A non-forced ready read is intentionally a cache hit; make its next actual read fail.
    if(!force){catalog.prepareProductCatalog();expect(await catalog.refreshProductCatalog()).toBe(false);}
    const calls=mocks.catalog.mock.calls.length,notifications=mocks.advanceRuntimeRevision.mock.calls.length;
    const results=await Promise.all([catalog.revalidateProductCatalog(),catalog.refreshProductCatalog(true),catalog.refreshProductCatalog(false),catalog.refreshProductCatalog(true)]);
    expect(results).toEqual([false,false,false,false]);expect(mocks.catalog).toHaveBeenCalledTimes(calls);expect(mocks.advanceRuntimeRevision).toHaveBeenCalledTimes(notifications);
    expect(catalog.productCatalogState.status).toBe('error');expect(catalog.productCatalogState.serverCanonical).toBe(false);
    if(force)expect(catalog.productCatalogPresentation.value).toBe(display);
  });
  it.each([0,2_000,undefined])('force respects Retry-After %s, then resumes latest-epoch semantics at expiry',async delay=>{
    vi.useFakeTimers();vi.setSystemTime(0);const {ApiError}=await import('@/api/errors'),catalog=await import('./product-catalog');
    const snapshot={products:[],source:'catalog',serverCanonical:true,revision:'new'};mocks.catalog.mockResolvedValue(snapshot);
    mocks.catalog.mockRejectedValueOnce(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:delay}));expect(await catalog.refreshProductCatalog(true)).toBe(false);
    const wait=delay??30_000;if(wait>0){vi.setSystemTime(wait-1);expect(await catalog.refreshProductCatalog(true)).toBe(false);expect(mocks.catalog).toHaveBeenCalledTimes(1);}
    vi.setSystemTime(wait);const older=deferred<any>(),newer=deferred<any>();mocks.catalog.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const first=catalog.refreshProductCatalog(true),latest=catalog.refreshProductCatalog(true);expect(mocks.catalog).toHaveBeenCalledTimes(3);
    newer.resolve(snapshot);expect(await latest).toBe(true);older.resolve({...snapshot,revision:'old'});expect(await first).toBe(false);expect(catalog.productCatalogState.revision).toBe('new');
  });
  it('scope reset clears an active cooldown and an old-scope 429 cannot poison the new scope',async()=>{
    vi.useFakeTimers();vi.setSystemTime(0);const {ApiError}=await import('@/api/errors'),catalog=await import('./product-catalog');
    const snapshot={products:[],source:'catalog',serverCanonical:true,revision:'current'};
    mocks.catalog.mockRejectedValueOnce(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:60_000}));await catalog.refreshProductCatalog(true);
    catalog.prepareProductCatalog();mocks.catalog.mockResolvedValueOnce(snapshot);expect(await catalog.refreshProductCatalog(true)).toBe(true);
    let rejectOld!:(cause:unknown)=>void;mocks.catalog.mockReturnValueOnce(new Promise((_done,fail)=>rejectOld=fail));const old=catalog.refreshProductCatalog(true);
    catalog.prepareProductCatalog();mocks.catalog.mockResolvedValueOnce(snapshot);expect(await catalog.refreshProductCatalog(true)).toBe(true);
    rejectOld(new ApiError({kind:'http',status:429,message:'old limited',retryAfterMs:60_000}));expect(await old).toBe(false);
    mocks.catalog.mockResolvedValueOnce(snapshot);expect(await catalog.refreshProductCatalog(true)).toBe(true);expect(catalog.productCatalogState.status).toBe('ready');expect(catalog.productCatalogState.error).toBe('');expect(mocks.catalog).toHaveBeenCalledTimes(5);
  });
  it('the actual Store list keeps six read products through passive refresh/failure and accepts a published empty list',async()=>{
    const catalog=await import('./product-catalog'),snapshot={products:Array.from({length:6},(_,i)=>({id:String(i),name:String(i),available:true})),source:'catalog',serverCanonical:true};
    mocks.catalog.mockResolvedValueOnce(snapshot);await catalog.refreshProductCatalog(true);
    const script=storePage.split('<script setup lang="ts">')[1].split('</script>')[0],source=ts.createSourceFile('store.ts',script,ts.ScriptTarget.Latest,true),names=['displayCatalog','displayProducts','catalogHasProducts','unlockedProducts','catalogProducts'];
    const statements=source.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>names.includes(d.name.getText(source))));
    const js=ts.transpileModule(statements.map(s=>s.getText(source)).join('\n')+'\nreturn {catalogProducts,catalogHasProducts};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const view=new Function('computed','remoteApiEnabled','productCatalogPresentation','publicOnly','activityId','activity','mounted','phase','isProductAvailable','focusFeatured',js)(computed,true,catalog.productCatalogPresentation,ref(false),ref(''),ref(null),ref(true),ref({id:'P4'}),isProductAvailable,ref(null));
    expect(view.catalogProducts.value).toHaveLength(6);const pending=deferred<any>();mocks.catalog.mockReturnValueOnce(pending.promise);const read=catalog.refreshProductCatalog(true);expect(view.catalogProducts.value).toHaveLength(6);pending.resolve(snapshot);await read;
    mocks.catalog.mockRejectedValueOnce(new Error('offline'));await catalog.refreshProductCatalog(true);expect(view.catalogProducts.value).toHaveLength(6);
    mocks.catalog.mockResolvedValueOnce({...snapshot,products:[]});await catalog.refreshProductCatalog(true);expect(view.catalogProducts.value).toEqual([]);expect(view.catalogHasProducts.value).toBe(false);
  });

  it("keeps only a presentation snapshot during refresh/error, accepts real deletions, and clears on rebind", async () => {
    const snapshot = { products: [{ id: "confirmed", name: "UVELBox S1" }], source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "one" };
    mocks.catalog.mockResolvedValueOnce(snapshot);
    const catalog = await import("./product-catalog");
    expect(catalog.productCatalogPresentation.value).toBeNull();
    await catalog.refreshProductCatalog(true);
    const confirmed = catalog.productCatalogPresentation.value;
    const pending = deferred<any>();
    mocks.catalog.mockReturnValueOnce(pending.promise);
    const refresh = catalog.refreshProductCatalog(true);
    expect(catalog.productCatalogState.status).toBe("loading");
    expect(catalog.productCatalogPresentation.value).toBe(confirmed);
    pending.resolve({ ...snapshot, revision: "two" });
    await refresh;
    mocks.catalog.mockRejectedValueOnce(new Error("offline"));
    await catalog.refreshProductCatalog(true);
    expect(catalog.productCatalogState.status).toBe("error");
    expect(catalog.productCatalogState.serverCanonical).toBe(false);
    expect(mocks.clear).toHaveBeenCalled();
    expect(catalog.productCatalogPresentation.value?.products).toEqual(snapshot.products);
    mocks.catalog.mockResolvedValueOnce({ ...snapshot, products: [], revision: "deleted" });
    await catalog.refreshProductCatalog(true);
    expect(catalog.productCatalogPresentation.value?.products).toEqual([]);
    catalog.prepareProductCatalog();
    expect(catalog.productCatalogPresentation.value).toBeNull();
  });

  it.each(["Nexi" + "onBox Pro v2", "StellarBox Pro v2", "stellarbox Pro v2"])("presents the stored name %s verbatim without changing the raw catalog or SKU", async (legacyName) => {
    const snapshot = { products: [{ id: "stellarbox-pro-v2", name: legacyName }], source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "brand" };
    mocks.catalog.mockResolvedValueOnce(snapshot);
    const catalog = await import("./product-catalog");

    await catalog.refreshProductCatalog(true);

    expect(catalog.productCatalogPresentation.value?.products[0]).toMatchObject({
      id: "stellarbox-pro-v2", name: legacyName, // published names are source-owned (689303fc)
    });
    expect(mocks.replace).toHaveBeenCalledWith(snapshot.products);
    expect(snapshot.products[0].name).toBe(legacyName);
  });

  it("lets a forced refresh supersede an older request and ignores its late response", async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    mocks.catalog.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const catalog = await import("./product-catalog");

    const firstRequest = catalog.refreshProductCatalog(true);
    const secondRequest = catalog.refreshProductCatalog(true);

    expect(secondRequest).not.toBe(firstRequest);
    expect(mocks.catalog).toHaveBeenCalledTimes(2);

    second.resolve({ products: [{ id: "new", name: "New" }], source: "new", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "new" });
    await secondRequest;
    first.resolve({ products: [{ id: "old", name: "Old" }], source: "old", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "old" });
    await firstRequest;

    expect(catalog.productCatalogState.revision).toBe("new");
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it("clears a same-account rebind and accepts only the replacement catalog", async () => {
    const beforeRebind = deferred<any>();
    const afterRebind = deferred<any>();
    mocks.catalog.mockReturnValueOnce(beforeRebind.promise).mockReturnValueOnce(afterRebind.promise);
    const catalog = await import("./product-catalog");

    const oldRequest = catalog.refreshProductCatalog(true);
    catalog.prepareProductCatalog();
    expect(catalog.productCatalogState.status).toBe("loading");
    const currentRequest = catalog.refreshProductCatalog(true);

    beforeRebind.resolve({ products: [{ id: "old", name: "Old" }], source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "old" });
    await oldRequest;
    expect(mocks.replace).not.toHaveBeenCalled();

    afterRebind.resolve({ products: [{ id: "current", name: "Current" }], source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, revision: "current" });
    await currentRequest;
    expect(catalog.productCatalogState.status).toBe("ready");
    expect(catalog.productCatalogState.revision).toBe("current");
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
});
