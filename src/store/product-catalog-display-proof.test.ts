import { computed, reactive, watch } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/errors';
const mock = vi.hoisted(() => ({catalog:vi.fn(), config:null as any, clear:vi.fn(), replace:vi.fn()}));
vi.mock('@/api/runtime',()=>({remoteApiEnabled:true,get apiRuntimeConfig(){return mock.config},productCatalogApi:{catalog:mock.catalog}}));
vi.mock('@/mock/products',()=>({clearProductCatalog:mock.clear,replaceProductCatalog:mock.replace}));
const snapshot={products:[],source:'nx_product',sourceEnvironment:'PRODUCTION',runId:'',serverCanonical:true,revision:'one'};
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise<any>(r=>resolve=r);return{promise,resolve};}
beforeEach(()=>{vi.resetModules();vi.doMock("@/api/errors",()=>({ApiError}));vi.clearAllMocks();mock.config=reactive({environment:'dev',baseUrl:'https://test.invalid'});mock.catalog.mockResolvedValue(snapshot)});
afterEach(()=>vi.useRealTimers());
it.each([
 new ApiError({kind:'network',message:'offline'}),new ApiError({kind:'network',message:'REQUEST_TIMEOUT'}),
 new ApiError({kind:'http',status:500,message:'down'}),new ApiError({kind:'http',status:503,message:'down'}),
 new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:0})
])('retains only display proof through %s without a synchronous invalidation gap',async error=>{
 const c=await import('./product-catalog');await c.refreshProductCatalog(true);const states:boolean[]=[];
 const valid=computed(()=>c.isProductCatalogDisplayCurrent()&&c.productCatalogDisplayProof.value!==null);
 const stop=watch(()=>[valid.value,c.productCatalogState.serverCanonical,c.productCatalogState.sourceEnvironment],()=>states.push(valid.value),{flush:'sync'});
 mock.catalog.mockRejectedValue(error);expect(await c.refreshProductCatalog(true)).toBe(false);
 expect(states.length).toBeGreaterThan(0);expect(states.every(Boolean)).toBe(true);expect(valid.value).toBe(true);
 expect(c.productCatalogState).toMatchObject({status:'error',serverCanonical:false,sourceEnvironment:'',runId:'',revision:null});expect(mock.clear).toHaveBeenCalled();
 expect(Object.keys(c.productCatalogDisplayProof.value!).sort()).toEqual(['bindingEpoch','revision','runId','runtimeEpoch','sourceEnvironment'].sort());stop();
});
it.each([
 new ApiError({kind:'auth',code:403,message:'denied'}),new ApiError({kind:'http',status:401,message:'denied'}),new ApiError({kind:'http',status:403,message:'denied'}),
 new ApiError({kind:'business',code:403,message:'denied'}),new ApiError({kind:'network',status:403,message:'contradiction'}),new ApiError({kind:'business',message:'off'}),
 new ApiError({kind:'protocol',message:'invalid'}),new ApiError({kind:'configuration',message:'invalid'}),new Error('unknown')
])('revokes display proof for strict %s',async error=>{
 const c=await import('./product-catalog');await c.refreshProductCatalog(true);mock.catalog.mockRejectedValue(error);await c.refreshProductCatalog(true);
 expect(c.productCatalogDisplayProof.value).toBeNull();expect(c.isProductCatalogDisplayCurrent()).toBe(false);expect(c.productCatalogState.serverCanonical).toBe(false);
});
it.each(['prepare','environment','baseUrl','write'])('rejects old pending catalog after %s, including A-B-A',async boundary=>{
 const c=await import('./product-catalog'),r=await import('@/api/order-api');await c.refreshProductCatalog(true);const old=deferred();mock.catalog.mockReturnValue(old.promise);const pending=c.refreshProductCatalog(true);
 if(boundary==='prepare'){c.prepareProductCatalog();c.prepareProductCatalog()}
 if(boundary==='environment'){mock.config.environment='prod';mock.config.environment='dev'}
 if(boundary==='baseUrl'){mock.config.baseUrl='https://other.invalid';mock.config.baseUrl='https://test.invalid'}
 if(boundary==='write')r.advanceRuntimeRevision('write');
 expect(c.productCatalogDisplayProof.value).toBeNull();old.resolve({...snapshot,revision:'stale'});expect(await pending).toBe(false);expect(c.productCatalogDisplayProof.value).toBeNull();
 mock.catalog.mockResolvedValue({...snapshot,revision:'fresh'});expect(await c.refreshProductCatalog(true)).toBe(true);expect(c.isProductCatalogDisplayCurrent()).toBe(true);expect(c.productCatalogDisplayProof.value?.revision).toBe('fresh');
});
it('revokes on a nested external write before its own listener, without finally restoring proof',async()=>{
 const r=await import('@/api/order-api');let nested=false;const off=r.subscribeRuntimeRevision(()=>{if(nested){nested=false;r.advanceRuntimeRevision('write')}});
 const c=await import('./product-catalog');await c.refreshProductCatalog(true);nested=true;mock.catalog.mockRejectedValue(new ApiError({kind:'network',message:'offline'}));
 await c.refreshProductCatalog(true);expect(c.productCatalogDisplayProof.value).toBeNull();expect(c.isProductCatalogDisplayCurrent()).toBe(false);off();
});
it.each([0,2000,undefined])('retains proof but blocks every entry for 429 RetryAfter %s',async delay=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(0);const c=await import('./product-catalog');await c.refreshProductCatalog(true);
 mock.catalog.mockRejectedValue(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:delay}));await c.refreshProductCatalog(true);const count=mock.catalog.mock.calls.length,wait=delay??30000;
 if(wait>0){for(const read of [()=>c.refreshProductCatalog(true),()=>c.refreshProductCatalog(),()=>c.revalidateProductCatalog()])expect(await read()).toBe(false);expect(mock.catalog).toHaveBeenCalledTimes(count);vi.setSystemTime(wait-1);expect(await c.refreshProductCatalog(true)).toBe(false);expect(mock.catalog).toHaveBeenCalledTimes(count)}
 vi.setSystemTime(wait);mock.catalog.mockResolvedValue({...snapshot,revision:'new'});expect(await c.refreshProductCatalog(true)).toBe(true);expect(mock.catalog).toHaveBeenCalledTimes(count+1);expect(c.productCatalogDisplayProof.value?.revision).toBe('new');
});
it.each([{runId:'other'},{sourceEnvironment:'TEST'},{serverCanonical:false}])('does not establish display proof from invalid namespace %s',async change=>{
 const c=await import('./product-catalog');await c.refreshProductCatalog(true);mock.catalog.mockResolvedValue({...snapshot,...change});await c.refreshProductCatalog(true);expect(c.productCatalogDisplayProof.value).toBeNull();
});
it.each(['write','prepare'])('cannot publish old success after a synchronous presentation %s',async boundary=>{
 const c=await import('./product-catalog'),r=await import('@/api/order-api');await c.refreshProductCatalog(true);let fired=false;
 const stop=watch(c.productCatalogPresentation,s=>{if(s?.revision==='race'&&!fired){fired=true;if(boundary==='write')r.advanceRuntimeRevision('write');else{c.prepareProductCatalog();c.prepareProductCatalog()}}},{flush:'sync'});
 mock.catalog.mockResolvedValue({...snapshot,revision:'race'});expect(await c.refreshProductCatalog(true)).toBe(false);expect(fired).toBe(true);
 expect(c.productCatalogDisplayProof.value).toBeNull();expect(c.isProductCatalogDisplayCurrent()).toBe(false);expect(c.productCatalogState.serverCanonical).toBe(false);expect(c.productCatalogState.status).not.toBe('ready');stop();
});
it.each(['source','sourceEnvironment','serverCanonical','revision','status'] as const)('stops all remaining success writes if synchronous live %s observer rebinds',async field=>{
 const c=await import('./product-catalog');await c.refreshProductCatalog(true);c.prepareProductCatalog();let fired=false;
 const stop=watch(()=>c.productCatalogState[field],value=>{if(!fired&&(field==='source'?value==='next':field==='sourceEnvironment'?value==='PRODUCTION':field==='serverCanonical'?value===true:field==='revision'?value==='race':field==='status'?value==='ready':false)){fired=true;c.prepareProductCatalog();c.prepareProductCatalog()}},{flush:'sync'});
 mock.catalog.mockResolvedValue({...snapshot,source:'next',revision:'race'});const ok=await c.refreshProductCatalog(true);
 expect(fired).toBe(true);expect(ok).toBe(false);expect(c.productCatalogDisplayProof.value).toBeNull();expect(c.productCatalogState.serverCanonical).toBe(false);expect(c.productCatalogState.status).not.toBe('ready');stop();
});
it('foreign write during the before-notify stamp revokes immediately and outer stale notification cannot revive',async()=>{
 const c=await import('./product-catalog'),r=await import('@/api/order-api');await c.refreshProductCatalog(true);let inside:any;let armed=true;const events:number[]=[];
 const off=r.subscribeRuntimeRevision(scope=>events.push(scope.epoch));
 const stop=watch(c.productCatalogDisplayProof,(now,old)=>{if(armed&&now&&old&&now.runtimeEpoch===old.runtimeEpoch+1){armed=false;r.advanceRuntimeRevision('foreign-write');inside={current:c.isProductCatalogDisplayCurrent(),proof:c.productCatalogDisplayProof.value}}},{flush:'sync'});
 mock.catalog.mockRejectedValue(new ApiError({kind:'network',message:'offline'}));await c.refreshProductCatalog(true);
 expect(inside).toEqual({current:false,proof:null});expect(events).toHaveLength(2);expect(events[0]).toBe(events[1]+1);expect(c.productCatalogDisplayProof.value).toBeNull();expect(c.productCatalogState.serverCanonical).toBe(false);expect(c.isProductCatalogDisplayCurrent()).toBe(false);stop();off();
});
it.each([
 {kind:'auth',status:429},{kind:'business',status:429},{kind:'protocol',status:429},{kind:'configuration',status:429},
 {kind:'http',status:429,code:403},{kind:'http',status:429,code:401},{kind:'http',status:404,code:429},{kind:'http',status:503,code:429},
])('strict/mismatched429 does not impose cooldown for %s',async detail=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(0);const c=await import('./product-catalog');await c.refreshProductCatalog(true);mock.catalog.mockRejectedValue(new ApiError({...detail,kind:detail.kind as any,message:'strict numeric'}));await c.refreshProductCatalog(true);
 const count=mock.catalog.mock.calls.length;mock.catalog.mockResolvedValue({...snapshot,revision:'recovered'});expect(await c.refreshProductCatalog(true)).toBe(true);expect(mock.catalog).toHaveBeenCalledTimes(count+1);expect(c.productCatalogState.status).toBe('ready');
});
