import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { compile } from '@vue/compiler-dom';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import source from './index.vue?raw';
import { createPromotionReadFence,isPromotionActive } from '@/lib/promotion-entry';
import { deriveHomeTaskCards } from '@/lib/home-task-carousel';
import { promotionZH, promotionEN, promotionVI } from '@/i18n/messages/promotion';
import type { PublicPromotion, PublicPromotionPage } from '@/api/promotion-contracts';

// Execute the production page's request lifecycle and compile its actual carousel.
const requestCode = ts.transpileModule(source.slice(source.indexOf('const homePromotions ='), source.indexOf('// PC 端更新任务配置')), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const carouselStart = source.lastIndexOf('<view', source.indexOf('id="home-task-carousel"'));
const render = new Function('Vue', compile(source.slice(carouselStart, source.indexOf('<LiveFeedCard />')).trim(), { mode: 'function', prefixIdentifiers: true,
  isCustomElement: tag => ['view', 'text', 'swiper', 'swiper-item'].includes(tag) }).code)(Vue);
type View = {
  homePromotions: Vue.Ref<PublicPromotion[]>;
  homePromotionStatus: Vue.Ref<'idle' | 'loading' | 'ready' | 'error'>;
  refreshHomePromotions(): Promise<void>;
};
const page = (ids: string[]): PublicPromotionPage => ({ items: ids.map(activityId => ({ activityId,state:'ACTIVE' } as PublicPromotion)), nextCursor: null, hasMore: false });
function deferred() {
  let resolve!: (value: PublicPromotionPage) => void, reject!: (error: Error) => void;
  const promise = new Promise<PublicPromotionPage>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { await Promise.resolve(); await Vue.nextTick(); await Promise.resolve(); };
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));
function find(node: Vue.VNode, className: string): Vue.VNode | undefined {
  if (String(node.props?.class ?? '').split(/\s+/).includes(className)) return node;
  if (Array.isArray(node.children)) for (const child of node.children) if (Vue.isVNode(child)) {
    const found = find(child, className); if (found) return found;
  }
}
function mount(copy = promotionZH) {
  const app = Vue.reactive({ accountKey: 'user:7', accountBindingEpoch: 1 }), locale = Vue.reactive({ code: 'zh' });
  const list = vi.fn<(...args: unknown[]) => Promise<PublicPromotionPage>>().mockResolvedValue(page([]));
  const shown: Array<() => void> = [], hidden: Array<() => void> = [];
  const dependencies = { ref: Vue.ref, watch: Vue.watch, app, locale, remoteApiEnabled: true,
    promotionApi: { list }, sessionVault: { read: () => ({ user: { userId: app.accountKey } }) }, createPromotionReadFence,isPromotionActive,
    onShow: (callback: () => void) => shown.push(callback), onHide: (callback: () => void) => hidden.push(callback) };
  const scope = Vue.effectScope();
  const view = scope.run(() => new Function('deps', `const {${Object.keys(dependencies).join(',')}}=deps;${requestCode};return {homePromotions,homePromotionStatus,refreshHomePromotions};`)(dependencies)) as View;
  cleanups.push(() => { hidden.forEach(callback => callback()); scope.stop(); });
  const cards = Vue.computed(() => deriveHomeTaskCards(false, { homeNewcomerTasksEnabled: false, homeWeeklyPromoEnabled: false }, view.homePromotions.value.map(activity => activity.activityId)));
  const noOp = () => {};
  const context = Vue.proxyRefs({ ...view, visibleTaskCards: cards, hasTaskCarousel: false,
    t: { promotion: copy, home: { taskCarouselLabel: 'Tasks' } }, taskCardSignature: '', taskCarouselHeight: 184,
    taskSlide: 0, shouldAutoplay: false, TASK_CAROUSEL_INTERVAL_MS: 5000, taskCarouselAnnouncement: '', newcomerExpanded: false,
    onTaskFocusIn: noOp, onTaskFocusOut: noOp, onTaskCarouselKeydown: noOp, onTaskSlideChange: noOp, onTaskTouchStart: noOp,
    onTaskTouchMove: noOp, resetTaskTouch: noOp, taskCardTitle: noOp, onNewcomerExpandedChange: noOp, onNewcomerContentResize: noOp });
  const passthrough = Vue.defineComponent({ setup: (_props, { slots }) => () => Vue.h('view', slots.default?.()) });
  let rendered!: Vue.VNode;
  async function html() {
    return renderToString(Vue.createSSRApp({ components: { PromotionAction: passthrough, PromotionEntry: passthrough,
      DayOneQuestCard: passthrough, ConversionBanner: passthrough }, render: () => { rendered = render(context, []); return rendered; } }));
  }
  const retry = () => { const action = find(rendered, 'home-promotion-retry'); expect(action).toBeDefined(); return action!.props!.onClick() as Promise<void>; };
  return { view, app, locale, list, cards, html, retry, rendered: () => rendered,
    hide: () => hidden.forEach(callback => callback()), show: () => shown.forEach(callback => callback()) };
}

it.each([promotionZH, promotionEN, promotionVI])('distinguishes failed reads from successful empty home activities in every language', async copy => {
  const screen = mount(copy); screen.list.mockRejectedValueOnce(new Error('unavailable'));
  await screen.view.refreshHomePromotions();
  const failed = await screen.html();
  expect(screen.cards.value).toEqual([]); expect(screen.view.homePromotionStatus.value).toBe('error');
  expect(failed).toContain('role="alert"'); expect(failed).toContain(copy.activityBadge); expect(failed).toContain(copy.error); expect(failed).toContain(copy.retry);
  screen.list.mockResolvedValueOnce(page([])); await screen.retry();
  expect(screen.view.homePromotionStatus.value).toBe('ready'); expect(await screen.html()).not.toContain('home-task-carousel');
});

it('the real retry handler disables duplicate reads and restores only returned promotion IDs', async () => {
  const screen = mount(); screen.list.mockRejectedValueOnce(new Error('unavailable'));
  await screen.view.refreshHomePromotions(); await screen.html();
  const recovery = deferred(); screen.list.mockReturnValueOnce(recovery.promise);
  const retry = screen.retry(); await screen.html();
  expect(find(screen.rendered(), 'home-promotion-status')?.props?.['aria-busy']).toBe(true);
  expect(find(screen.rendered(), 'home-promotion-retry')?.props).toMatchObject({ 'aria-disabled': true, tabindex: -1 });
  await screen.retry(); expect(screen.list).toHaveBeenCalledTimes(2);
  recovery.resolve(page(['verified-home-activity'])); await retry;
  expect(screen.list).toHaveBeenLastCalledWith({ limit: 20, placement: 'home.purchase-promotion' }, true);
  expect(screen.cards.value).toEqual(['promotion:verified-home-activity']); expect(screen.view.homePromotionStatus.value).toBe('ready');
  expect(await screen.html()).not.toContain('home-promotion-status');
});

it('old account epoch failure cannot replace a new identity result or hold its request', async () => {
  const screen = mount(), stale = deferred(); screen.list.mockReturnValueOnce(stale.promise);
  const oldRead = screen.view.refreshHomePromotions();
  screen.list.mockResolvedValueOnce(page(['new-account-activity'])); screen.app.accountBindingEpoch++;
  await flush(); expect(screen.list).toHaveBeenCalledTimes(2);
  stale.reject(new Error('old-identity-unavailable')); await oldRead;
  expect(screen.view.homePromotionStatus.value).toBe('ready'); expect(screen.cards.value).toEqual(['promotion:new-account-activity']);
});

it('late locale success cannot overwrite the current failed read', async () => {
  const screen = mount(), stale = deferred(); screen.list.mockReturnValueOnce(stale.promise);
  const oldRead = screen.view.refreshHomePromotions();
  screen.list.mockRejectedValueOnce(new Error('current-locale-unavailable')); screen.locale.code = 'en'; await flush();
  stale.resolve(page(['old-locale-activity'])); await oldRead;
  expect(screen.list).toHaveBeenCalledTimes(2); expect(screen.view.homePromotionStatus.value).toBe('error'); expect(screen.cards.value).toEqual([]);
});

it('hidden reads are discarded and returning starts a fresh read even while the old read is pending', async () => {
  const screen = mount(), stale = deferred(); screen.list.mockReturnValueOnce(stale.promise);
  const oldRead = screen.view.refreshHomePromotions(); screen.hide();
  screen.app.accountKey = 'user:8'; await flush(); expect(screen.list).toHaveBeenCalledOnce();
  screen.list.mockResolvedValueOnce(page(['returned-activity'])); screen.show(); await flush();
  stale.resolve(page(['hidden-activity'])); await oldRead;
  expect(screen.list).toHaveBeenCalledTimes(2); expect(screen.view.homePromotionStatus.value).toBe('ready'); expect(screen.cards.value).toEqual(['promotion:returned-activity']);
});

it('a mixed server list cannot put inactive activity IDs into the home carousel or retain them during refresh',async()=>{
  const screen=mount();
  screen.list.mockResolvedValueOnce({...page([]),items:[{activityId:'live',state:'ACTIVE',eligibility:'INELIGIBLE'},{activityId:'closed',state:'PAUSED'}] as PublicPromotion[]});
  await screen.view.refreshHomePromotions();
  expect(screen.cards.value).toEqual(['promotion:live']);
  const reread=deferred();screen.list.mockReturnValueOnce(reread.promise);
  const read=screen.view.refreshHomePromotions();expect(screen.cards.value).toEqual([]);
  reread.reject(new Error('unavailable'));await read;expect(screen.cards.value).toEqual([]);
});
