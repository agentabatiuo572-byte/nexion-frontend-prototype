import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDataVisibility } from '@/store/data-visibility';
import { createPassiveTabReadFixture } from '@/lib/passive-tab-read.test-support';
import source from './referral-progress.vue?raw';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { promotionMachineSlots } from '@/components/catalog-machine-image';
import type { PublicPromotion } from '@/api/promotion-contracts';
import { isPromotionActive } from '@/lib/promotion-entry';

const script = compileScript(parse(source).descriptor, { id: 'referral-progress-behavior' });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type Progress = { activityId: string; qualifyingOrders: number; ownRewards: never[] };
type View = { loading: Vue.Ref<boolean>; error: Vue.Ref<boolean>; progressErrors:Vue.Ref<Record<string,boolean>>; progressBusy:Vue.Ref<Record<string,boolean>>; termsActivity:Vue.Ref<unknown>; hasMore: Vue.Ref<boolean>; activities: Vue.Ref<Array<{activityId:string}>>; expandedActivity: Vue.Ref<string|null>; progress: Vue.Ref<Record<string, Progress>>; loadProgress: (id: string) => Promise<void>; loadActivities: (reset?:boolean) => Promise<void>; showProgress: (id:string) => void; qualifyingCount: (id:string) => number|string; referralImageProps:(activity:PublicPromotion)=>{sku?:string;imageUrl?:string;refreshKey:string} };
const cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.stubGlobal('uni', { getStorageSync: () => undefined, setStorageSync: vi.fn() });
  setActivePinia(createPinia());
});
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await Vue.nextTick(); };
function mount() {
  const app = Vue.reactive({ accountKey: 'user:7', accountBindingEpoch: 1 });
  const auth = Vue.reactive({ isAuthenticated: true });
  const passive = createPassiveTabReadFixture(() => JSON.stringify([app.accountKey, app.accountBindingEpoch, auth.isAuthenticated]));
  passive.notifyPageActivation('/pages/team/team');
  const products=Vue.reactive<Record<string,{imageUrl?:string}>>({});
  const catalog=Vue.reactive({status:'ready',revision:'1',serverCanonical:true});
  const list = vi.fn().mockResolvedValue({ items: [{ activityId: 'A', template: 'DIRECT_REFERRAL', state:'ACTIVE' }], nextCursor: null, hasMore: false });
  const refreshProductCatalog=vi.fn().mockResolvedValue(true);
  const referral = vi.fn<(id: string) => Promise<Progress>>().mockImplementation(async id => ({ activityId: id, qualifyingOrders: 1, ownRewards: [] }));
  const unmounted: Array<() => void> = [];
  const shown:Array<()=>void>=[],hidden:Array<()=>void>=[];
  const modules: Record<string, unknown> = {
    '@/lib/passive-tab-read': passive,
    vue: { ...Vue, onBeforeUnmount: (fn: () => void) => unmounted.push(fn) },
    '@/composables/use-tab-page-lifecycle': {onShow:(fn:()=>void)=>shown.push(fn),onHide:(fn:()=>void)=>hidden.push(fn)},
    '@/api/runtime': { remoteApiEnabled: true, sessionVault:{read:()=>auth.isAuthenticated?{user:{userId:7}}:null}, promotionApi: {
      list, referral,
    } },
    '@/store/app': { useApp: () => app }, '@/store/auth': { useAuth: () => auth },
    '@/store/data-visibility': { useDataVisibility },
    '@/i18n/use-t': { useT: () => Vue.ref({ promotion: {} }) },
    '@/store/locale': { useLocaleStore: () => ({ code: 'en' }) },
    '@/lib/promotion-display': { localized: () => '' }, './reward-rows.vue': { default: {} },
    '@/lib/promotion-entry': { isPromotionActive,promotionDisclosures: () => [] }, './promotion-terms.vue': { default: {} },
    '@/i18n/team-redesign': { teamRedesignCopy },
    '@/components/team/team-art.vue': { default: {} },
    '@/components/ui/nx-button.vue': { default: {} },
    '@/components/catalog-machine-image.vue': { default: {} },
    '@/components/catalog-machine-image': { promotionMachineSlots },
    '@/mock/products': { getProduct:(id:string)=>products[id] },
    '@/store/product-catalog': { productCatalogState:catalog,refreshProductCatalog,revalidateProductCatalog:refreshProductCatalog },
  };
  const exports = { default: {} as { setup: (props: object, context: { emit: () => void; expose: () => void }) => View } };
  new Function('require', 'exports', code)((id: string) => {
    if (!(id in modules)) throw new Error('Unexpected referral dependency: ' + id);
    return modules[id];
  }, exports);
  const scope = Vue.effectScope();
  const view = scope.run(() => exports.default.setup({}, { emit() {}, expose() {} }))!;
  const unmount = () => { unmounted.forEach(fn => fn()); scope.stop(); };
  cleanups.push(unmount);
  return { app, auth, view, list, referral, unmount, products, catalog, refreshProductCatalog,
    show:()=>{passive.notifyPageActivation('/pages/team/team');shown.forEach(fn=>fn());},
    hide:()=>{passive.notifyPageActivation('/pages/me/preferences');hidden.forEach(fn=>fn());} };
}
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.unstubAllGlobals(); });

it('clears the failed read when refreshing the same invitation progress successfully', async () => {
  const screen = mount(); await flush();
  screen.referral.mockRejectedValueOnce(new Error('offline'));
  await screen.view.loadProgress('A'); expect(screen.view.progressErrors.value.A).toBe(true);
  screen.referral.mockResolvedValueOnce({ activityId: 'A', qualifyingOrders: 2, ownRewards: [] });
  await screen.view.loadProgress('A');
  expect(screen.view.progress.value.A.qualifyingOrders).toBe(2);
  expect(screen.view.progressErrors.value.A).toBe(false); expect(screen.view.progressBusy.value.A).toBe(false);
});
it('does not let a previous account failure overwrite a new account result', async () => {
  const screen = mount(); await flush();
  let reject!: (error: Error) => void;
  screen.referral.mockReturnValueOnce(new Promise((_resolve, no) => { reject = no; }));
  const stale = screen.view.loadProgress('A');
  screen.app.accountKey = 'user:8'; screen.app.accountBindingEpoch++; await flush();
  reject(new Error('old account offline')); await stale;
  expect(screen.view.error.value).toBe(false); expect(screen.view.loading.value).toBe(false);
  expect(screen.view.progress.value.A.qualifyingOrders).toBe(1);
});
it('ignores a progress result after unmount', async () => {
  const screen = mount(); await flush();
  let resolve!: (progress: Progress) => void;
  screen.referral.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
  const stale = screen.view.loadProgress('A'); screen.unmount();
  resolve({ activityId: 'A', qualifyingOrders: 9, ownRewards: [] }); await stale;
  expect(screen.view.progress.value.A.qualifyingOrders).toBe(1);
});

it('distinguishes a confirmed zero from missing, refreshing and failed first-purchase counts', async () => {
  const screen=mount();
  expect(screen.view.qualifyingCount('A')).toBe('-');
  await flush();expect(screen.view.qualifyingCount('missing')).toBe('-');
  screen.referral.mockResolvedValueOnce({activityId:'A',qualifyingOrders:0,ownRewards:[]});
  const refresh=screen.view.loadProgress('A');expect(screen.view.qualifyingCount('A')).toBe('-');
  await refresh;expect(screen.view.qualifyingCount('A')).toBe(0);
  screen.referral.mockRejectedValueOnce(new Error('offline'));await screen.view.loadProgress('A');
  expect(screen.view.qualifyingCount('A')).toBe('-');
  await screen.view.loadProgress('A');expect(screen.view.qualifyingCount('A')).toBe(1);
});

it('opening progress refreshes real rewards and collapses on account generation change',async()=>{
  const screen=mount();await flush();screen.referral.mockClear();
  screen.view.showProgress('A');expect(screen.view.expandedActivity.value).toBe('A');
  expect(screen.referral).toHaveBeenCalledExactlyOnceWith('A');
  screen.view.showProgress('A');expect(screen.referral).toHaveBeenCalledTimes(1);
  await flush();screen.view.showProgress('A');expect(screen.view.expandedActivity.value).toBeNull();
  screen.view.showProgress('A');await flush();
  screen.app.accountBindingEpoch++;await flush();expect(screen.view.expandedActivity.value).toBeNull();
  screen.auth.isAuthenticated=false;screen.referral.mockClear();screen.view.showProgress('A');
  expect(screen.referral).not.toHaveBeenCalled();expect(screen.view.expandedActivity.value).toBeNull();
});

it('keeps pagination reachable through a page without referral activities and deduplicates subsequent results',async()=>{
  const screen=mount();await flush();
  screen.list.mockResolvedValueOnce({items:[{activityId:'gift',template:'SKU_GIFT',state:'ACTIVE'}],nextCursor:'next-page',hasMore:true});
  await screen.view.loadActivities();expect(screen.view.hasMore.value).toBe(true);
  screen.list.mockResolvedValueOnce({items:[{activityId:'A',template:'DIRECT_REFERRAL',state:'ACTIVE'},{activityId:'B',template:'DIRECT_REFERRAL',state:'ACTIVE'}],nextCursor:null,hasMore:false});
  await screen.view.loadActivities();
  expect(screen.list).toHaveBeenLastCalledWith({cursor:'next-page',limit:20},true);
  expect(screen.view.activities.value.map(row=>row.activityId)).toEqual(['A','B']);
  expect(screen.view.qualifyingCount('B')).toBe(1);expect(screen.view.hasMore.value).toBe(false);
});

it('clears old pagination and errors immediately while the next account is loading',async()=>{
  const screen=mount();await flush();screen.view.hasMore.value=true;screen.view.error.value=true;
  let resolve!:(value:unknown)=>void;screen.list.mockReturnValueOnce(new Promise(yes=>{resolve=yes;}));
  screen.app.accountBindingEpoch++;await flush();
  expect(screen.view.hasMore.value).toBe(false);expect(screen.view.error.value).toBe(false);
  expect(screen.view.activities.value).toEqual([]);expect(screen.view.qualifyingCount('A')).toBe('-');
  resolve({items:[],nextCursor:null,hasMore:false});await flush();expect(screen.view.loading.value).toBe(false);
});

it('retains the ordinary activity on hide and pending return, but shows real read errors',async()=>{
  const screen=mount();await flush();
  screen.hide();expect(screen.view.activities.value.map(row=>row.activityId)).toEqual(['A']);
  let reject!:(reason:unknown)=>void;screen.list.mockReturnValueOnce(new Promise((_yes,no)=>{reject=no;}));
  screen.show();await flush();
  expect(screen.view.activities.value.map(row=>row.activityId)).toEqual(['A']);
  reject(new Error('offline'));await flush();expect(screen.view.error.value).toBe(true);
  screen.list.mockReturnValueOnce(new Promise(()=>{}));screen.app.accountBindingEpoch++;await flush();
  expect(screen.view.activities.value).toEqual([]);
});

it('keeps another activity readable when one progress request fails and retries only that activity',async()=>{
  const screen=mount();await flush();
  screen.list.mockResolvedValueOnce({items:[{activityId:'A',template:'DIRECT_REFERRAL',state:'ACTIVE'},{activityId:'B',template:'DIRECT_REFERRAL',state:'ACTIVE'}],nextCursor:null,hasMore:false});
  screen.referral.mockImplementation(async id=>{if(id==='A')throw new Error('offline');return{activityId:id,qualifyingOrders:2,ownRewards:[]};});
  await screen.view.loadActivities();
  expect(screen.view.error.value).toBe(false);
  expect(screen.view.progressErrors.value.A).toBe(true);
  expect(screen.view.qualifyingCount('A')).toBe('-');
  expect(screen.view.qualifyingCount('B')).toBe(2);
  screen.referral.mockResolvedValueOnce({activityId:'A',qualifyingOrders:3,ownRewards:[]});
  await screen.view.loadProgress('A');
  expect(screen.view.qualifyingCount('A')).toBe(3);
  expect(screen.view.qualifyingCount('B')).toBe(2);
});

it('closes activity terms on account change with the associated private progress',async()=>{
  const screen=mount();await flush();
  screen.view.termsActivity.value={activityId:'A'};
  screen.app.accountBindingEpoch++;await flush();
  expect(screen.view.termsActivity.value).toBeNull();
});

it('shows the first qualifying purchase SKU and follows catalog replacements without borrowing a reward image',async()=>{
  const screen=mount();await flush();
  const activity={activityId:'A',version:1,rewardRules:[{productNo:'purchase',buyerReward:{type:'DEVICE',giftProductNo:'buyer-gift'},inviterReward:{type:'DEVICE',giftProductNo:'inviter-gift'}},{productNo:'other',inviterReward:{type:'DEVICE',giftProductNo:'other-gift'}}]} as PublicPromotion;
  screen.products['buyer-gift']={imageUrl:'https://images.example/buyer'};
  expect(screen.view.referralImageProps(activity)).toMatchObject({sku:'purchase',imageUrl:undefined});
  screen.products.purchase={imageUrl:'https://images.example/purchase'};
  expect(screen.view.referralImageProps(activity).imageUrl).toBe('https://images.example/purchase');
  activity.rewardRules[0].productNo='new-purchase';screen.products['new-purchase']={imageUrl:'https://images.example/changed'};
  expect(screen.view.referralImageProps(activity).imageUrl).toBe('https://images.example/changed');
  delete screen.products['new-purchase'].imageUrl;
  expect(screen.view.referralImageProps(activity)).toMatchObject({sku:'new-purchase',imageUrl:undefined});
  activity.rewardRules=[];expect(screen.view.referralImageProps(activity)).toMatchObject({sku:undefined,imageUrl:undefined});
  expect(source).not.toContain('first-purchase-v2.png');
});

it('refreshes the same purchase URL with progress retry and hides it when the catalog or account is unavailable',async()=>{
  const screen=mount();await flush();
  const activity={activityId:'A',version:1,rewardRules:[{productNo:'purchase',inviterReward:{type:'DEVICE',giftProductNo:'gift'}}]} as PublicPromotion;
  screen.products.purchase={imageUrl:'https://images.example/purchase'};
  const first=screen.view.referralImageProps(activity);
  await screen.view.loadProgress('A');expect(screen.view.referralImageProps(activity).refreshKey).toBe(first.refreshKey);
  screen.catalog.status='loading';expect(screen.view.referralImageProps(activity)).toEqual(first);
  screen.catalog.serverCanonical=false;expect(screen.view.referralImageProps(activity).imageUrl).toBeUndefined();screen.catalog.serverCanonical=true;
  screen.catalog.status='ready';await (screen.view.loadProgress as (id:string,refresh:boolean)=>Promise<void>)('A',true);
  const retry=screen.view.referralImageProps(activity);expect(retry.imageUrl).toBe(first.imageUrl);expect(retry.refreshKey).not.toBe(first.refreshKey);
  screen.catalog.status='error';expect(screen.view.referralImageProps(activity).imageUrl).toBeUndefined();
  screen.catalog.status='ready';screen.auth.isAuthenticated=false;expect(screen.view.referralImageProps(activity).imageUrl).toBeUndefined();
});
