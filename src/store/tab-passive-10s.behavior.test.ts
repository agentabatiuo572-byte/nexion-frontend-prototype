import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPinia, disposePinia, getActivePinia, setActivePinia } from "pinia";
import { reactive, watch } from "vue";
const remote = vi.hoisted(() => ({ config: null as any, catalog: vi.fn(), referral: vi.fn() }));
vi.mock("@/api/runtime", () => ({ remoteApiEnabled:true, get apiRuntimeConfig(){return remote.config;},
  productCatalogApi:{catalog:remote.catalog}, referralRewardApi:{snapshot:remote.referral} }));
vi.mock("@/mock/products", () => ({ clearProductCatalog:vi.fn(), replaceProductCatalog:vi.fn() }));
const catalogSnapshot = () => ({ source:"nx_product", sourceEnvironment:"PRODUCTION",runId:"",serverCanonical:true,revision:"same",
  products:[{id:"p",name:"Device",price:10,stock:4,available:true}] });
const referralSnapshot = (value:string) => ({referralCode:value});
function deferred(){ let resolve!:(value:any)=>void; const promise=new Promise<any>(done=>{resolve=done});return{promise,resolve}; }
beforeEach(() => {
  vi.resetModules();vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(0);setActivePinia(createPinia());
  remote.catalog.mockReset();remote.referral.mockReset();remote.config=reactive({baseUrl:"https://test.invalid",environment:"dev"});
});
afterEach(()=>{const pinia=getActivePinia();if(pinia)disposePinia(pinia);vi.useRealTimers();});

it("replaces a cold read dropped by the first actual catalog publication without replaying its cached false",async()=>{
  const catalog=await import("./product-catalog"),{useReferralReward}=await import("./referral-reward");
  const heldCatalog=deferred(),heldReferral=deferred();remote.catalog.mockReturnValueOnce(heldCatalog.promise);
  remote.referral.mockReturnValueOnce(heldReferral.promise).mockResolvedValue(referralSnapshot("current"));
  const store=useReferralReward(),oldRead=store.ensure(),directory=catalog.revalidateProductCatalog();
  heldCatalog.resolve(catalogSnapshot());expect(await directory).toBe(true);
  heldReferral.resolve(referralSnapshot("old"));expect(await oldRead).toBe(false);expect(store.snapshot).toBeNull();
  expect(await store.ensure()).toBe(true);expect(store.snapshot?.referralCode).toBe("current");expect(remote.referral).toHaveBeenCalledTimes(2);
  await store.ensure();expect(remote.referral).toHaveBeenCalledTimes(2);
});

it("shares one visit after failure or manual recovery and retries strict denial on the next visit",async()=>{
  const {useReferralReward}=await import("./referral-reward"),{ApiError}=await import("@/api/errors");
  remote.referral.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(referralSnapshot("recovered"));
  const store=useReferralReward();expect(await store.ensure()).toBe(false);
  vi.setSystemTime(9_999);expect(await store.ensure()).toBe(false);expect(remote.referral).toHaveBeenCalledTimes(1);
  // Manual refresh bypasses the passive window and seeds its successful new attempt.
  expect(await store.refresh()).toBe(true);expect(await store.ensure()).toBe(true);expect(remote.referral).toHaveBeenCalledTimes(2);
  remote.referral.mockRejectedValueOnce(new ApiError({kind:"http",status:403,message:"denied"}));
  expect(await store.refresh()).toBe(false);expect(store.snapshot).toBeNull();expect(await store.ensure()).toBe(false);
  expect(remote.referral).toHaveBeenCalledTimes(3);
  const {notifyPageActivation}=await import('@/lib/passive-tab-read');notifyPageActivation('referral-reentry');expect(await store.ensure()).toBe(true);expect(remote.referral).toHaveBeenCalledTimes(4);
});

it("does not publish identical content, but detects same-revision price, stock and source changes",async()=>{
  const c=await import("./product-catalog"),r=await import("@/api/order-api");let publications=0;const off=r.subscribeRuntimeRevision(()=>{publications+=1});
  remote.catalog.mockResolvedValue(catalogSnapshot());expect(await c.revalidateProductCatalog()).toBe(true);expect(publications).toBe(1);
  const {notifyPageActivation}=await import('@/lib/passive-tab-read');notifyPageActivation('catalog-reentry');expect(await c.revalidateProductCatalog()).toBe(true);expect(remote.catalog).toHaveBeenCalledTimes(2);expect(publications).toBe(1);
  for(const change of [{price:11},{stock:3},{available:false}]){
    const next=catalogSnapshot();Object.assign(next.products[0],change);remote.catalog.mockResolvedValue(next);
    await c.refreshProductCatalog(true);publications-=1;expect(publications).toBe(1);
  }
  remote.catalog.mockResolvedValue({...catalogSnapshot(),source:"changed-source"});await c.refreshProductCatalog(true);publications-=1;expect(publications).toBe(1);off();
});

it.each(["failure","foreign-write","prepare"])("publishes the same old content again after %s",async boundary=>{
  const c=await import("./product-catalog"),r=await import("@/api/order-api");remote.catalog.mockResolvedValue(catalogSnapshot());await c.refreshProductCatalog(true);
  if(boundary==="failure"){remote.catalog.mockRejectedValueOnce(new Error("strict"));await c.refreshProductCatalog(true);}
  if(boundary==="foreign-write")r.advanceRuntimeRevision("write");
  if(boundary==="prepare")c.prepareProductCatalog();
  let publications=0;const off=r.subscribeRuntimeRevision(()=>{publications+=1});remote.catalog.mockResolvedValue(catalogSnapshot());
  expect(await c.refreshProductCatalog(true)).toBe(true);expect(publications).toBe(1);expect(c.isProductCatalogDisplayCurrent()).toBe(true);off();
});

it("keeps same-visit dedupe across a backwards clock, reads a new visit, and fences an account A-B-A response",async()=>{
  const {useReferralReward}=await import("./referral-reward");remote.referral.mockResolvedValue(referralSnapshot("first"));
  const store=useReferralReward();vi.setSystemTime(1_000);await store.ensure();
  vi.setSystemTime(500);await store.ensure();expect(remote.referral).toHaveBeenCalledTimes(1);const {notifyPageActivation}=await import('@/lib/passive-tab-read');notifyPageActivation('referral-reentry');await store.ensure();expect(remote.referral).toHaveBeenCalledTimes(2);
  const held=deferred();remote.referral.mockReturnValueOnce(held.promise).mockResolvedValue(referralSnapshot("A-current"));
  store.bindAccount("A");const old=store.ensure();store.bindAccount("B");store.bindAccount("A");
  expect(await store.ensure()).toBe(true);expect(store.snapshot?.referralCode).toBe("A-current");
  held.resolve(referralSnapshot("A-old"));expect(await old).toBe(false);
  expect(await store.ensure()).toBe(true);expect(store.snapshot?.referralCode).toBe("A-current");
  expect(remote.referral).toHaveBeenCalledTimes(5);
});

it.each(["ready","pending"])("immediately revalidates a catalog whose %s passive owner was invalidated externally",async state=>{
  const c=await import("./product-catalog"),r=await import("@/api/order-api");const held=deferred();
  remote.catalog.mockImplementationOnce(()=>state==="pending"?held.promise:Promise.resolve(catalogSnapshot())).mockResolvedValue(catalogSnapshot());
  const old=c.revalidateProductCatalog();if(state==="ready")await old;
  r.advanceRuntimeRevision("foreign-write");if(state==="pending"){held.resolve(catalogSnapshot());expect(await old).toBe(false);}
  expect(await c.revalidateProductCatalog()).toBe(true);expect(remote.catalog).toHaveBeenCalledTimes(2);
});

it("retains a nested manual catalog dispatch when loading synchronously supersedes the outer passive attempt",async()=>{
  const c=await import("./product-catalog");remote.catalog.mockResolvedValue(catalogSnapshot());let fired=false,manual!:Promise<boolean>;
  const off=watch(()=>c.productCatalogState.status,status=>{if(status==="loading"&&!fired){fired=true;manual=c.refreshProductCatalog(true)}},{flush:"sync"});
  // Make loading an observable transition.
  c.productCatalogState.status="error";
  expect(await c.revalidateProductCatalog()).toBe(false);expect(await manual).toBe(true);
  expect(await c.revalidateProductCatalog()).toBe(true);expect(remote.catalog).toHaveBeenCalledTimes(1);off();
});
