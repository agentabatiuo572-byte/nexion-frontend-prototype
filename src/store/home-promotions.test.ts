import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const boundary = vi.hoisted(() => ({ list: vi.fn(), config: { baseUrl: 'https://api.example', environment: 'dev' } }));
vi.mock('@/api/runtime', () => ({ apiRuntimeConfig: boundary.config, promotionApi: { list: boundary.list } }));
const page = (id='A') => ({ items: [{ activityId:id }], nextCursor:null, hasMore:false });
beforeEach(() => { vi.resetModules(); boundary.list.mockReset();boundary.config.environment='dev';vi.useFakeTimers();vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());
it('shares the same Home/Store placement read, shares one activation and reads normal reentry fresh, and keeps explicit reads fresh', async () => {
  const { readHomePromotions } = await import('./home-promotions');
  let complete!:(value:any)=>void;boundary.list.mockReturnValueOnce(new Promise(done=>complete=done));
  const home=readHomePromotions('user:7:1:zh',true),store=readHomePromotions('user:7:1:zh',true);
  expect(home).toBe(store);expect(boundary.list).toHaveBeenCalledTimes(1);
  expect(boundary.list).toHaveBeenCalledWith({limit:20,placement:'home.purchase-promotion'},true);
  complete(page());await home;await readHomePromotions('user:7:1:zh',true);expect(boundary.list).toHaveBeenCalledTimes(1);
  boundary.list.mockResolvedValue(page('B'));const {notifyPageActivation}=await import('@/lib/passive-tab-read');notifyPageActivation('store-reentry');await readHomePromotions('user:7:1:zh',true);expect(boundary.list).toHaveBeenCalledTimes(2);
  await readHomePromotions('user:7:1:zh',true,true);expect(boundary.list).toHaveBeenCalledTimes(3);
});
it.each([0,2_000,undefined])('honors Retry-After %s, including zero and the 30-second default', async delay => {
  const { readHomePromotions } = await import('./home-promotions');
  const { ApiError } = await import('@/api/errors');
  boundary.list.mockRejectedValueOnce(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:delay}));
  await expect(readHomePromotions('user:7:1:zh',true)).rejects.toMatchObject({status:429});
  const wait=delay??30_000;
  if(wait>0){vi.setSystemTime(wait-1);await expect(readHomePromotions('user:7:1:zh',true)).rejects.toMatchObject({status:429});expect(boundary.list).toHaveBeenCalledTimes(1);}
  boundary.list.mockResolvedValue(page());vi.setSystemTime(wait);const {notifyPageActivation}=await import('@/lib/passive-tab-read');notifyPageActivation('after-cooldown');await readHomePromotions('user:7:1:zh',true);expect(boundary.list).toHaveBeenCalledTimes(2);
});
it('isolates account, binding epoch, language, environment and anonymous scopes; a late old result never populates the new scope',async()=>{
 const {readHomePromotions}=await import('./home-promotions');let complete!:(value:any)=>void;boundary.list.mockReturnValueOnce(new Promise(done=>complete=done));
 const old=readHomePromotions('user:7:1:zh',true);boundary.list.mockResolvedValue(page('current'));
 for(const scope of ['user:8:1:zh','user:8:2:zh','user:8:2:en'])await readHomePromotions(scope,true);
 boundary.config.environment='prod';await readHomePromotions('user:8:2:en',true);await readHomePromotions('user:8:2:en',false);
 complete(page('old'));await old;expect(await readHomePromotions('user:8:2:en',false)).toEqual(page('current'));expect(boundary.list).toHaveBeenCalledTimes(6);
});
